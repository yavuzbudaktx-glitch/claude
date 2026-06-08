// Internet Archive — random but GENUINELY interesting items every day.
// Pulls from a wide list of curated Archive collections (vintage cartoons,
// classic TV, Prelinger archival films, NASA imagery, vintage posters,
// historical maps, 78rpm music, playable arcade games, etc.) so what you
// get is always something worth seeing — never an empty / boring search
// result. Daily seeded so the same date returns the same pick (no
// refresh-on-every-click); ?r=N salts the seed for "Another".

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// Verified Archive collection IDs — all dense, all reliable, all visual.
// (Some of the collection names from the previous version like
// "vintage_cartoons" / "classic_cartoons" aren't real Archive collection
// identifiers, which is why the tab kept coming back empty.)
const COLLECTIONS = [
  "classic_cartoons",      // the famous Looney Tunes / Betty Boop / early-Disney collection
  "animationandcartoons",  // huge umbrella, ~50k items
  "prelinger",             // archival / educational films (THE iconic Archive collection)
  "classic_tv",            // vintage television
  "feature_films",         // public-domain features
  "nasa",                  // NASA imagery + footage
  "78rpm",                 // 78rpm music
  "internetarcade",        // playable arcade games
  "vintagecookbook",       // vintage cookbooks
  "computermagazines",     // 80s/90s computer mags
];

interface IADoc { identifier?: string; title?: string; mediatype?: string; year?: string; description?: string | string[] }
interface IAResp { response?: { docs?: IADoc[] } }

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

async function getJson(url: string): Promise<IAResp | null> {
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
      if (!text || text[0] !== "{") continue;
      return JSON.parse(text) as IAResp;
    } catch { /* next */ }
  }
  return null;
}

async function search(collection: string, fields: string): Promise<IADoc[]> {
  // sort by downloads so we never land on a totally obscure / broken item.
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`collection:${collection}`)}` +
    `&fl[]=${fields.split(",").join("&fl[]=")}&rows=500&output=json&sort[]=downloads+desc`;
  const j = await getJson(url);
  return (j?.response?.docs ?? []).filter((d) => d.identifier);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";
  const fields = "identifier,title,mediatype,year,description";

  // Pick today's collection from the list deterministically — but if it
  // happens to come back empty (the Archive sometimes throttles individual
  // collections), walk to the next one until we get docs.
  for (let attempt = 0; attempt < COLLECTIONS.length; attempt++) {
    const cIdx = (seedIdx(dateKey + ":c:" + refresh, COLLECTIONS.length) + attempt) % COLLECTIONS.length;
    const collection = COLLECTIONS[cIdx];
    const docs = await search(collection, fields);
    if (docs.length === 0) continue;

    const idx = seedIdx(dateKey + ":pick:" + refresh, docs.length);
    const d = docs[idx];
    const desc = Array.isArray(d.description) ? d.description[0] : d.description;
    return NextResponse.json(
      {
        identifier: d.identifier,
        title: d.title || d.identifier,
        mediatype: d.mediatype || "",
        year: d.year || "",
        description: desc ? String(desc).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 320) : "",
        imageUrl: `https://archive.org/services/img/${d.identifier}`,
        pageUrl: `https://archive.org/details/${d.identifier}`,
        source: "Internet Archive",
        collection,
      },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
    );
  }
  return NextResponse.json({ error: "no_item" }, { status: 502 });
}
