// Internet Archive — a random but GENUINELY interesting item: NASA imagery,
// archival ephemeral films, playable arcade games, vintage travel posters,
// old maps, classic cartoons, 78rpm music. Curated collections only (no
// random junk), preferring items that actually have a usable preview image.
// No key. Each call rolls a fresh one.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// Hand-picked collections — each reliably interesting and visual.
const QUERIES = [
  "collection:nasa",                  // space imagery & footage
  "collection:prelinger",             // archival / educational films
  "collection:internetarcade",        // playable classic arcade games
  "collection:classic_tv",            // vintage television
  "collection:vintage_cartoons",      // early animation
  "collection:78rpm",                 // 78rpm records
  "collection:maps_usgs",             // historical maps
  "collection:nasaimages",
  "collection:fav-vintage-posters",   // travel & film posters
  "collection:computerchronicles",    // 80s/90s computing TV
  "collection:moviesandfilms AND subject:documentary",
  "collection:apkarchive",
];

interface IADoc { identifier?: string; title?: string; mediatype?: string; year?: string; description?: string | string[] }
interface IAResp { response?: { docs?: IADoc[] } }

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

export async function GET() {
  // Try a couple of collections so a single dud doesn't fail the tab.
  for (let attempt = 0; attempt < 2; attempt++) {
    const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
    const fields = "identifier,title,mediatype,year,description";
    const url =
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
      `&fl[]=${fields.split(",").join("&fl[]=")}&rows=80&output=json&sort[]=random`;
    const j = await getJson(url);
    const docs = (j?.response?.docs ?? []).filter((d) => d.identifier);
    if (docs.length === 0) continue;

    const d = docs[Math.floor(Math.random() * docs.length)];
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
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ error: "no_item" }, { status: 502 });
}
