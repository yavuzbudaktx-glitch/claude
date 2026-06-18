// 2026 FIFA World Cup — group standings via ESPN's public standings endpoint.
// No key needed. Returns one row per team grouped by group letter, sorted by
// points (then GD, then GF) so the order matches what the official table shows.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const revalidate = 300;

interface EspnStat { name?: string; abbreviation?: string; value?: number; displayValue?: string }
interface EspnEntry {
  team?: { id?: string; displayName?: string; abbreviation?: string; logos?: Array<{ href?: string }>; logo?: string };
  stats?: EspnStat[];
  note?: { description?: string };
}
interface EspnGroup {
  name?: string;
  abbreviation?: string;
  standings?: { entries?: EspnEntry[] };
}
interface EspnResp { children?: EspnGroup[]; standings?: { entries?: EspnEntry[] }; name?: string }

interface OutTeam {
  id: string;
  name: string;
  abbr: string;
  logo: string;
  gp: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number;
  pts: number;
  qualified: boolean;
  eliminated: boolean;
}
interface OutGroup { name: string; teams: OutTeam[] }

function statVal(stats: EspnStat[] | undefined, keys: string[]): number {
  if (!stats) return 0;
  for (const k of keys) {
    const s = stats.find((x) =>
      x.name?.toLowerCase() === k.toLowerCase() ||
      x.abbreviation?.toLowerCase() === k.toLowerCase(),
    );
    if (s && typeof s.value === "number") return s.value;
    if (s?.displayValue) {
      const n = Number(s.displayValue);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function shapeTeam(e: EspnEntry): OutTeam | null {
  const t = e.team;
  if (!t) return null;
  const id = String(t.id ?? "");
  if (!id) return null;
  const logo = t.logos?.[0]?.href ?? t.logo ?? "";
  const gp = statVal(e.stats, ["gamesPlayed", "GP"]);
  const w  = statVal(e.stats, ["wins", "W"]);
  const d  = statVal(e.stats, ["ties", "draws", "D", "T"]);
  const l  = statVal(e.stats, ["losses", "L"]);
  const gf = statVal(e.stats, ["pointsFor", "goalsFor", "GF"]);
  const ga = statVal(e.stats, ["pointsAgainst", "goalsAgainst", "GA"]);
  const gd = statVal(e.stats, ["pointDifferential", "GD"]) || gf - ga;
  const pts = statVal(e.stats, ["points", "PTS"]) || w * 3 + d;
  const noteDesc = (e.note?.description ?? "").toLowerCase();
  // ESPN only emits these note flags during/after group stage when a slot is
  // mathematically locked. Pre-tournament they're empty; mid-tournament they
  // carry strings like "advanced to round of 32" or "clinched".
  const advanced = /(advanc|clinched|qualif|^q(?:\b|ualif))/i.test(noteDesc);
  const eliminated = /(\beliminated\b|knocked out)/i.test(noteDesc);
  return {
    id,
    name: t.displayName ?? "",
    abbr: t.abbreviation ?? "",
    logo,
    gp, w, d, l, gf, ga, gd, pts,
    qualified: advanced,
    eliminated,
  };
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
  // ESPN's standings endpoint serves one document per league. The response
  // either has a flat `standings.entries` (knockout / single-group leagues)
  // or `children[].standings.entries` (group-stage tournaments — which is
  // exactly what the World Cup looks like during pool play).
  const urls = [
    "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings",
    "https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/standings",
  ];
  let j: EspnResp | null = null;
  for (const u of urls) {
    j = await getJson(u);
    if (j) break;
  }
  if (!j) {
    return NextResponse.json({ groups: [], tournament: "FIFA World Cup", error: "unreachable" }, { status: 502 });
  }

  const groups: OutGroup[] = [];
  if (j.children && j.children.length > 0) {
    for (const g of j.children) {
      const teams = (g.standings?.entries ?? [])
        .map(shapeTeam)
        .filter((t): t is OutTeam => !!t)
        .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
      if (teams.length > 0) {
        groups.push({ name: g.name ?? g.abbreviation ?? "Group", teams });
      }
    }
  } else if (j.standings?.entries) {
    const teams = j.standings.entries
      .map(shapeTeam)
      .filter((t): t is OutTeam => !!t)
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
    if (teams.length > 0) groups.push({ name: j.name ?? "Standings", teams });
  }

  return NextResponse.json(
    { tournament: j.name ?? "FIFA World Cup", groups },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
  );
}
