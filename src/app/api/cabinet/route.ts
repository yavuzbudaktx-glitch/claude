// Cabinet of curiosities — one object a day from The Met's Open Access
// collection (no key). The Met API has no "random" endpoint, so we keep a
// curated pool of department/era search terms, pick one per day, pull the
// matching object IDs, then a deterministic object from that set. Each object
// carries its own little story (the museum's own catalogue blurb / dimensions
// / culture / date). ?r=N salts the seed.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// Evocative search terms across the Met's stranger corners — armour, clocks,
// instruments, masks, astrolabes… the things that actually feel like a
// "cabinet of curiosities".
const TERMS = [
  "astrolabe", "armor", "mask", "automaton", "clock", "musical instrument",
  "amulet", "scarab", "netsuke", "reliquary", "globe", "sundial",
  "sword", "helmet", "vessel", "talisman", "telescope", "compass",
  "lacquer", "ivory", "jade", "mosaic", "tapestry", "fresco",
];

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

async function getJson<T>(url: string): Promise<T | null> {
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || (text[0] !== "{" && text[0] !== "[")) continue;
      return JSON.parse(text) as T;
    } catch { /* next */ }
  }
  return null;
}

interface MetSearch { total?: number; objectIDs?: number[] | null }
interface MetObject {
  objectID: number;
  title?: string;
  artistDisplayName?: string;
  objectDate?: string;
  culture?: string;
  medium?: string;
  dimensions?: string;
  department?: string;
  creditLine?: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  objectURL?: string;
  isPublicDomain?: boolean;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  const term = TERMS[seedIdx(dateKey + "-" + refresh + "-term", TERMS.length)];
  const search = await getJson<MetSearch>(
    `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(term)}`,
  );
  const ids = (search?.objectIDs ?? []).slice(0, 500);
  if (ids.length === 0) return NextResponse.json({ error: "no_objects" }, { status: 502 });

  // Try a few deterministic candidates until one has an image.
  let obj: MetObject | null = null;
  for (let attempt = 0; attempt < 8 && !obj; attempt++) {
    const idx = seedIdx(dateKey + "-" + refresh + "-obj-" + attempt, ids.length);
    const candidate = await getJson<MetObject>(
      `https://collectionapi.metmuseum.org/public/collection/v1/objects/${ids[idx]}`,
    );
    if (candidate && (candidate.primaryImage || candidate.primaryImageSmall)) obj = candidate;
  }
  if (!obj) return NextResponse.json({ error: "no_image" }, { status: 502 });

  // A one-line "story" assembled from the catalogue facts.
  const bits = [obj.culture, obj.objectDate].filter(Boolean).join(" · ");
  return NextResponse.json(
    {
      id: obj.objectID,
      title: obj.title || "Untitled",
      artist: obj.artistDisplayName || obj.culture || obj.department || "",
      date: obj.objectDate || "",
      medium: obj.medium || "",
      dimensions: obj.dimensions || "",
      story: [bits, obj.creditLine].filter(Boolean).join(" — "),
      imageUrl: obj.primaryImage || obj.primaryImageSmall || "",
      pageUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
      source: "The Met · Open Access",
      term,
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
