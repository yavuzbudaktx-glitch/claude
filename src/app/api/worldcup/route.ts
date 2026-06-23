// 2026 FIFA World Cup — live data via ESPN's public soccer endpoint
// (`/apis/site/v2/sports/soccer/fifa.world`). No key needed. Returns:
//   - today's matches with live scores + clock
//   - the most recent finished matches (for context)
//   - upcoming matches in the next 3 days
//   - Türkiye's next match if she's still in
// Cached at the edge for 60 s so the live clock advances roughly every
// minute without hammering ESPN.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const revalidate = 60;

interface EspnCompetitor {
  team?: { id?: string; displayName?: string; abbreviation?: string; logo?: string };
  score?: string | number;
  winner?: boolean;
  homeAway?: "home" | "away";
}
interface EspnStatus {
  type?: { name?: string; state?: string; completed?: boolean; description?: string; shortDetail?: string };
  displayClock?: string;
  period?: number;
}
interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  competitions?: Array<{
    competitors?: EspnCompetitor[];
    status?: EspnStatus;
    venue?: { fullName?: string; address?: { city?: string; country?: string } };
    notes?: Array<{ headline?: string }>;
  }>;
}
interface EspnResp { events?: EspnEvent[]; leagues?: Array<{ name?: string }> }

interface OutMatch {
  id: string;
  status: "live" | "upcoming" | "final";
  state: string;           // ESPN's shortDetail, e.g. "65'" / "FT" / "Sat 7:00 PM"
  date: string;
  group?: string;          // "Group A" if known
  home: { name: string; abbr: string; logo: string; score: number | null; winner: boolean };
  away: { name: string; abbr: string; logo: string; score: number | null; winner: boolean };
  venue?: string;
}

function shape(e: EspnEvent): OutMatch | null {
  const comp = e.competitions?.[0];
  const cs = comp?.competitors ?? [];
  const home = cs.find((c) => c.homeAway === "home") ?? cs[0];
  const away = cs.find((c) => c.homeAway === "away") ?? cs[1];
  if (!home?.team || !away?.team || !e.id) return null;
  const st = comp?.status;
  const completed = !!st?.type?.completed;
  const stateName = (st?.type?.state ?? "").toLowerCase();
  const status: OutMatch["status"] =
    completed ? "final" : (stateName === "in" ? "live" : "upcoming");
  const group = comp?.notes?.find((n) => n.headline?.includes("Group"))?.headline;

  return {
    id: e.id,
    status,
    state: st?.type?.shortDetail ?? st?.type?.description ?? "",
    date: e.date ?? "",
    group,
    home: {
      name: home.team.displayName ?? "",
      abbr: home.team.abbreviation ?? "",
      logo: home.team.logo ?? "",
      score: home.score == null || home.score === "" ? null : Number(home.score),
      winner: !!home.winner,
    },
    away: {
      name: away.team.displayName ?? "",
      abbr: away.team.abbreviation ?? "",
      logo: away.team.logo ?? "",
      score: away.score == null || away.score === "" ? null : Number(away.score),
      winner: !!away.winner,
    },
    venue: comp?.venue?.fullName,
  };
}

function ymdUtc(d: Date): string {
  // ESPN's `dates=YYYYMMDD-YYYYMMDD` range only needs to span the matches we
  // care about — exact day boundaries here don't matter (the CLIENT does the
  // today/tomorrow bucketing in the user's own timezone, which is what fixes
  // the "thinks I'm in Turkey" wrong-bucket problem).
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function getJson(url: string): Promise<EspnResp | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "morning-dashboard/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as EspnResp;
  } catch { return null; }
}

export async function GET() {
  // ESPN's scoreboard accepts a date range. Pull a 5-day window centered
  // around "today" so we have live + recent + upcoming all in one shot.
  const now = new Date();
  const start = new Date(now.getTime() - 1 * 86400 * 1000);
  const end = new Date(now.getTime() + 4 * 86400 * 1000);
  const range = `${ymdUtc(start)}-${ymdUtc(end)}`;
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${range}`;
  const j = await getJson(url);
  const events = (j?.events ?? []).map(shape).filter((m): m is OutMatch => !!m);

  // We DON'T bucket today/tomorrow/finished here anymore — the server has
  // no idea what timezone the viewer is in (Vercel functions run in UTC and
  // ESPN was treating UTC midnight as the day flip, which was the actual
  // "thinks I'm in Turkey" symptom). The client now buckets in its own
  // timezone using the ISO `date` field on each match.
  const live = events.filter((m) => m.status === "live").sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = events.filter((m) => m.status === "upcoming").sort((a, b) => a.date.localeCompare(b.date));
  const finished = events.filter((m) => m.status === "final").sort((a, b) => b.date.localeCompare(a.date));

  // Türkiye watch — her next match across the whole window.
  const TURKEY = /turkey|türkiye/i;
  const turkiye = events.find((m) => m.status !== "final" && (TURKEY.test(m.home.name) || TURKEY.test(m.away.name)))
    ?? events.find((m) => TURKEY.test(m.home.name) || TURKEY.test(m.away.name))
    ?? null;

  return NextResponse.json(
    {
      tournament: j?.leagues?.[0]?.name ?? "FIFA World Cup",
      // `today` left as an empty array for back-compat with any cached
      // client; the new client computes today/upcoming itself from the
      // combined upcoming list below.
      live, today: [], upcoming, finished, turkiye,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
