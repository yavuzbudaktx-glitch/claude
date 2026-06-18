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

// 0a) The recordings xeno-canto links the Wikipedia article EXPLICITLY
//     points at — the editors' chosen reference recordings. Wikipedia bird
//     articles ALWAYS cite xeno-canto for the Voice/Calls section, so this
//     is the most reliable way to get a recording that's actually labelled
//     to the species. We parse the article HTML, scan for xeno-canto URLs
//     (recording pages like /123456 or refs like XC123456), and resolve
//     the first one through xeno-canto's API to a direct audio URL.
interface XcLookupResp { recordings?: Array<{ id?: string; file?: string }> }

async function audioFromWikiXc(title: string): Promise<string> {
  // Use Wikipedia's `externallinks` prop — a clean JSON array of every
  // external URL the article cites. Way more reliable than regex'ing
  // article HTML and picks up xc links wherever they appear (citations,
  // External links section, infobox refs).
  const j = await getJson<{ parse?: { externallinks?: string[] } }>(
    `https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&prop=externallinks&page=${encodeURIComponent(title.replace(/ /g, "_"))}`,
  );
  const links = j?.parse?.externallinks ?? [];
  const ids = new Set<string>();
  let speciesSlug = "";
  for (const url of links) {
    if (!/xeno-canto\.org/i.test(url)) continue;
    const mRec = url.match(/xeno-canto\.org\/(\d{3,8})(?:[/?#]|$)/);
    if (mRec) ids.add(mRec[1]);
    const mSp = url.match(/xeno-canto\.org\/species\/([A-Za-z][A-Za-z-]+)/);
    if (mSp && !speciesSlug) speciesSlug = mSp[1];
  }

  for (const id of ids) {
    const r = await getJson<XcLookupResp>(`https://www.xeno-canto.org/api/2/recordings?query=nr:${id}`);
    const rec = r?.recordings?.[0];
    const file = rec?.file && rec.file.startsWith("//") ? `https:${rec.file}` : rec?.file;
    if (file && /^https?:\/\//.test(file)) return file;
  }
  if (speciesSlug) {
    const [gen, ...rest] = speciesSlug.split("-");
    const species = rest.join("-");
    const q = encodeURIComponent(`gen:"${gen}" sp:"${species}"`);
    const r = await getJson<XcLookupResp>(`https://www.xeno-canto.org/api/2/recordings?query=${q}`);
    const rec = r?.recordings?.[0];
    const file = rec?.file && rec.file.startsWith("//") ? `https:${rec.file}` : rec?.file;
    if (file && /^https?:\/\//.test(file)) return file;
  }
  return "";
}

// 0b) xeno-canto — the dedicated bird-song archive. ~700k recordings keyed
//    by common name or genus+species. We pick the highest-quality A-grade
//    recording when one's available (xc's `q` field; "A" = best).
interface XcRecording {
  id?: string;
  gen?: string; sp?: string; en?: string;
  q?: string;          // A/B/C/D/E quality
  type?: string;       // "song", "call", etc.
  file?: string;
  ["file-name"]?: string;
  rec?: string;
  cnt?: string; loc?: string;
}
interface XcResp { recordings?: XcRecording[] }

async function audioFromXenoCanto(commonName: string): Promise<string> {
  // xeno-canto's search API supports `en:"name"` for English/common name.
  const q = encodeURIComponent(`en:"${commonName}" q:A type:song`);
  const j = await getJson<XcResp>(`https://www.xeno-canto.org/api/2/recordings?query=${q}`);
  const list = j?.recordings ?? [];
  // Pick the first A-quality song with a real file URL.
  for (const r of list) {
    const url = r.file && r.file.startsWith("//") ? `https:${r.file}` : r.file;
    if (url && /^https?:\/\//.test(url)) return url;
  }
  // Loosen: any quality, any vocalisation type.
  const j2 = await getJson<XcResp>(`https://www.xeno-canto.org/api/2/recordings?query=${encodeURIComponent(`en:"${commonName}"`)}`);
  for (const r of j2?.recordings ?? []) {
    const url = r.file && r.file.startsWith("//") ? `https:${r.file}` : r.file;
    if (url && /^https?:\/\//.test(url)) return url;
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

    // Order: (a) the xeno-canto link Wikipedia itself cites in the article
    // — most reliable, and lines up with what the user sees on the page.
    // (b) xeno-canto species search. (c) audio embedded in the article
    // itself. (d) Commons file search by name.
    let audio = await audioFromWikiXc(title);
    if (!audio) audio = await audioFromXenoCanto(title);
    if (!audio) audio = await audioFromArticle(title);
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
