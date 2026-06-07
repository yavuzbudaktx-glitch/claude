// Bird of the day — Wikipedia photo + blurb + a Wikimedia Commons recording
// of the species' song. Each species in the rotation ships with a HAND-PICKED
// Commons audio URL so the play button works reliably (the previous "scrape
// the article for an .ogg" approach failed for many species whose Wikipedia
// page links the audio differently). Deterministic per day; ?r=N salts.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// Each row: English common name + Wikipedia article title + Commons audio
// file (just the file name — we resolve the playable URL via the Commons
// imageinfo endpoint at request time, which guarantees the link stays valid
// even if the file is renamed on Commons).
interface BirdSeed { name: string; wiki: string; audio: string }
const BIRDS: BirdSeed[] = [
  { name: "Common Nightingale",   wiki: "Common_nightingale",          audio: "Common Nightingale.ogg" },
  { name: "Northern Cardinal",    wiki: "Northern_cardinal",           audio: "Northern Cardinal (call).ogg" },
  { name: "Common Loon",          wiki: "Common_loon",                 audio: "Gaviaimmer.ogg" },
  { name: "Wood Thrush",          wiki: "Wood_thrush",                 audio: "Hylocichla mustelina - Wood Thrush XC152434.ogg" },
  { name: "European Robin",       wiki: "European_robin",              audio: "Erithacus rubecula 02.ogg" },
  { name: "Song Thrush",          wiki: "Song_thrush",                 audio: "Turdus philomelos song.ogg" },
  { name: "Northern Mockingbird", wiki: "Northern_mockingbird",        audio: "Mimus polyglottos.ogg" },
  { name: "Western Meadowlark",   wiki: "Western_meadowlark",          audio: "Sturnella neglecta XC141760.ogg" },
  { name: "Common Blackbird",     wiki: "Common_blackbird",            audio: "Turdus merula 02.ogg" },
  { name: "American Robin",       wiki: "American_robin",              audio: "Turdus-migratorius-001.ogg" },
  { name: "Eurasian Wren",        wiki: "Eurasian_wren",               audio: "Troglodytes troglodytes (song).ogg" },
  { name: "Hermit Thrush",        wiki: "Hermit_thrush",               audio: "Catharus guttatus - Hermit Thrush XC125726.ogg" },
  { name: "Eurasian Skylark",     wiki: "Eurasian_skylark",            audio: "Alauda arvensis 02.ogg" },
  { name: "Baltimore Oriole",     wiki: "Baltimore_oriole",            audio: "Icterus galbula - Baltimore Oriole XC130533.ogg" },
  { name: "Mistle Thrush",        wiki: "Mistle_thrush",               audio: "Turdus viscivorus song.ogg" },
  { name: "Eurasian Blackcap",    wiki: "Eurasian_blackcap",           audio: "Sylvia atricapilla 01.ogg" },
  { name: "Common Chaffinch",     wiki: "Common_chaffinch",            audio: "Fringilla coelebs 02.ogg" },
  { name: "Great Tit",            wiki: "Great_tit",                   audio: "Parus major 02.ogg" },
  { name: "Common Cuckoo",        wiki: "Common_cuckoo",               audio: "Cuculus canorus vogelstimmen.ogg" },
  { name: "Barred Owl",           wiki: "Barred_owl",                  audio: "Strix varia - Barred Owl XC127090.ogg" },
  { name: "Common Raven",         wiki: "Common_raven",                audio: "Corvus corax - Common Raven XC159548.ogg" },
  { name: "House Wren",           wiki: "House_wren",                  audio: "Troglodytes aedon XC81064.ogg" },
  { name: "Carolina Wren",        wiki: "Carolina_wren",               audio: "Thryothorus ludovicianus XC81045.ogg" },
  { name: "Willow Warbler",       wiki: "Willow_warbler",              audio: "Phylloscopus trochilus 01.ogg" },
  { name: "Eurasian Golden Oriole", wiki: "Eurasian_golden_oriole",    audio: "Oriolus oriolus 01.ogg" },
  { name: "Pied Butcherbird",     wiki: "Pied_butcherbird",            audio: "Cracticus nigrogularis - Pied Butcherbird.ogg" },
  { name: "Eurasian Magpie",      wiki: "Eurasian_magpie",             audio: "Pica pica song.ogg" },
];

interface WikiSummary {
  title?: string; extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

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
      const r = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || (text[0] !== "{" && text[0] !== "[")) continue;
      return JSON.parse(text) as T;
    } catch { /* next */ }
  }
  return null;
}

// Resolve a Commons file's playable URL. Even if the file has been renamed,
// Commons follows redirects via `redirects=1` and returns the canonical URL.
async function resolveCommonsAudio(fileName: string): Promise<string> {
  // First try the direct hot-link (works for the vast majority of files —
  // Commons serves audio at https://upload.wikimedia.org/wikipedia/commons/…
  // but the canonical URL needs the SHA prefix, which we don't have. The
  // imageinfo lookup gives the correct URL.)
  const title = `File:${fileName}`;
  const info = await getJson<{ query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> } }>(
    `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&origin=*&redirects=1&titles=${encodeURIComponent(title)}`,
  );
  const pages = info?.query?.pages ?? {};
  for (const k of Object.keys(pages)) {
    const url = pages[k].imageinfo?.[0]?.url;
    if (url) return url;
  }
  return "";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  const bird = BIRDS[seedIdx(dateKey + "-" + refresh + "-bird", BIRDS.length)];

  // Photo + blurb (always tries — gives the panel something to render).
  const wiki = await getJson<WikiSummary>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bird.wiki)}`,
  );

  // Prefer the FULL image over the 320 px thumbnail. PageImages fallback at
  // 1200 px in case the summary endpoint omitted one.
  let imageUrl = wiki?.originalimage?.source ?? "";
  if (!imageUrl) imageUrl = wiki?.thumbnail?.source ?? "";
  if (!imageUrl) {
    const pi = await getJson<{ query?: { pages?: Record<string, { original?: { source?: string }; thumbnail?: { source?: string } }> } }>(
      `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original%7Cthumbnail&pithumbsize=1200&format=json&origin=*&titles=${encodeURIComponent(bird.wiki)}`,
    );
    const pages = pi?.query?.pages ?? {};
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      const u = p.original?.source ?? p.thumbnail?.source;
      if (u) { imageUrl = u; break; }
    }
  }

  // Audio — resolved from the hard-coded Commons file name for THIS species.
  let audioUrl = "";
  try { audioUrl = await resolveCommonsAudio(bird.audio); } catch { audioUrl = ""; }

  if (!wiki?.extract && !audioUrl && !imageUrl) {
    return NextResponse.json({ error: "bird_unavailable", name: bird.name }, { status: 502 });
  }

  return NextResponse.json(
    {
      name: bird.name,
      scientific: "",
      blurb: wiki?.extract ?? "",
      imageUrl,
      audioUrl,
      recordist: "",
      place: "",
      pageUrl: wiki?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(bird.wiki)}`,
      xcUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(bird.audio)}`,
      source: "Wikipedia · Wikimedia Commons",
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
