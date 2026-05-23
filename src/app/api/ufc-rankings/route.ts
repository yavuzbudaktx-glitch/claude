import { NextResponse } from "next/server";
import { findLocalFighterPhoto } from "@/lib/local-fighter-photos";

// UFC divisional rankings — champion + ranked contenders for the four
// divisions the dashboard surfaces. Sourced from the public octagon-api
// (which mirrors UFC.com's official rankings as clean JSON), normalised
// here so the client just renders. Cached for an hour; the client also
// re-keys at local midnight for the nightly refresh.

export const revalidate = 3600;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// The divisions we show, in display order, matched case-insensitively
// against the source's category names. Men's divisions only (the source
// prefixes women's divisions with "Women's").
const WANTED = ["Featherweight", "Lightweight", "Welterweight", "Middleweight"] as const;

export interface RankedFighter {
  rank: number;
  name: string;
  id: string;
}
export interface DivisionRanking {
  division: string;
  champion: string | null;
  championPhoto: string | null;
  contenders: RankedFighter[];
}
export interface UfcRankingsResp {
  divisions: DivisionRanking[];
  source: string | null;
}

// "ilia-topuria" / "jiri-prochazka" → "Ilia Topuria" / "Jiri Prochazka".
function slugToName(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) =>
      /^(jr|sr|ii|iii|iv)$/i.test(w)
        ? w.replace(/^(\w)(\w*)$/, (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase())
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

interface RawFighter {
  id?: string;
  fighterName?: string;
  name?: string;
  rank?: string | number;
}
interface RawDivision {
  categoryName?: string;
  championId?: string;
  fighters?: RawFighter[];
}

function normalizeDivision(raw: RawDivision): DivisionRanking | null {
  const category = (raw.categoryName ?? "").trim();
  const wanted = WANTED.find((w) => w.toLowerCase() === category.toLowerCase());
  if (!wanted) return null;

  const fighters = raw.fighters ?? [];

  // The champion is normally given as championId; some payloads instead
  // mark the champion inside the fighters list with a non-numeric rank.
  let championId = raw.championId?.trim() || null;
  let championName: string | null = null;
  const contenders: RankedFighter[] = [];

  for (const f of fighters) {
    const id = (f.id ?? "").trim();
    const name = (f.fighterName ?? f.name ?? "").trim() || (id ? slugToName(id) : "");
    const rankNum = Number(f.rank);
    const isChampLabel = typeof f.rank === "string" && /^(c|champion)$/i.test(f.rank.trim());
    if (isChampLabel) {
      championId = championId ?? id;
      championName = name;
      continue;
    }
    if (Number.isFinite(rankNum) && name) {
      contenders.push({ rank: rankNum, name, id: id || name });
    }
  }

  if (!championName && championId) championName = slugToName(championId);

  contenders.sort((a, b) => a.rank - b.rank);

  return {
    division: wanted,
    champion: championName,
    championPhoto: championName ? findLocalFighterPhoto(championName) : null,
    contenders,
  };
}

export async function GET() {
  try {
    const res = await fetch("https://api.octagon-api.com/rankings", {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json({ divisions: [], source: null } satisfies UfcRankingsResp);
    }
    const json = (await res.json()) as unknown;

    // The payload is an object keyed by division; values are RawDivision.
    const rawDivisions: RawDivision[] = Array.isArray(json)
      ? (json as RawDivision[])
      : Object.values((json ?? {}) as Record<string, RawDivision>);

    const byWanted = new Map<string, DivisionRanking>();
    for (const raw of rawDivisions) {
      const norm = normalizeDivision(raw);
      if (norm) byWanted.set(norm.division, norm);
    }

    // Emit in the requested display order, skipping any that didn't resolve.
    const divisions = WANTED.map((w) => byWanted.get(w)).filter(
      (d): d is DivisionRanking => !!d && d.contenders.length > 0,
    );

    return NextResponse.json({
      divisions,
      source: divisions.length ? "octagon-api" : null,
    } satisfies UfcRankingsResp);
  } catch {
    return NextResponse.json({ divisions: [], source: null } satisfies UfcRankingsResp);
  }
}
