import { NextResponse } from "next/server";

// Süper Lig standings: ESPN's public tur.1 endpoint.
//
// Beşiktaş last/next match: we try several sources in parallel and take the
// first one that yields *both* a last and a next match:
//   1. ESPN's /teams/{id}/schedule per league (the most reliable source —
//      per-team, per-league, no date-range guessing).
//   2. SofaScore /team/3050/events/last|next, which covers every competition.
//      Often Cloudflare-blocked from cloud egress IPs but worth a try.
//   3. TheSportsDB v1 eventslast/eventsnext (free, no auth, cloud-friendly).
//   4. ESPN's date-ranged scoreboard sweep as a final fallback.
//
// Beşiktaş ESPN team id = 1895 (was 767 before — 767 is a different team
// entirely, which is why the ESPN schedule path returned nothing for so
// long). SofaScore id = 3050.

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const ESPN_BESIKTAS_ID = 1895;
const SOFASCORE_BESIKTAS_ID = 3050;
const SPORTSDB_BESIKTAS_ID = "133611";

const BESIKTAS_NAMES = ["beşiktaş", "besiktas"];
function isBesiktas(s: string | undefined | null): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  return BESIKTAS_NAMES.some((n) => lower.includes(n));
}

// General team-name matcher so we can resolve last/next fixtures for ANY
// Süper Lig team the user picks, not just Beşiktaş. Normalises accents and
// strips common club suffixes, then matches on equality, containment, or a
// shared significant token.
function normalizeTeam(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(jk|sk|fk|as|fc|kulubu|futbol)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
type TeamMatcher = (name: string | null | undefined) => boolean;
function makeTeamMatcher(teamName: string): TeamMatcher {
  const target = normalizeTeam(teamName);
  const targetTokens = target.split(/\s+/).filter((t) => t.length >= 4);
  return (name) => {
    if (!name) return false;
    const n = normalizeTeam(name);
    if (!n) return false;
    if (n === target) return true;
    if (target && (n.includes(target) || target.includes(n))) return true;
    const nTokens = n.split(/\s+/).filter((t) => t.length >= 4);
    return targetTokens.some((t) => nTokens.includes(t));
  };
}

export interface Standing {
  rank: number;
  team: string;
  teamId: string;
  badge: string | null;
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form: string | null;
}

export interface Match {
  id: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  date: string;
  venue: string | null;
  league: string | null;
  isFinished: boolean;
}

interface EspnStandingStat { name?: string; value?: number; displayValue?: string }
interface EspnTeamLogo { href?: string }
interface EspnStandingEntry {
  team?: { id?: string; displayName?: string; shortDisplayName?: string; logos?: EspnTeamLogo[] };
  stats?: EspnStandingStat[];
}
interface EspnStandingsResp {
  children?: { name?: string; standings?: { entries?: EspnStandingEntry[] } }[];
}

interface EspnScoreLike { value?: number; displayValue?: string }
interface EspnCompetitor {
  homeAway?: "home" | "away";
  team?: { displayName?: string; shortDisplayName?: string; abbreviation?: string };
  // ESPN's score field shape varies by endpoint: scoreboard returns a string,
  // schedule sometimes returns an object {value,displayValue}.
  score?: string | number | EspnScoreLike;
}
interface EspnCompetition {
  competitors?: EspnCompetitor[];
  status?: { type?: { completed?: boolean; state?: string } };
  venue?: { fullName?: string };
}
interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  competitions?: EspnCompetition[];
  league?: { name?: string; abbreviation?: string };
}
interface EspnScoreboardResp {
  events?: EspnEvent[];
  leagues?: { name?: string }[];
  season?: { year?: number };
}

async function jsonFetch<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...headers },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function parseEspnScore(s: EspnCompetitor["score"]): number | null {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  if (typeof s === "string") {
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof s.value === "number") return s.value;
  if (typeof s.displayValue === "string") {
    const n = Number(s.displayValue);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function statBy(stats: EspnStandingStat[] | undefined, name: string): number {
  if (!stats) return 0;
  const s = stats.find((x) => x.name === name);
  if (!s) return 0;
  if (typeof s.value === "number") return s.value;
  const n = Number(s.displayValue);
  return Number.isFinite(n) ? n : 0;
}

async function fetchStandings(): Promise<Standing[]> {
  const json = await jsonFetch<EspnStandingsResp>(
    "https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings",
  );
  const entries = json?.children?.[0]?.standings?.entries ?? [];
  return entries
    .map((e) => {
      const team = e.team;
      const rank = statBy(e.stats, "rank");
      const wins = statBy(e.stats, "wins");
      const losses = statBy(e.stats, "losses");
      const ties = statBy(e.stats, "ties");
      const gp = statBy(e.stats, "gamesPlayed");
      const gf = statBy(e.stats, "pointsFor");
      const ga = statBy(e.stats, "pointsAgainst");
      const gd = statBy(e.stats, "pointDifferential");
      const points = statBy(e.stats, "points");
      return {
        rank,
        team: team?.displayName ?? team?.shortDisplayName ?? "",
        teamId: team?.id ?? "",
        badge: team?.logos?.[0]?.href ?? null,
        played: gp,
        win: wins,
        draw: ties,
        loss: losses,
        gf,
        ga,
        gd,
        points,
        form: null,
      } satisfies Standing;
    })
    .filter((s) => s.team)
    .sort((a, b) => a.rank - b.rank);
}

const LEAGUE_LABELS: Record<string, string> = {
  "tur.1": "Süper Lig",
  "tur.cup": "Türkiye Kupası",
  "uefa.champions": "UCL",
  "uefa.champions_qual": "UCL Qual.",
  "uefa.europa": "Europa League",
  "uefa.europa.qual": "Europa Qual.",
  "uefa.europa_conf": "Conference",
  "uefa.europa_conf.qual": "Conference Qual.",
  // Pre-season / mid-season club friendlies. In the summer the league season
  // is over and Beşiktaş only plays these — without the slug ESPN returned
  // nothing and the card looked dead ("no past or upcoming matches").
  "club.friendly": "Friendly",
  "fifa.friendly.club": "Friendly",
};

const LEAGUE_SLUGS = Object.keys(LEAGUE_LABELS);

function eventToMatch(e: EspnEvent, league: string): Match | null {
  const c = e.competitions?.[0];
  if (!c) return null;
  const home = c.competitors?.find((x) => x.homeAway === "home");
  const away = c.competitors?.find((x) => x.homeAway === "away");
  if (!home?.team || !away?.team) return null;
  return {
    id: e.id ?? "",
    home: home.team.displayName ?? home.team.shortDisplayName ?? "",
    away: away.team.displayName ?? away.team.shortDisplayName ?? "",
    homeScore: parseEspnScore(home.score),
    awayScore: parseEspnScore(away.score),
    date: e.date ?? new Date().toISOString(),
    venue: c.venue?.fullName ?? null,
    league,
    isFinished: !!c.status?.type?.completed,
  };
}

// ----- Source 1: ESPN team-schedule per league ------------------------------

async function fetchEspnTeamSchedule(
  leagueSlug: string,
  teamId: number,
): Promise<Match[]> {
  const json = await jsonFetch<EspnScoreboardResp>(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/teams/${teamId}/schedule`,
  );
  const events = json?.events ?? [];
  const label = LEAGUE_LABELS[leagueSlug] ?? json?.leagues?.[0]?.name ?? leagueSlug;
  return events
    .map((e) => eventToMatch(e, label))
    .filter((m): m is Match => !!m);
}

async function fetchFromEspnTeamSchedule(
  espnId: number,
  matchesTeam: TeamMatcher,
): Promise<{ last: Match | null; next: Match | null }> {
  const all = await Promise.all(
    LEAGUE_SLUGS.map((slug) => fetchEspnTeamSchedule(slug, espnId)),
  );
  const seen = new Set<string>();
  const matches: Match[] = [];
  for (const bucket of all) {
    for (const m of bucket) {
      // Schedule endpoint sometimes echoes the team against itself in
      // pre/post-season exhibitions; require the team to actually appear.
      if (!matchesTeam(m.home) && !matchesTeam(m.away)) continue;
      if (m.id && seen.has(m.id)) continue;
      if (m.id) seen.add(m.id);
      matches.push(m);
    }
  }
  matches.sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const now = Date.now();
  let last: Match | null = null;
  let next: Match | null = null;
  for (const m of matches) {
    const t = +new Date(m.date);
    if (t <= now || m.isFinished) {
      last = m;
    } else if (!next) {
      next = m;
    }
  }
  return { last, next };
}

// ----- Source 2: SofaScore --------------------------------------------------

interface SofaTournament { name?: string; uniqueTournament?: { name?: string } }
interface SofaTeam { name?: string; shortName?: string }
interface SofaScore { current?: number; display?: number }
interface SofaEvent {
  id?: number;
  tournament?: SofaTournament;
  homeTeam?: SofaTeam;
  awayTeam?: SofaTeam;
  homeScore?: SofaScore;
  awayScore?: SofaScore;
  startTimestamp?: number;
  status?: { type?: string; description?: string };
}
interface SofaResp { events?: SofaEvent[] }

function sofaToMatch(e: SofaEvent): Match | null {
  const home = e.homeTeam?.name ?? e.homeTeam?.shortName;
  const away = e.awayTeam?.name ?? e.awayTeam?.shortName;
  if (!home || !away || !e.startTimestamp) return null;
  const date = new Date(e.startTimestamp * 1000).toISOString();
  const finished = e.status?.type === "finished";
  const hs = e.homeScore?.current ?? e.homeScore?.display ?? null;
  const as = e.awayScore?.current ?? e.awayScore?.display ?? null;
  return {
    id: String(e.id ?? ""),
    home,
    away,
    homeScore: typeof hs === "number" ? hs : null,
    awayScore: typeof as === "number" ? as : null,
    date,
    venue: null,
    league: e.tournament?.uniqueTournament?.name ?? e.tournament?.name ?? null,
    isFinished: finished,
  };
}

async function fetchFromSofaScore(): Promise<{ last: Match | null; next: Match | null }> {
  const headers = {
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.sofascore.com/",
    Origin: "https://www.sofascore.com",
  };
  const [lastResp, nextResp] = await Promise.all([
    jsonFetch<SofaResp>(
      `https://api.sofascore.com/api/v1/team/${SOFASCORE_BESIKTAS_ID}/events/last/0`,
      headers,
    ),
    jsonFetch<SofaResp>(
      `https://api.sofascore.com/api/v1/team/${SOFASCORE_BESIKTAS_ID}/events/next/0`,
      headers,
    ),
  ]);

  const lastEvents = (lastResp?.events ?? []).map(sofaToMatch).filter((m): m is Match => !!m);
  const nextEvents = (nextResp?.events ?? []).map(sofaToMatch).filter((m): m is Match => !!m);
  lastEvents.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  nextEvents.sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const now = Date.now();
  const last = [...lastEvents].reverse().find((m) => +new Date(m.date) <= now || m.isFinished) ?? null;
  const next = nextEvents.find((m) => +new Date(m.date) > now && !m.isFinished) ?? null;
  return { last, next };
}

// ----- Source 3: TheSportsDB v1 (free, no auth) -----------------------------

interface SportsDbEvent {
  idEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  dateEvent?: string;
  strTime?: string;
  strTimestamp?: string | null;
  strLeague?: string;
  strVenue?: string | null;
  strStatus?: string | null;
}
interface SportsDbResp { events?: SportsDbEvent[] | null; results?: SportsDbEvent[] | null }

function sportsDbToMatch(e: SportsDbEvent, treatAsFinished: boolean): Match | null {
  const home = e.strHomeTeam;
  const away = e.strAwayTeam;
  if (!home || !away) return null;
  const iso = e.strTimestamp
    ? new Date(`${e.strTimestamp}Z`).toISOString()
    : e.dateEvent
      ? new Date(`${e.dateEvent}T${e.strTime ?? "00:00:00"}Z`).toISOString()
      : new Date().toISOString();
  const hs = e.intHomeScore != null && e.intHomeScore !== "" ? Number(e.intHomeScore) : null;
  const as = e.intAwayScore != null && e.intAwayScore !== "" ? Number(e.intAwayScore) : null;
  return {
    id: e.idEvent ?? "",
    home,
    away,
    homeScore: Number.isFinite(hs as number) ? (hs as number) : null,
    awayScore: Number.isFinite(as as number) ? (as as number) : null,
    date: iso,
    venue: e.strVenue ?? null,
    league: e.strLeague ?? null,
    isFinished: treatAsFinished,
  };
}

async function fetchFromSportsDb(): Promise<{ last: Match | null; next: Match | null }> {
  const [lastResp, nextResp] = await Promise.all([
    jsonFetch<SportsDbResp>(
      `https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${SPORTSDB_BESIKTAS_ID}`,
    ),
    jsonFetch<SportsDbResp>(
      `https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${SPORTSDB_BESIKTAS_ID}`,
    ),
  ]);

  const lastList = (lastResp?.results ?? lastResp?.events ?? [])
    .map((e) => sportsDbToMatch(e, true))
    .filter((m): m is Match => !!m)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const nextList = (nextResp?.events ?? [])
    .map((e) => sportsDbToMatch(e, false))
    .filter((m): m is Match => !!m)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const now = Date.now();
  const last = [...lastList].reverse().find((m) => +new Date(m.date) <= now) ?? lastList[lastList.length - 1] ?? null;
  const next = nextList.find((m) => +new Date(m.date) > now) ?? nextList[0] ?? null;
  return { last, next };
}

// ----- Source 4: ESPN scoreboard date-range sweep (last-resort) ------------

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; }

async function fetchEspnScoreboardSweep(matchesTeam: TeamMatcher): Promise<{ last: Match | null; next: Match | null }> {
  const now = new Date();
  // ESPN's scoreboard endpoint rejects (returns empty) ranges wider than
  // roughly 30 days. The previous 270-day window was silently returning
  // nothing. Narrow to 14d back / 30d forward — easily covers "last match"
  // and "next match" and stays inside ESPN's accepted range.
  const from = new Date(now.getTime() - 14 * 86400000);
  const to = new Date(now.getTime() + 30 * 86400000);
  const range = `${ymd(from)}-${ymd(to)}`;

  const buckets = await Promise.all(
    LEAGUE_SLUGS.map((slug) =>
      jsonFetch<EspnScoreboardResp>(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${range}`,
      ).then((j) =>
        (j?.events ?? []).map((e) => eventToMatch(e, LEAGUE_LABELS[slug] ?? slug)),
      ),
    ),
  );

  const seen = new Set<string>();
  const matches: Match[] = [];
  for (const bucket of buckets) {
    for (const m of bucket) {
      if (!m) continue;
      if (!matchesTeam(m.home) && !matchesTeam(m.away)) continue;
      if (m.id && seen.has(m.id)) continue;
      if (m.id) seen.add(m.id);
      matches.push(m);
    }
  }
  matches.sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const t0 = Date.now();
  let last: Match | null = null;
  let next: Match | null = null;
  for (const m of matches) {
    const t = +new Date(m.date);
    if (t <= t0 || m.isFinished) last = m;
    else if (!next) next = m;
  }
  return { last, next };
}

// ----- Source 5: FotMob (free, cloud-friendly) ------------------------------
//
// FotMob exposes a public team-info endpoint that includes a full fixtures
// list (past + future) without authentication. Beşiktaş is team 10188.

const FOTMOB_BESIKTAS_ID = 10188;

interface FotmobFixture {
  id?: number | string;
  home?: { id?: string | number; name?: string };
  away?: { id?: string | number; name?: string };
  status?: { utcTime?: string; finished?: boolean; cancelled?: boolean; started?: boolean; scoreStr?: string };
  tournament?: { name?: string; leagueName?: string };
  notStarted?: boolean;
  // Different FotMob payloads stash the kickoff time in different keys, so
  // we have to look in several places.
  utcTime?: string;
  startTime?: string;
  dateTime?: string;
  date?: string;
}
interface FotmobTeamResp {
  fixtures?: { allFixtures?: { fixtures?: FotmobFixture[] } };
}

function parseFotmobScore(scoreStr: string | undefined): { home: number | null; away: number | null } {
  if (!scoreStr) return { home: null, away: null };
  const m = scoreStr.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return { home: null, away: null };
  return { home: Number(m[1]), away: Number(m[2]) };
}

function fotmobFixtureDate(f: FotmobFixture): string | null {
  const candidates = [f.status?.utcTime, f.utcTime, f.startTime, f.dateTime, f.date];
  for (const c of candidates) {
    if (typeof c === "string" && c) {
      const d = new Date(c);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

function fotmobToMatch(f: FotmobFixture): Match | null {
  const home = f.home?.name;
  const away = f.away?.name;
  const date = fotmobFixtureDate(f);
  if (!home || !away || !date) return null;
  // Treat as finished if the status flag says so, OR if FotMob populated a
  // numeric score (some upcoming-fixture payloads omit `status.finished`).
  const { home: hs, away: as } = parseFotmobScore(f.status?.scoreStr);
  const finished = !!f.status?.finished || (hs !== null && as !== null);
  return {
    id: String(f.id ?? ""),
    home,
    away,
    homeScore: hs,
    awayScore: as,
    date,
    venue: null,
    league: f.tournament?.name ?? f.tournament?.leagueName ?? null,
    isFinished: finished,
  };
}

// HTML scrape of the FotMob team page. Their public API requires an
// anti-bot `x-mas` header that we can't reproduce from server-side, but the
// HTML at /teams/{id}/{tab}/{slug} embeds the same payload inside a
// __NEXT_DATA__ <script> tag — no auth needed. We pull from both the
// /overview/ page (recent + next) and the /fixtures/ page (full schedule)
// so upcoming matches don't get clipped when the overview only shows the
// most recent result.
async function fetchFromFotmobHtmlPage(tab: "overview" | "fixtures"): Promise<FotmobFixture[]> {
  try {
    const res = await fetch(
      `https://www.fotmob.com/teams/${FOTMOB_BESIKTAS_ID}/${tab}/besiktas`,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        next: { revalidate: 600 },
      },
    );
    if (!res.ok) return [];
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
    if (!m) return [];
    let data: unknown;
    try { data = JSON.parse(m[1]); } catch { return []; }
    type WithFixtures = {
      props?: {
        pageProps?: {
          team?: FotmobTeamResp;
          fixtures?: FotmobTeamResp["fixtures"];
          initialState?: { team?: FotmobTeamResp };
        };
      };
    };
    const d = data as WithFixtures;
    const fixtures =
      d?.props?.pageProps?.team?.fixtures?.allFixtures?.fixtures ??
      d?.props?.pageProps?.fixtures?.allFixtures?.fixtures ??
      d?.props?.pageProps?.initialState?.team?.fixtures?.allFixtures?.fixtures ??
      [];
    return Array.isArray(fixtures) ? fixtures : [];
  } catch {
    return [];
  }
}

async function fetchFromFotmobHtml(): Promise<{ last: Match | null; next: Match | null }> {
  const [overview, fixturesTab] = await Promise.all([
    fetchFromFotmobHtmlPage("overview"),
    fetchFromFotmobHtmlPage("fixtures"),
  ]);
  const seen = new Set<string>();
  const merged: FotmobFixture[] = [];
  for (const f of [...overview, ...fixturesTab]) {
    const key = String(f.id ?? `${f.home?.name}-${f.away?.name}-${fotmobFixtureDate(f)}`);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(f);
  }

  const matches = merged
    .map(fotmobToMatch)
    .filter((m): m is Match => !!m)
    .filter((m) => isBesiktas(m.home) || isBesiktas(m.away))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const now = Date.now();
  let last: Match | null = null;
  let next: Match | null = null;
  for (const match of matches) {
    const t = +new Date(match.date);
    if (t <= now || match.isFinished) last = match;
    else if (!next) next = match;
  }
  return { last, next };
}

async function fetchFromFotmob(): Promise<{ last: Match | null; next: Match | null }> {
  const json = await jsonFetch<FotmobTeamResp>(
    `https://www.fotmob.com/api/teams?id=${FOTMOB_BESIKTAS_ID}`,
    { Accept: "application/json", "Accept-Language": "en-US,en;q=0.9" },
  );
  const fixtures = json?.fixtures?.allFixtures?.fixtures ?? [];
  const matches = fixtures
    .map(fotmobToMatch)
    .filter((m): m is Match => !!m)
    .filter((m) => isBesiktas(m.home) || isBesiktas(m.away))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const now = Date.now();
  let last: Match | null = null;
  let next: Match | null = null;
  for (const m of matches) {
    const t = +new Date(m.date);
    if (t <= now || m.isFinished) last = m;
    else if (!next) next = m;
  }
  return { last, next };
}

// ----- Source 7: Wikipedia season-page scrape ------------------------------
//
// Wikipedia's English-language Beşiktaş season page lists every fixture in
// a structured wikitable. It's a) cloud-friendly (no anti-bot, no auth),
// b) updated very promptly after each match, and c) covers all competitions
// the team plays in. We use the MediaWiki parse API to get the rendered
// HTML, then regex out the fixture rows.

function currentBesiktasSeasonTitles(): string[] {
  // Süper Lig seasons span Aug→May. From August onward we're in the new
  // season; before that we're still in the previous one. Try the most-likely
  // title first, then fall back one season back. Wikipedia titles use an
  // en-dash and the 2-digit short year, e.g. "2025–26".
  const now = new Date();
  const y = now.getFullYear();
  const startsThisYear = now.getMonth() >= 6; // July or later
  const seasons: Array<[number, number]> = startsThisYear
    ? [[y, y + 1], [y - 1, y]]
    : [[y - 1, y], [y - 2, y - 1]];
  return seasons.map(([a, b]) => `${a}–${String(b).slice(-2)}_Beşiktaş_J.K._season`);
}

interface WikiParseResp {
  parse?: { text?: { "*"?: string } };
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#34;|&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function parseWikipediaFixtures(html: string): Match[] {
  // The fixture tables on the season page render each match row with a
  // <time datetime="..."> element for the kickoff date and three teams/score
  // <td> cells. Rather than parsing tables structurally we walk every <tr>
  // that contains a <time datetime=...> and extract the parts.
  const matches: Match[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    // Need a datetime — that's our signal it's a fixture row.
    const dt = /<time[^>]*datetime="([^"]+)"/i.exec(row);
    if (!dt) continue;
    const date = new Date(dt[1]);
    if (isNaN(date.getTime())) continue;

    // Pull all <td> cells in order. The schema for Beşiktaş season tables
    // typically goes: [date, home, score, away, venue, attendance, ...]
    const cellRe = /<td\b[^>]*>([\s\S]*?)<\/td>/g;
    const cells: string[] = [];
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(row)) !== null) cells.push(stripTags(c[1]));
    if (cells.length < 4) continue;

    // Locate the score cell — it's the one that's either "n–n" or "v"/"vs".
    let scoreIdx = -1;
    for (let i = 1; i < cells.length - 1; i++) {
      if (/^\s*\d+\s*[-–]\s*\d+\s*$/.test(cells[i]) || /^v(s\.?)?$/i.test(cells[i])) {
        scoreIdx = i;
        break;
      }
    }
    if (scoreIdx < 1) continue;
    const home = cells[scoreIdx - 1];
    const away = cells[scoreIdx + 1];
    if (!home || !away) continue;
    if (!isBesiktas(home) && !isBesiktas(away)) continue;

    const scoreText = cells[scoreIdx];
    const scoreMatch = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(scoreText);
    const homeScore = scoreMatch ? Number(scoreMatch[1]) : null;
    const awayScore = scoreMatch ? Number(scoreMatch[2]) : null;
    const finished = scoreMatch !== null;

    matches.push({
      id: `wiki-${dt[1]}-${home}-${away}`,
      home,
      away,
      homeScore,
      awayScore,
      date: date.toISOString(),
      venue: null,
      league: null, // Wikipedia rolls fixtures together; no per-row league.
      isFinished: finished,
    });
  }
  return matches;
}

async function fetchFromWikipedia(): Promise<{ last: Match | null; next: Match | null }> {
  for (const title of currentBesiktasSeasonTitles()) {
    try {
      const url =
        `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}` +
        `&format=json&prop=text&redirects=1&origin=*`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        next: { revalidate: 1800 }, // 30min
      });
      if (!res.ok) continue;
      const json = (await res.json()) as WikiParseResp;
      const html = json?.parse?.text?.["*"];
      if (!html) continue;

      const matches = parseWikipediaFixtures(html).sort(
        (a, b) => +new Date(a.date) - +new Date(b.date),
      );
      if (matches.length === 0) continue;

      const now = Date.now();
      let last: Match | null = null;
      let next: Match | null = null;
      for (const m of matches) {
        const t = +new Date(m.date);
        if (t <= now || m.isFinished) last = m;
        else if (!next) next = m;
      }
      if (last || next) return { last, next };
    } catch {
      // try next season title
    }
  }
  return { last: null, next: null };
}

interface SourceResult {
  name: string;
  last: Match | null;
  next: Match | null;
}

async function fetchTeamMatches(espnId: number, teamName: string): Promise<{
  last: Match | null;
  next: Match | null;
  source: string;
  debug: Array<{ source: string; last: string | null; next: string | null }>;
}> {
  // Run sources in parallel and merge: pick the most-recent past match
  // across sources for `last`, and the soonest future match for `next`.
  // ESPN (by team id) works for any club; the SofaScore / SportsDB /
  // FotMob / Wikipedia sources are keyed to Beşiktaş-specific ids, so they
  // only run when Beşiktaş — the default — is the selected team.
  const matcher = makeTeamMatcher(teamName);
  const sourcePromises: Promise<SourceResult>[] = [
    fetchFromEspnTeamSchedule(espnId, matcher).then((r) => ({ name: "espn-team", ...r })),
    fetchEspnScoreboardSweep(matcher).then((r) => ({ name: "espn-sweep", ...r })),
  ];
  if (isBesiktas(teamName)) {
    sourcePromises.push(
      fetchFromWikipedia().then((r) => ({ name: "wikipedia", ...r })),
      fetchFromFotmobHtml().then((r) => ({ name: "fotmob-html", ...r })),
      fetchFromSofaScore().then((r) => ({ name: "sofascore", ...r })),
      fetchFromSportsDb().then((r) => ({ name: "sportsdb", ...r })),
      fetchFromFotmob().then((r) => ({ name: "fotmob-api", ...r })),
    );
  }
  const sources: SourceResult[] = await Promise.all(sourcePromises);

  // A match is only valid for THIS team if the team's name actually appears
  // in it. Otherwise we end up surfacing another club's fixture (the
  // "Beşiktaş next match is showing some random teams match" bug — when
  // a team's season is over, SofaScore/SportsDB/Wikipedia sometimes echo
  // back a fixture they tagged to the same id slot for a different
  // competition / different team).
  const involvesTeam = (m: Match | null) => !!m && (matcher(m.home) || matcher(m.away));
  for (const s of sources) {
    if (!involvesTeam(s.last)) s.last = null;
    if (!involvesTeam(s.next)) s.next = null;
  }

  const now = Date.now();
  let last: Match | null = null;
  let lastSrc = "";
  let next: Match | null = null;
  let nextSrc = "";

  for (const s of sources) {
    if (s.last) {
      const t = +new Date(s.last.date);
      if (t <= now && (!last || t > +new Date(last.date))) {
        last = s.last;
        lastSrc = s.name;
      }
    }
    if (s.next) {
      const t = +new Date(s.next.date);
      if (t > now && (!next || t < +new Date(next.date))) {
        next = s.next;
        nextSrc = s.name;
      }
    }
  }

  // No "accept anything" fallback: every candidate was already validated
  // against the selected team above, so any remaining slot that's null
  // genuinely means "nothing scheduled for this team" — which is exactly
  // what the UI should say, instead of borrowing a different team's match.

  const fmtSummary = (m: Match | null) =>
    m ? `${m.date.slice(0, 10)} ${m.home} vs ${m.away}${m.isFinished ? " ✓" : ""}` : null;
  const debug = sources.map((s) => ({
    source: s.name,
    last: fmtSummary(s.last),
    next: fmtSummary(s.next),
  }));

  if (!last && !next) return { last: null, next: null, source: "none", debug };
  const source = lastSrc && nextSrc && lastSrc !== nextSrc
    ? `${lastSrc}+${nextSrc}`
    : lastSrc || nextSrc;
  return { last, next, source, debug };
}

async function fallbackStandingsFromSportsDb(): Promise<Standing[]> {
  const seasons = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const startsThisYear = now.getMonth() >= 6;
    return startsThisYear
      ? [`${y}-${y + 1}`, `${y - 1}-${y}`]
      : [`${y - 1}-${y}`, `${y - 2}-${y - 1}`];
  })();
  for (const s of seasons) {
    const json = await jsonFetch<{ table?: Array<{ intRank?: string; idTeam?: string; strTeam?: string; strBadge?: string; intPlayed?: string; intWin?: string; intLoss?: string; intDraw?: string; intGoalsFor?: string; intGoalsAgainst?: string; intGoalDifference?: string; intPoints?: string }> }>(
      `https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=4339&s=${s}`,
    );
    const rows = json?.table ?? [];
    if (rows.length > 0) {
      return rows.map((r) => ({
        rank: Number(r.intRank ?? 0),
        team: r.strTeam ?? "",
        teamId: r.idTeam ?? "",
        badge: r.strBadge ?? null,
        played: Number(r.intPlayed ?? 0),
        win: Number(r.intWin ?? 0),
        draw: Number(r.intDraw ?? 0),
        loss: Number(r.intLoss ?? 0),
        gf: Number(r.intGoalsFor ?? 0),
        ga: Number(r.intGoalsAgainst ?? 0),
        gd: Number(r.intGoalDifference ?? 0),
        points: Number(r.intPoints ?? 0),
        form: null,
      }));
    }
  }
  return [];
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const teamName = sp.get("team")?.trim() || "Beşiktaş";
  const teamIdRaw = sp.get("teamId")?.trim();
  const espnId = teamIdRaw && /^\d+$/.test(teamIdRaw) ? Number(teamIdRaw) : ESPN_BESIKTAS_ID;

  const [standings, matches] = await Promise.all([
    fetchStandings(),
    fetchTeamMatches(espnId, teamName),
  ]);

  const finalStandings = standings.length > 0 ? standings : await fallbackStandingsFromSportsDb();

  return NextResponse.json({
    source: standings.length > 0 ? "espn" : "thesportsdb",
    team: teamName,
    matchesSource: matches.source,
    matchesDebug: matches.debug,
    standings: finalStandings,
    last: matches.last,
    next: matches.next,
  });
}
