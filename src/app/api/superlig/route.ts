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
};

const BESIKTAS_LEAGUES = Object.keys(LEAGUE_LABELS);

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

async function fetchFromEspnTeamSchedule(): Promise<{ last: Match | null; next: Match | null }> {
  const all = await Promise.all(
    BESIKTAS_LEAGUES.map((slug) => fetchEspnTeamSchedule(slug, ESPN_BESIKTAS_ID)),
  );
  const seen = new Set<string>();
  const matches: Match[] = [];
  for (const bucket of all) {
    for (const m of bucket) {
      // Schedule endpoint sometimes echoes Beşiktaş against itself in
      // pre/post-season exhibitions; require the team to actually appear.
      if (!isBesiktas(m.home) && !isBesiktas(m.away)) continue;
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

async function fetchEspnScoreboardSweep(): Promise<{ last: Match | null; next: Match | null }> {
  const now = new Date();
  const from = new Date(now.getTime() - 90 * 86400000);
  const to = new Date(now.getTime() + 180 * 86400000);
  const range = `${ymd(from)}-${ymd(to)}`;

  const buckets = await Promise.all(
    BESIKTAS_LEAGUES.map((slug) =>
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
      if (!isBesiktas(m.home) && !isBesiktas(m.away)) continue;
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

async function fetchBesiktasMatches(): Promise<{
  last: Match | null;
  next: Match | null;
  source: string;
}> {
  // Run all four sources in parallel and merge: pick the most-recent past
  // match across sources for `last`, and the soonest future match across
  // sources for `next`. Source-priority alone causes stale ESPN data to win
  // even when SofaScore / TheSportsDB have a fresher match.
  const sources = await Promise.all([
    fetchFromEspnTeamSchedule().then((r) => ({ name: "espn-team", ...r })),
    fetchFromSofaScore().then((r) => ({ name: "sofascore", ...r })),
    fetchFromSportsDb().then((r) => ({ name: "sportsdb", ...r })),
    fetchEspnScoreboardSweep().then((r) => ({ name: "espn-sweep", ...r })),
  ]);

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

  // Fallback: if a slot is still empty, accept anything any source returned
  // (e.g. SofaScore's "last" containing a fixture flagged as not-finished but
  // already in the past).
  if (!last) {
    for (const s of sources) {
      if (s.last) { last = s.last; lastSrc = s.name; break; }
    }
  }
  if (!next) {
    for (const s of sources) {
      if (s.next) { next = s.next; nextSrc = s.name; break; }
    }
  }

  if (!last && !next) return { last: null, next: null, source: "none" };
  const source = lastSrc && nextSrc && lastSrc !== nextSrc
    ? `${lastSrc}+${nextSrc}`
    : lastSrc || nextSrc;
  return { last, next, source };
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

export async function GET() {
  const [standings, matches] = await Promise.all([
    fetchStandings(),
    fetchBesiktasMatches(),
  ]);

  const finalStandings = standings.length > 0 ? standings : await fallbackStandingsFromSportsDb();

  return NextResponse.json({
    source: standings.length > 0 ? "espn" : "thesportsdb",
    matchesSource: matches.source,
    standings: finalStandings,
    last: matches.last,
    next: matches.next,
  });
}
