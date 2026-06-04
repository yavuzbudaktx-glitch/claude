// Random fun from the Internet Archive — a random item (film, image, audio,
// or book) with a preview thumbnail. Uses the advancedsearch API's random
// sort. No key. Each call rolls a fresh one.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// Collections that reliably make for a fun, safe-for-anyone preview.
const QUERIES = [
  "collection:prelinger",                 // ephemeral / educational films
  "collection:feature_films",             // public-domain features
  "collection:classic_tv",                // vintage TV
  "collection:nasa",                      // NASA imagery & footage
  "collection:metropolitanmuseumofart-gallery",
  "collection:posters",                   // vintage posters
  "collection:album_recordings",          // 78rpm & live music
  "collection:vintage_cartoons",
  "mediatype:image AND subject:vintage",
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
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const fields = "identifier,title,mediatype,year,description";
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
    `&fl[]=${fields.split(",").join("&fl[]=")}&rows=50&output=json&sort[]=random`;

  const j = await getJson(url);
  const docs = (j?.response?.docs ?? []).filter((d) => d.identifier);
  if (docs.length === 0) return NextResponse.json({ error: "no_item" }, { status: 502 });

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
