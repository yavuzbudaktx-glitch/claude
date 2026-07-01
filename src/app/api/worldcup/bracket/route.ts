// 2026 FIFA World Cup — knockout BRACKET via ESPN's public scoreboard.
// No key needed. We pull the tournament's match list across the summer window
// and keep only the knockout rounds (Round of 32 → Final), grouped into
// ordered rounds so the client can render a bracket. Group-stage matches are
// dropped here (they belong to the group standings, not the bracket).

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;
export const revalidate = 300;

interface EspnCompetitor {
  team?: { id?: string; displayName?: string; shortDisplayName?: string; abbreviation?: string; logo?: string };
  score?: string | number;
  winner?: boolean;
  homeAway?: "home" | "away";
}
interface EspnEvent {
  id?: string;
  date?: string;
  shortName?: string;
  competitions?: Array<{
    competitors?: EspnCompetitor[];
    status?: { type?: { state?: string; completed?: boolean; shortDetail?: string; description?: string } };
    notes?: Array<{ headline?: string }>;
    type?: { text?: string; abbreviation?: string };
  }>;
  season?: { type?: { name?: string } };
}
interface EspnResp { events?: EspnEvent[] }

interface Team { name: string; abbr: string; logo: string; score: number | null; winner: boolean; placeholder: boolean }
interface Match {
  id: string;
  status: "live" | "upcoming" | "final";
  state: string;
  date: string;
  home: Team; away: Team;
  round: string;
}
interface Round { name: string; matches: Match[] }

// The knockout rounds, in bracket order. "Third Place" is rendered alongside
// the Final by the client.
const ROUND_ORDER = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Third Place", "Final"];

function normalizeRound(text: string): string | null {
  const s = text.toLowerCase();
  if (/round of 32|last 32/.test(s)) return "Round of 32";
  if (/round of 16|last 16/.test(s)) return "Round of 16";
  if (/quarter/.test(s)) return "Quarterfinals";
  if (/semi/.test(s)) return "Semifinals";
  if (/third place|3rd place|third-place/.test(s)) return "Third Place";
  if (/\bfinal\b/.test(s)) return "Final";  // after semi/quarter checks
  return null;
}

// A competitor is a placeholder when it has no real team id (ESPN uses "TBD"
// or a group-winner descriptor before the bracket fills in).
function shapeTeam(c: EspnCompetitor | undefined): Team {
  const t = c?.team;
  const name = t?.displayName || t?.shortDisplayName || "";
  const id = t?.id ?? "";
  const placeholder = !id || !name || /^tbd$/i.test(name);
  return {
    name: placeholder ? (name || "TBD") : name,
    abbr: t?.abbreviation ?? "",
    logo: t?.logo ?? "",
    score: c?.score == null || c?.score === "" ? null : Number(c.score),
    winner: !!c?.winner,
    placeholder,
  };
}

function shape(e: EspnEvent): { m: Match; round: string } | null {
  const comp = e.competitions?.[0];
  if (!comp || !e.id) return null;
  // Find the round from the competition notes / type / season type.
  const candidates = [
    ...(comp.notes ?? []).map((n) => n.headline ?? ""),
    comp.type?.text ?? "",
    e.season?.type?.name ?? "",
    e.shortName ?? "",
  ];
  let round: string | null = null;
  for (const c of candidates) {
    const r = c ? normalizeRound(c) : null;
    if (r) { round = r; break; }
  }
  if (!round) return null; // group-stage or unknown → not part of the bracket

  const cs = comp.competitors ?? [];
  const home = cs.find((c) => c.homeAway === "home") ?? cs[0];
  const away = cs.find((c) => c.homeAway === "away") ?? cs[1];
  const st = comp.status?.type;
  const status: Match["status"] = st?.completed ? "final" : ((st?.state ?? "") === "in" ? "live" : "upcoming");
  return {
    round,
    m: {
      id: e.id,
      status,
      state: st?.shortDetail ?? st?.description ?? "",
      date: e.date ?? "",
      home: shapeTeam(home),
      away: shapeTeam(away),
      round,
    },
  };
}

async function getEvents(range: string): Promise<EspnEvent[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${range}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "morning-dashboard/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (!r.ok) return [];
    const j = (await r.json()) as EspnResp;
    return j.events ?? [];
  } catch { return []; }
}

export async function GET() {
  // Pull the whole June–July window (the World Cup runs across it). Two calls
  // — one per month — so a single response's event cap can't drop the later
  // knockout matches.
  const year = new Date().getFullYear();
  const [jun, jul] = await Promise.all([
    getEvents(`${year}0601-${year}0630`),
    getEvents(`${year}0701-${year}0731`),
  ]);
  const byId = new Map<string, EspnEvent>();
  for (const e of [...jun, ...jul]) if (e.id) byId.set(e.id, e);

  const shaped = [...byId.values()].map(shape).filter((x): x is { m: Match; round: string } => !!x);

  const rounds: Round[] = ROUND_ORDER.map((name) => ({
    name,
    matches: shaped
      .filter((x) => x.round === name)
      .map((x) => x.m)
      .sort((a, b) => a.date.localeCompare(b.date)),
  })).filter((r) => r.matches.length > 0);

  return NextResponse.json(
    { tournament: "FIFA World Cup", rounds },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
  );
}
