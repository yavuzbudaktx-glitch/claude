import { NextResponse } from "next/server";

// TheSportsDB free public key "3" — Turkish Süper Lig league id 4339, Beşiktaş id 133611.
const KEY = "3";
const LEAGUE_ID = "4339";
const BESIKTAS_ID = "133611";

export const revalidate = 900; // 15 minutes

interface RawStanding {
  idStanding?: string;
  intRank?: string;
  idTeam?: string;
  strTeam?: string;
  strBadge?: string;
  intPlayed?: string;
  intWin?: string;
  intLoss?: string;
  intDraw?: string;
  intGoalsFor?: string;
  intGoalsAgainst?: string;
  intGoalDifference?: string;
  intPoints?: string;
  strForm?: string;
  strSeason?: string;
}

interface RawEvent {
  idEvent?: string;
  strEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  dateEvent?: string;
  strTime?: string;
  strTimestamp?: string;
  strVenue?: string;
  strLeague?: string;
  idLeague?: string;
  strStatus?: string;
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

function currentSeasonCandidates(): string[] {
  const now = new Date();
  const y = now.getFullYear();
  const startsThisYear = now.getMonth() >= 6;
  const a = startsThisYear ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  const b = startsThisYear ? `${y - 1}-${y}` : `${y - 2}-${y - 1}`;
  const c = startsThisYear ? `${y - 2}-${y - 1}` : `${y - 3}-${y - 2}`;
  return [a, b, c];
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function jsonFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchTable(season: string): Promise<RawStanding[] | null> {
  const data = await jsonFetch<{ table?: RawStanding[] | null }>(
    `https://www.thesportsdb.com/api/v1/json/${KEY}/lookuptable.php?l=${LEAGUE_ID}&s=${season}`,
  );
  return data?.table ?? null;
}

async function fetchSeasonEvents(season: string): Promise<RawEvent[]> {
  const data = await jsonFetch<{ events?: RawEvent[] | null }>(
    `https://www.thesportsdb.com/api/v1/json/${KEY}/eventsseason.php?id=${LEAGUE_ID}&s=${season}`,
  );
  return data?.events ?? [];
}

async function fetchTeamLast(): Promise<RawEvent[]> {
  const data = await jsonFetch<{ results?: RawEvent[] | null }>(
    `https://www.thesportsdb.com/api/v1/json/${KEY}/eventslast.php?id=${BESIKTAS_ID}`,
  );
  return data?.results ?? [];
}

async function fetchTeamNext(): Promise<RawEvent[]> {
  const data = await jsonFetch<{ events?: RawEvent[] | null }>(
    `https://www.thesportsdb.com/api/v1/json/${KEY}/eventsnext.php?id=${BESIKTAS_ID}`,
  );
  return data?.events ?? [];
}

function eventTimestamp(e: RawEvent): number {
  if (e.strTimestamp) {
    const ms = Date.parse(e.strTimestamp.includes("Z") ? e.strTimestamp : e.strTimestamp + "Z");
    if (!Number.isNaN(ms)) return ms;
  }
  if (e.dateEvent) {
    const ms = Date.parse(`${e.dateEvent}T${e.strTime || "00:00:00"}Z`);
    if (!Number.isNaN(ms)) return ms;
  }
  return 0;
}

const BESIKTAS_NAMES = ["beşiktaş", "besiktas"];
function isBesiktas(e: RawEvent): boolean {
  if (e.idHomeTeam === BESIKTAS_ID || e.idAwayTeam === BESIKTAS_ID) return true;
  const h = (e.strHomeTeam ?? "").toLowerCase();
  const a = (e.strAwayTeam ?? "").toLowerCase();
  return BESIKTAS_NAMES.some((n) => h.includes(n) || a.includes(n));
}

function hasScore(e: RawEvent): boolean {
  return (
    e.intHomeScore != null && e.intHomeScore !== "" &&
    e.intAwayScore != null && e.intAwayScore !== ""
  );
}

function mapEvent(e: RawEvent): Match {
  const ts = eventTimestamp(e);
  const date =
    e.strTimestamp ||
    (e.dateEvent ? `${e.dateEvent}T${e.strTime ?? "00:00:00"}Z` : new Date().toISOString());
  const hs = e.intHomeScore == null || e.intHomeScore === "" ? null : Number(e.intHomeScore);
  const as = e.intAwayScore == null || e.intAwayScore === "" ? null : Number(e.intAwayScore);
  const finished =
    Number.isFinite(hs as number) && Number.isFinite(as as number) && ts > 0 && ts <= Date.now();
  return {
    id: e.idEvent ?? "",
    home: e.strHomeTeam ?? "",
    away: e.strAwayTeam ?? "",
    homeScore: Number.isFinite(hs as number) ? (hs as number) : null,
    awayScore: Number.isFinite(as as number) ? (as as number) : null,
    date,
    venue: e.strVenue ?? null,
    league: e.strLeague ?? null,
    isFinished: !!finished,
  };
}

function dedupe(events: RawEvent[]): RawEvent[] {
  const seen = new Set<string>();
  const out: RawEvent[] = [];
  for (const e of events) {
    const k = e.idEvent ?? `${e.dateEvent}|${e.strHomeTeam}|${e.strAwayTeam}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function pickLastAndNext(events: RawEvent[]): { last: Match | null; next: Match | null } {
  const now = Date.now();
  const annotated = events
    .filter(isBesiktas)
    .map((e) => ({ e, ts: eventTimestamp(e) }))
    .filter((x) => x.ts > 0)
    .sort((a, b) => a.ts - b.ts);

  // Last: most recent event with a final score; allow past-without-score as a fallback.
  let lastWithScore: RawEvent | null = null;
  let lastAny: RawEvent | null = null;
  for (const { e, ts } of annotated) {
    if (ts <= now) {
      lastAny = e;
      if (hasScore(e)) lastWithScore = e;
    }
  }
  // Next: earliest future event.
  let next: RawEvent | null = null;
  for (const { e, ts } of annotated) {
    if (ts > now) {
      next = e;
      break;
    }
  }

  return {
    last: (lastWithScore ?? lastAny) ? mapEvent(lastWithScore ?? lastAny!) : null,
    next: next ? mapEvent(next) : null,
  };
}

export async function GET() {
  // Standings
  let table: RawStanding[] | null = null;
  let usedSeason = "";
  for (const s of currentSeasonCandidates()) {
    const t = await fetchTable(s);
    if (t && t.length > 0) {
      table = t;
      usedSeason = s;
      break;
    }
  }

  const standings: Standing[] = (table ?? []).map((r) => ({
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
    form: r.strForm ?? null,
  }));

  // Pull from every available source, dedupe, then compute last/next once.
  // Order: team-specific endpoints first (highest signal), then league-season
  // for each candidate season.
  const [teamLast, teamNext] = await Promise.all([fetchTeamLast(), fetchTeamNext()]);
  const seasonResults = await Promise.all(
    currentSeasonCandidates().map((s) => fetchSeasonEvents(s)),
  );
  const allEvents = dedupe([...teamLast, ...teamNext, ...seasonResults.flat()]);
  const { last, next } = pickLastAndNext(allEvents);

  return NextResponse.json({
    season: usedSeason,
    besiktasId: BESIKTAS_ID,
    standings,
    last,
    next,
  });
}
