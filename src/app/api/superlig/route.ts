import { NextResponse } from "next/server";

// TheSportsDB free public key "3" — Turkish Süper Lig league id 4339, Beşiktaş id 133611.
const KEY = "3";
const LEAGUE_ID = "4339";
const BESIKTAS_ID = "133611";

export const revalidate = 1800; // 30 minutes

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
}

function currentSeasonCandidates(): string[] {
  const now = new Date();
  const y = now.getFullYear();
  const startsThisYear = now.getMonth() >= 6;
  const a = startsThisYear ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  const b = startsThisYear ? `${y - 1}-${y}` : `${y - 2}-${y - 1}`;
  return [a, b];
}

async function fetchTable(season: string): Promise<RawStanding[] | null> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/${KEY}/lookuptable.php?l=${LEAGUE_ID}&s=${season}`,
      { next: { revalidate: 1800 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { table?: RawStanding[] | null };
    return json.table ?? null;
  } catch {
    return null;
  }
}

async function fetchSeasonEvents(season: string): Promise<RawEvent[]> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/${KEY}/eventsseason.php?id=${LEAGUE_ID}&s=${season}`,
      { next: { revalidate: 1800 } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { events?: RawEvent[] | null };
    return json.events ?? [];
  } catch {
    return [];
  }
}

async function fetchTeamEvents(kind: "last" | "next"): Promise<RawEvent[]> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/${KEY}/events${kind}.php?id=${BESIKTAS_ID}`,
      { next: { revalidate: 1800 } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: RawEvent[] | null };
    return json.results ?? [];
  } catch {
    return [];
  }
}

function eventTimestamp(e: RawEvent): number {
  if (e.strTimestamp) {
    const ms = Date.parse(e.strTimestamp);
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

function mapEvent(e: RawEvent): Match {
  const date =
    e.strTimestamp ||
    (e.dateEvent ? `${e.dateEvent}T${e.strTime ?? "00:00:00"}Z` : new Date().toISOString());
  const hs = e.intHomeScore == null || e.intHomeScore === "" ? null : Number(e.intHomeScore);
  const as = e.intAwayScore == null || e.intAwayScore === "" ? null : Number(e.intAwayScore);
  return {
    id: e.idEvent ?? "",
    home: e.strHomeTeam ?? "",
    away: e.strAwayTeam ?? "",
    homeScore: Number.isFinite(hs as number) ? (hs as number) : null,
    awayScore: Number.isFinite(as as number) ? (as as number) : null,
    date,
    venue: e.strVenue ?? null,
    league: e.strLeague ?? null,
  };
}

function pickLastNext(events: RawEvent[]): { last: Match | null; next: Match | null } {
  const now = Date.now();
  const beskEvents = events
    .filter(isBesiktas)
    .map((e) => ({ e, ts: eventTimestamp(e) }))
    .filter((x) => x.ts > 0)
    .sort((a, b) => a.ts - b.ts);

  let last: RawEvent | null = null;
  let next: RawEvent | null = null;
  for (const { e, ts } of beskEvents) {
    if (ts <= now) last = e;
    else if (!next) next = e;
  }
  return {
    last: last ? mapEvent(last) : null,
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

  // Last / Next: try season events for both candidate seasons; fall back to
  // the eventslast/eventsnext team endpoints if season events are empty.
  let last: Match | null = null;
  let next: Match | null = null;
  for (const s of currentSeasonCandidates()) {
    const events = await fetchSeasonEvents(s);
    if (events.length > 0) {
      const picked = pickLastNext(events);
      last = last ?? picked.last;
      next = next ?? picked.next;
      if (last && next) break;
    }
  }
  if (!last) {
    const fallback = await fetchTeamEvents("last");
    if (fallback.length > 0) last = mapEvent(fallback[0]);
  }
  if (!next) {
    const fallback = await fetchTeamEvents("next");
    if (fallback.length > 0) next = mapEvent(fallback[0]);
  }

  return NextResponse.json({
    season: usedSeason,
    besiktasId: BESIKTAS_ID,
    standings,
    last,
    next,
  });
}
