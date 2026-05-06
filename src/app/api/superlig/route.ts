import { NextResponse } from "next/server";

// ESPN's unofficial public APIs (used by espn.com itself). Stable for years,
// no auth, returns JSON. Turkish Süper Lig is "tur.1".

export const revalidate = 600; // 10 minutes

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

async function jsonFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 600 },
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

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; }

async function fetchScoreboard(daysBack: number, daysForward: number): Promise<EspnEvent[]> {
  const now = new Date();
  const from = new Date(now.getTime() - daysBack * 86400000);
  const to = new Date(now.getTime() + daysForward * 86400000);
  const range = `${ymd(from)}-${ymd(to)}`;
  const json = await jsonFetch<EspnScoreboardResp>(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?dates=${range}`,
  );
  return json?.events ?? [];
}

function eventToMatch(e: EspnEvent): Match | null {
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
    league: "Süper Lig",
    isFinished: !!c.status?.type?.completed,
  };
}

async function fetchBesiktasMatches(): Promise<{ last: Match | null; next: Match | null }> {
  const events = await fetchScoreboard(120, 120);
  const matches = events
    .map(eventToMatch)
    .filter((m): m is Match => !!m && (isBesiktas(m.home) || isBesiktas(m.away)))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

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

// TheSportsDB legacy fallback (kept in case ESPN's response shape ever shifts)
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
    standings: finalStandings,
    last: matches.last,
    next: matches.next,
  });
}
