"use client";

// Browser-side sports fetch, used as a FALLBACK when the server route comes
// back empty.
//
// WHY: the same pattern that fixed the Reddit feed. Our server routes run on
// Vercel, and when an upstream throttles or blocks that datacenter IP the card
// has nothing to show. ESPN's public `site.api.espn.com` endpoints answer
// simple cross-origin GETs, so the browser — on a residential IP — can read
// them directly. No key, no proxy.
//
// It must stay a SIMPLE request: no custom headers, or the browser sends a
// CORS preflight that ESPN won't answer.
//
// Everything returns null on any failure so the caller just keeps whatever the
// server gave it.

import { isBigUfcEvent } from "@/lib/ufc-events";

const ESPN = "https://site.api.espn.com/apis";

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; }

async function getJson<T>(url: string, ms = 7000): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ UFC --- */

interface EspnAthlete { id?: string; displayName?: string; fullName?: string; headshot?: { href?: string } }
interface EspnCompetitor { athlete?: EspnAthlete; winner?: boolean; record?: Array<{ summary?: string; displayValue?: string }> }
interface EspnComp {
  competitors?: EspnCompetitor[];
  status?: { type?: { completed?: boolean; description?: string } };
  type?: { text?: string };
  notes?: Array<{ headline?: string }>;
}
interface EspnEvent {
  id?: string; name?: string; shortName?: string; date?: string;
  competitions?: EspnComp[];
  status?: { type?: { completed?: boolean } };
}

export interface LiteFighter {
  name: string; headshot: string | null; headshotFallback: string | null;
  record: string | null; country: string | null; division: string | null;
  status: string | null; winner: boolean;
}
export interface LiteEvent {
  id: string; name: string; shortName: string; date: string; isFinished: boolean;
  fighterA: LiteFighter | null; fighterB: LiteFighter | null;
  method: string | null; weightClass: string | null;
}

function fighterOf(c: EspnCompetitor | undefined): LiteFighter | null {
  const a = c?.athlete;
  const name = a?.displayName || a?.fullName;
  if (!name) return null;
  return {
    name,
    headshot: a?.headshot?.href ?? (a?.id ? `https://a.espncdn.com/i/headshots/mma/players/full/${a.id}.png` : null),
    headshotFallback: a?.id ? `https://a.espncdn.com/i/headshots/mma/players/full/${a.id}.png` : null,
    record: c?.record?.[0]?.summary ?? c?.record?.[0]?.displayValue ?? null,
    country: null,
    division: null,
    status: null,
    winner: c?.winner === true,
  };
}

/**
 * Previous + upcoming UFC event, read straight from ESPN in the browser.
 * Only the main event is described — the same shape the card renders.
 */
export async function fetchUfcFromBrowser(): Promise<{ previous: LiteEvent | null; upcoming: LiteEvent | null } | null> {
  if (typeof window === "undefined") return null;
  const now = new Date();
  const from = ymd(new Date(now.getTime() - 120 * 86400000));
  const to = ymd(new Date(now.getTime() + 180 * 86400000));
  const json = await getJson<{ events?: EspnEvent[] }>(
    `${ESPN}/site/v2/sports/mma/ufc/scoreboard?dates=${from}-${to}`,
  );
  const raw = json?.events;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const events: LiteEvent[] = [];
  for (const e of raw) {
    if (!e?.id || !e.date) continue;
    // Numbered cards and the big specials only — same rule the server route
    // applies, from the same module, so the two paths can't disagree again.
    if (!isBigUfcEvent(e.name, e.shortName)) continue;
    // The main event is the LAST competition in ESPN's ordering.
    const comps = Array.isArray(e.competitions) ? e.competitions : [];
    const main = comps[comps.length - 1];
    const done = e.status?.type?.completed === true || main?.status?.type?.completed === true;
    events.push({
      id: e.id,
      name: e.name ?? e.shortName ?? "UFC",
      shortName: e.shortName ?? e.name ?? "UFC",
      date: e.date,
      isFinished: done,
      fighterA: fighterOf(main?.competitors?.[0]),
      fighterB: fighterOf(main?.competitors?.[1]),
      method: main?.status?.type?.description ?? null,
      weightClass: main?.type?.text ?? main?.notes?.[0]?.headline ?? null,
    });
  }
  if (events.length === 0) return null;

  events.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const t = now.getTime();
  const past = events.filter((e) => +new Date(e.date) <= t || e.isFinished);
  const future = events.filter((e) => !(+new Date(e.date) <= t || e.isFinished));
  return {
    previous: past[past.length - 1] ?? null,
    upcoming: future[0] ?? null,
  };
}

/* ------------------------------------------------------- SÜPER LIG -------- */

export interface LiteStanding {
  rank: number; team: string; teamId: string; badge: string | null;
  played: number; win: number; draw: number; loss: number;
  gf: number; ga: number; gd: number; points: number; form: string | null;
}
export interface LiteFixture {
  date: string; competition: string | null; home: string; away: string;
  homeScore: number | null; awayScore: number | null; venue: string | null;
  homeBadge: string | null; awayBadge: string | null;
  /** The card shows a score ONLY when this is true — without it every played
   *  match rendered as "vs" with the result hidden. */
  isFinished: boolean;
}

interface EspnStatVal { name?: string; abbreviation?: string; value?: number; displayValue?: string }
interface EspnStandingEntry {
  team?: { id?: string; displayName?: string; name?: string; logos?: Array<{ href?: string }> };
  stats?: EspnStatVal[];
  note?: { rank?: number };
}

function statOf(stats: EspnStatVal[] | undefined, ...keys: string[]): number {
  for (const k of keys) {
    const hit = stats?.find((s) => s.name === k || s.abbreviation === k);
    if (hit && typeof hit.value === "number") return hit.value;
    if (hit?.displayValue && !Number.isNaN(Number(hit.displayValue))) return Number(hit.displayValue);
  }
  return 0;
}

/** The Süper Lig table, read straight from ESPN in the browser. */
export async function fetchSuperLigStandingsFromBrowser(): Promise<LiteStanding[] | null> {
  if (typeof window === "undefined") return null;
  const json = await getJson<{ children?: Array<{ standings?: { entries?: EspnStandingEntry[] } }>; standings?: { entries?: EspnStandingEntry[] } }>(
    `${ESPN}/v2/sports/soccer/tur.1/standings`,
  );
  const entries = json?.standings?.entries ?? json?.children?.[0]?.standings?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const rows: LiteStanding[] = entries.map((e, i) => ({
    rank: e.note?.rank ?? statOf(e.stats, "rank") ?? i + 1,
    team: e.team?.displayName ?? e.team?.name ?? "",
    teamId: e.team?.id ?? "",
    badge: e.team?.logos?.[0]?.href ?? null,
    played: statOf(e.stats, "gamesPlayed", "GP"),
    win: statOf(e.stats, "wins", "W"),
    draw: statOf(e.stats, "ties", "D"),
    loss: statOf(e.stats, "losses", "L"),
    gf: statOf(e.stats, "pointsFor", "F"),
    ga: statOf(e.stats, "pointsAgainst", "A"),
    gd: statOf(e.stats, "pointDifferential", "GD"),
    points: statOf(e.stats, "points", "P", "PTS"),
    form: null,
  })).filter((r) => r.team);

  // ESPN doesn't always send an explicit rank — order by points then GD so the
  // table is never shown in arbitrary order.
  if (rows.every((r) => !r.rank)) {
    rows.sort((a, b) => b.points - a.points || b.gd - a.gd);
    rows.forEach((r, i) => { r.rank = i + 1; });
  } else {
    rows.sort((a, b) => a.rank - b.rank);
  }
  return rows;
}

interface EspnSchedEvent {
  date?: string;
  name?: string;
  competitions?: Array<{
    venue?: { fullName?: string };
    competitors?: Array<{
      homeAway?: string; score?: { value?: number; displayValue?: string } | string;
      team?: { displayName?: string; name?: string; logos?: Array<{ href?: string }> };
    }>;
    status?: { type?: { completed?: boolean } };
  }>;
  league?: { name?: string; abbreviation?: string };
  seasonType?: { name?: string };
}

function scoreOf(c: { score?: { value?: number; displayValue?: string } | string } | undefined): number | null {
  const sc = c?.score;
  if (typeof sc === "string") return sc === "" || Number.isNaN(Number(sc)) ? null : Number(sc);
  if (sc && typeof sc.value === "number") return sc.value;
  if (sc?.displayValue && !Number.isNaN(Number(sc.displayValue))) return Number(sc.displayValue);
  return null;
}

/**
 * A team's last and next fixture across the competitions ESPN lists, read in
 * the browser. `leagues` are ESPN soccer slugs; Beşiktaş plays in tur.1 plus
 * cups and Europe, so we sweep a few and merge.
 */
export async function fetchTeamFixturesFromBrowser(
  espnTeamId: number,
  leagues: string[] = ["tur.1", "uefa.europa", "uefa.europa.conf", "uefa.champions", "tur.cup"],
): Promise<{ last: LiteFixture | null; next: LiteFixture | null } | null> {
  if (typeof window === "undefined") return null;

  const all: Array<{ f: LiteFixture; done: boolean; t: number }> = [];
  const results = await Promise.all(
    leagues.map((lg) =>
      getJson<{ events?: EspnSchedEvent[] }>(
        `${ESPN}/site/v2/sports/soccer/${lg}/teams/${espnTeamId}/schedule`,
      ).then((j) => ({ lg, j })),
    ),
  );

  for (const { lg, j } of results) {
    for (const e of j?.events ?? []) {
      const comp = e.competitions?.[0];
      const cs = comp?.competitors ?? [];
      if (!e.date || cs.length < 2) continue;
      const home = cs.find((c) => c.homeAway === "home") ?? cs[0];
      const away = cs.find((c) => c.homeAway === "away") ?? cs[1];
      const hName = home?.team?.displayName ?? home?.team?.name ?? "";
      const aName = away?.team?.displayName ?? away?.team?.name ?? "";
      if (!hName || !aName) continue;
      all.push({
        f: {
          date: e.date,
          competition: e.league?.name ?? e.league?.abbreviation ?? lg,
          home: hName,
          away: aName,
          homeScore: scoreOf(home),
          awayScore: scoreOf(away),
          venue: comp?.venue?.fullName ?? null,
          homeBadge: home?.team?.logos?.[0]?.href ?? null,
          awayBadge: away?.team?.logos?.[0]?.href ?? null,
          isFinished: comp?.status?.type?.completed === true,
        },
        done: comp?.status?.type?.completed === true,
        t: +new Date(e.date),
      });
    }
  }
  if (all.length === 0) return null;

  const now = Date.now();
  all.sort((a, b) => a.t - b.t);
  let last: LiteFixture | null = null;
  let next: LiteFixture | null = null;
  for (const it of all) {
    if (it.done || it.t <= now) last = it.f;
    else if (!next) next = it.f;
  }
  return { last, next };
}

/* ---------------------------------------------------- TheSportsDB --------- */

// The Süper Lig route had Beşiktaş hardcoded as TheSportsDB id 133611, and the
// diagnostic proved that id is a DIFFERENT CLUB — asking for its next fixture
// returned "Norwich City vs West Bromwich Albion". Resolving the id by name
// instead means it can never silently point at the wrong team again.
const SDB = "https://www.thesportsdb.com/api/v1/json/3";
let sdbIdCache: Record<string, string | null> = {};

export async function resolveSportsDbTeamId(teamName: string): Promise<string | null> {
  if (teamName in sdbIdCache) return sdbIdCache[teamName];
  const j = await getJson<{ teams?: Array<{ idTeam?: string; strTeam?: string; strLeague?: string }> }>(
    `${SDB}/searchteams.php?t=${encodeURIComponent(teamName)}`,
  );
  const teams = j?.teams ?? [];
  // Prefer the one actually in the Turkish top flight — searching "Besiktas"
  // can also return basketball and other sections of the same club.
  const pick =
    teams.find((t) => /super lig|süper lig/i.test(t.strLeague ?? "")) ??
    teams[0];
  const id = pick?.idTeam ?? null;
  sdbIdCache = { ...sdbIdCache, [teamName]: id };
  return id;
}

/** Last + next fixture from TheSportsDB, by NAME. Covers friendlies and cups. */
export async function fetchSportsDbFixtures(teamName: string): Promise<{ last: LiteFixture | null; next: LiteFixture | null } | null> {
  const id = await resolveSportsDbTeamId(teamName);
  if (!id) return null;

  interface SdbEvent {
    strEvent?: string; strHomeTeam?: string; strAwayTeam?: string;
    intHomeScore?: string | null; intAwayScore?: string | null;
    strTimestamp?: string; dateEvent?: string; strTime?: string;
    strLeague?: string; strVenue?: string;
    strHomeTeamBadge?: string; strAwayTeamBadge?: string;
  }
  const toFixture = (e: SdbEvent): LiteFixture | null => {
    const home = e.strHomeTeam ?? "";
    const away = e.strAwayTeam ?? "";
    if (!home || !away) return null;
    const iso = e.strTimestamp
      ? e.strTimestamp.replace(" ", "T") + (e.strTimestamp.endsWith("Z") ? "" : "Z")
      : e.dateEvent
        ? `${e.dateEvent}T${(e.strTime ?? "00:00:00").slice(0, 8)}Z`
        : "";
    if (!iso) return null;
    const hs = e.intHomeScore == null || e.intHomeScore === "" ? null : Number(e.intHomeScore);
    const as = e.intAwayScore == null || e.intAwayScore === "" ? null : Number(e.intAwayScore);
    return {
      date: iso,
      competition: e.strLeague ?? null,
      home, away,
      homeScore: Number.isFinite(hs as number) ? (hs as number) : null,
      awayScore: Number.isFinite(as as number) ? (as as number) : null,
      venue: e.strVenue ?? null,
      homeBadge: e.strHomeTeamBadge ?? null,
      awayBadge: e.strAwayTeamBadge ?? null,
      // A fixture counts as played when it has a score, or when its kick-off is
      // in the past — TheSportsDB fills the scores in some minutes late.
      isFinished: (hs != null && as != null) || (iso ? Date.parse(iso) < Date.now() : false),
    };
  };

  const [lastJ, nextJ] = await Promise.all([
    getJson<{ results?: SdbEvent[] }>(`${SDB}/eventslast.php?id=${id}`),
    getJson<{ events?: SdbEvent[] }>(`${SDB}/eventsnext.php?id=${id}`),
  ]);
  // eventslast/eventsnext return up to five fixtures in no guaranteed order,
  // so sort rather than trusting index 0: newest for "last", soonest for "next".
  const lastList = (lastJ?.results ?? []).map(toFixture).filter((f): f is LiteFixture => !!f)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const nextList = (nextJ?.events ?? []).map(toFixture).filter((f): f is LiteFixture => !!f)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const last = lastList[0] ?? null;
  const next = nextList[0] ?? null;
  if (!last && !next) return null;
  return { last, next };
}
