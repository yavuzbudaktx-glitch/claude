// Bird of the day — Wikipedia photo + blurb, plus the species' recorded call
// pulled from Wikimedia Commons (a wikidata SPARQL lookup gives the canonical
// audio file ID associated with the taxon, then Commons resolves the OGG URL).
// Wikimedia is the same domain family as the Wikipedia call — same auth, same
// CDN, same CORS posture — so when one works the other does too.
//
// Deterministic per day; ?r=N salts the seed.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// Recognisable, song-rich species (English name + Wikipedia title when they
// differ) — every entry below has both an article and an audio file on
// Wikimedia Commons.
const BIRDS: Array<{ name: string; wiki?: string }> = [
  { name: "Common Nightingale" }, { name: "Northern Cardinal" }, { name: "Common Loon" },
  { name: "Wood Thrush" }, { name: "European Robin" }, { name: "Song Thrush" },
  { name: "Northern Mockingbird" }, { name: "Western Meadowlark" }, { name: "Common Blackbird" },
  { name: "American Robin" }, { name: "Eurasian Wren", wiki: "Eurasian wren" }, { name: "Veery" },
  { name: "Hermit Thrush" }, { name: "Eurasian Skylark", wiki: "Eurasian skylark" }, { name: "Baltimore Oriole" },
  { name: "Woodlark" }, { name: "Mistle Thrush" }, { name: "Eurasian Blackcap", wiki: "Eurasian blackcap" },
  { name: "Common Chaffinch" }, { name: "Great Tit" }, { name: "Eurasian Bullfinch" },
  { name: "Common Cuckoo" }, { name: "Barred Owl" }, { name: "Common Raven" },
  { name: "House Wren" }, { name: "Carolina Wren" }, { name: "Marsh Warbler" },
  { name: "Sedge Warbler" }, { name: "Willow Warbler" }, { name: "Eurasian Golden Oriole", wiki: "Eurasian golden oriole" },
  { name: "Bewick's Wren" }, { name: "Pied Butcherbird" }, { name: "Eurasian Magpie" },
];

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

async function getJson<T>(url: string, extraHeaders: Record<string, string> = {}): Promise<T | null> {
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: { ...HEADERS, ...extraHeaders }, signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || (text[0] !== "{" && text[0] !== "[")) continue;
      return JSON.parse(text) as T;
    } catch { /* next */ }
  }
  return null;
}

interface WikiSummary {
  title?: string; extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

// Find the first .ogg/.oga audio file linked from the species' Wikipedia page
// (Wikipedia almost always embeds a Commons recording — it's the same archive
// xeno-canto contributors mirror into). Returns a direct https URL.
async function findCommonsAudio(wikiTitle: string): Promise<string | null> {
  // Step 1: list every file used on the article (Commons + uploads).
  const list = await getJson<{ query?: { pages?: Record<string, { images?: Array<{ title?: string }> }> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=images&imlimit=200&format=json&origin=*&titles=${encodeURIComponent(wikiTitle)}`,
  );
  const pages = list?.query?.pages ?? {};
  const allFiles: string[] = [];
  for (const k of Object.keys(pages)) {
    for (const f of pages[k].images ?? []) if (f.title) allFiles.push(f.title);
  }
  const audioFiles = allFiles.filter((t) => /\.(ogg|oga|opus|mp3|wav)$/i.test(t));
  if (audioFiles.length === 0) return null;

  // Step 2: resolve a file title (e.g. "File:Luscinia megarhynchos.ogg") to
  // its actual playable URL. The imageinfo prop gives the canonical "url".
  const file = audioFiles[0];
  const info = await getJson<{ query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&origin=*&titles=${encodeURIComponent(file)}`,
  );
  const ipages = info?.query?.pages ?? {};
  for (const k of Object.keys(ipages)) {
    const url = ipages[k].imageinfo?.[0]?.url;
    if (url) return url;
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  const bird = BIRDS[seedIdx(dateKey + "-" + refresh + "-bird", BIRDS.length)];
  const wikiTitle = (bird.wiki ?? bird.name).replace(/ /g, "_");

  // Photo + blurb (this is the reliable bit — it makes the tab always render).
  const wiki = await getJson<WikiSummary>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`,
  );

  // Audio (best-effort).
  let audioUrl = "";
  try { audioUrl = (await findCommonsAudio(wikiTitle)) ?? ""; } catch { audioUrl = ""; }

  // If we don't have a photo OR a recording, the tab really can't render.
  if (!wiki?.extract && !audioUrl && !wiki?.thumbnail?.source) {
    return NextResponse.json({ error: "bird_unavailable", name: bird.name }, { status: 502 });
  }

  return NextResponse.json(
    {
      name: bird.name,
      scientific: "",                     // wiki summary doesn't reliably carry this
      blurb: wiki?.extract ?? "",
      imageUrl: wiki?.thumbnail?.source ?? wiki?.originalimage?.source ?? "",
      audioUrl,
      recordist: "",
      place: "",
      pageUrl: wiki?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`,
      xcUrl: `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(bird.name + " audio")}`,
      source: "Wikipedia · Wikimedia Commons",
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
