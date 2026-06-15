// Bird of the day — ALL Wikipedia, like the user asked. The species pool is
// Wikipedia's own "List of birds by common name" (~11,000 species), parsed
// once and cached for a day. For the day's pick we read the article summary
// (photo + blurb) and find its song the same place a reader would:
//   1) the audio files embedded ON the species' own article (media-list),
//   2) else a Wikimedia Commons file search for "<species>" audio.
// The chosen file's real URL is resolved via the imageinfo API and streamed
// through our same-origin /api/bird-audio proxy so playback can never be
// blocked by CORS / referrer / mixed-content quirks.
//
// Deterministic per local day (?d=). If a species has no usable recording we
// silently walk to the next candidate, so the day's bird virtually always
// sings.

import { NextResponse } from "next/server";

export const revalidate = 3600;
export const maxDuration = 30;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

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

// ---- species pool: every bird on the master list --------------------------
let poolCache: { at: number; titles: string[] } | null = null;
const POOL_TTL = 1000 * 60 * 60 * 24;

interface ParseLinks { parse?: { links?: Array<{ ns?: number; exists?: string; ["*"]?: string }> } }

async function getBirdPool(): Promise<string[]> {
  if (poolCache && Date.now() - poolCache.at < POOL_TTL && poolCache.titles.length > 500) {
    return poolCache.titles;
  }
  const j = await getJson<ParseLinks>(
    "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_birds_by_common_name&prop=links&format=json&origin=*",
  );
  const titles = (j?.parse?.links ?? [])
    .filter((l) => l.ns === 0 && l.exists !== undefined && typeof l["*"] === "string")
    .map((l) => l["*"] as string)
    // Drop navigation links that live on the page but aren't species.
    .filter((t) => !/^list of|^bird|^ornitholog|^common name|^binomial/i.test(t));
  if (titles.length > 500) poolCache = { at: Date.now(), titles };
  return titles;
}

// ---- audio discovery -------------------------------------------------------

interface MediaList { items?: Array<{ title?: string; type?: string }> }

// Resolve "File:Foo.ogg" → its real upload URL. en.wikipedia's imageinfo
// resolves Commons-hosted files transparently.
async function resolveFileUrl(fileTitle: string): Promise<string> {
  const info = await getJson<{ query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&origin=*&redirects=1&titles=${encodeURIComponent(fileTitle)}`,
  );
  const pages = info?.query?.pages ?? {};
  for (const k of Object.keys(pages)) {
    const u = pages[k].imageinfo?.[0]?.url;
    if (u) return u;
  }
  return "";
}

// 1) Audio embedded on the article itself — the recording Wikipedia's editors
//    chose for this species.
async function audioFromArticle(title: string): Promise<string> {
  const media = await getJson<MediaList>(
    `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  );
  const audio = (media?.items ?? []).find(
    (i) => i.type === "audio" && i.title && /\.(ogg|oga|opus|mp3|wav|flac)$/i.test(i.title),
  );
  if (!audio?.title) return "";
  return resolveFileUrl(audio.title.startsWith("File:") ? audio.title : `File:${audio.title}`);
}

// 2) Commons file search for the species name.
interface CommonsSearch { query?: { search?: Array<{ title?: string }> } }
async function audioFromCommonsSearch(name: string): Promise<string> {
  const j = await getJson<CommonsSearch>(
    `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=5&format=json&origin=*&srsearch=${encodeURIComponent(`${name} filetype:audio`)}`,
  );
  const hit = (j?.query?.search ?? []).find((s) => s.title && /\.(ogg|oga|opus|mp3|wav|flac)$/i.test(s.title));
  if (!hit?.title) return "";
  // Resolve on Commons directly (the file lives there).
  const info = await getJson<{ query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> } }>(
    `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&origin=*&redirects=1&titles=${encodeURIComponent(hit.title)}`,
  );
  const pages = info?.query?.pages ?? {};
  for (const k of Object.keys(pages)) {
    const u = pages[k].imageinfo?.[0]?.url;
    if (u) return u;
  }
  return "";
}

// ---- summary (photo + blurb) -----------------------------------------------

interface WikiSummary {
  title?: string; extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

async function fetchSummary(title: string): Promise<WikiSummary | null> {
  return getJson<WikiSummary>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);

  const pool = await getBirdPool();
  if (pool.length === 0) {
    return NextResponse.json({ error: "no_pool" }, { status: 502 });
  }

  // Walk deterministic candidates until one has BOTH a photo and a song
  // (keep the first photo-only bird as a fallback so the tab always renders).
  // Up to 10 attempts so a string of unlucky picks (rare birds with no
  // Commons audio) doesn't leave the user with the "Couldn't reach the
  // aviary" state for the whole day.
  let best: { title: string; wiki: WikiSummary; audio: string } | null = null;
  let photoOnly: { title: string; wiki: WikiSummary } | null = null;

  for (let attempt = 0; attempt < 10 && !best; attempt++) {
    const title = pool[seedIdx(`${dateKey}:bird:${attempt}`, pool.length)];
    const wiki = await fetchSummary(title);
    if (!wiki?.extract) continue;
    const hasPhoto = !!(wiki.originalimage?.source || wiki.thumbnail?.source);
    if (!hasPhoto) continue;
    if (!photoOnly) photoOnly = { title, wiki };

    let audio = await audioFromArticle(title);
    if (!audio) audio = await audioFromCommonsSearch(title);
    if (audio) best = { title, wiki, audio };
  }

  const chosen = best ?? (photoOnly ? { ...photoOnly, audio: "" } : null);
  if (!chosen) {
    return NextResponse.json({ error: "bird_unavailable" }, { status: 502 });
  }

  const { title, wiki, audio } = chosen;
  const imageUrl = wiki.originalimage?.source ?? wiki.thumbnail?.source ?? "";
  const audioUrl = audio ? `/api/bird-audio?u=${encodeURIComponent(audio)}` : "";

  return NextResponse.json(
    {
      name: title,
      scientific: "",
      blurb: wiki.extract ?? "",
      imageUrl,
      audioUrl,
      recordist: "",
      place: "",
      pageUrl: wiki.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      xcUrl: `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(title + " audio")}`,
      source: "Wikipedia · Wikimedia Commons",
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
