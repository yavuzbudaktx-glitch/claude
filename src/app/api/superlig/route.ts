import { NextResponse } from "next/server";

// Süper Lig standings: ESPN's public tur.1 endpoint (used by espn.com itself).
// Beşiktaş last/next match: SofaScore as primary because it consistently has
//   the most up-to-date fixtures across every competition Beşiktaş plays in
//   (Süper Lig + Turkish Cup + UEFA). Falls back to ESPN's per-league
//   scoreboards if SofaScore returns nothing (e.g. if it's IP-blocked from
//   our region).

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

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

interface EspnCompetitor {
  homeAway?: "home" | "away";
  team?: { displayName?: string; shortDisplayName?: string; abbreviation?: string };
  score?: string;
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
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
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

// ----- SofaScore -------------------------------------------------------------

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

const SOFASCORE_BESIKTAS_ID = 3050; // sofascore.com/team/football/besiktas/3050

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

async function fetchSofaLastNext(): Promise<{ last: Match | null; next: Match | null }> {
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

  // SofaScore returns "last" oldest-to-newest; the most recent finished match
  // is at the end. "next" returns soonest-first.
  const lastEvents = (lastResp?.events ?? []).map(sofaToMatch).filter((m): m is Match => !!m);
  const nextEvents = (nextResp?.events ?? []).map(sofaToMatch).filter((m): m is Match => !!m);

  lastEvents.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  nextEvents.sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const now = Date.now();
  const last = [...lastEvents].reverse().find((m) => +new Date(m.date) <= now || m.isFinished) ?? null;
  const next = nextEvents.find((m) => +new Date(m.date) > now && !m.isFinished) ?? null;
  return { last, next };
}

// ----- ESPN fallback ---------------------------------------------------------

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; }

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

async function fetchScoreboardForLeague(
  leagueSlug: string,
  daysBack: number,
  daysForward: number,
): Promise<{ event: EspnEvent; league: string }[]> {
  const now = new Date();
  const from = new Date(now.getTime() - daysBack * 86400000);
  const to = new Date(now.getTime() + daysForward * 86400000);
  const range = `${ymd(from)}-${ymd(to)}`;
  const json = await jsonFetch<EspnScoreboardResp>(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/scoreboard?dates=${range}`,
  );
  const events = json?.events ?? [];
  const label = LEAGUE_LABELS[leagueSlug] ?? json?.leagues?.[0]?.name ?? leagueSlug;
  return events.map((event) => ({ event, league: label }));
}

function eventToMatch(e: EspnEvent, league: string): Match | null {
  const c = e.competitions?.[0];
  if (!c) return null;
  const home = c.competitors?.find((x) => x.homeAway === "home");
  const away = c.competitors?.find((x) => x.homeAway === "away");
  if (!home?.team || !away?.team) return null;
  const homeName = home.team.displayName ?? home.team.shortDisplayName ?? "";
  const awayName = away.team.displayName ?? away.team.shortDisplayName ?? "";
  const homeScore = home.score != null && home.score !== "" ? Number(home.score) : null;
  const awayScore = away.score != null && away.score !== "" ? Number(away.score) : null;
  return {
    id: e.id ?? "",
    home: homeName,
    away: awayName,
    homeScore: Number.isFinite(homeScore as number) ? (homeScore as number) : null,
    awayScore: Number.isFinite(awayScore as number) ? (awayScore as number) : null,
    date: e.date ?? new Date().toISOString(),
    venue: c.venue?.fullName ?? null,
    league,
    isFinished: !!c.status?.type?.completed,
  };
}

const BESIKTAS_LEAGUES = [
  "tur.1",
  "tur.cup",
  "uefa.champions",
  "uefa.champions_qual",
  "uefa.europa",
  "uefa.europa.qual",
  "uefa.europa_conf",
  "uefa.europa_conf.qual",
];

async function fetchEspnLastNext(): Promise<{ last: Match | null; next: Match | null }> {
  const buckets = await Promise.all(
    BESIKTAS_LEAGUES.map((slug) => fetchScoreboardForLeague(slug, 90, 180)),
  );
  const seen = new Set<string>();
  const matches: Match[] = [];
  for (const bucket of buckets) {
    for (const { event, league } of bucket) {
      const m = eventToMatch(event, league);
      if (!m) continue;
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

// SofaScore primary, ESPN fallback. We accept either source filling either
// slot — if Sofa gives us a "next" but no "last", we'll fall back to ESPN
// just for the missing one.
async function fetchBesiktasMatches(): Promise<{
  last: Match | null;
  next: Match | null;
  source: "sofascore" | "espn" | "mixed" | "none";
}> {
  const sofa = await fetchSofaLastNext();
  if (sofa.last && sofa.next) {
    return { ...sofa, source: "sofascore" };
  }
  const espn = await fetchEspnLastNext();
  const last = sofa.last ?? espn.last;
  const next = sofa.next ?? espn.next;
  if (!last && !next) return { last: null, next: null, source: "none" };
  if (sofa.last && !sofa.next) return { last, next, source: "mixed" };
  if (!sofa.last && sofa.next) return { last, next, source: "mixed" };
  return { last, next, source: "espn" };
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
