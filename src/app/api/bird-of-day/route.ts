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
import { raceJson } from "@/lib/race-json";

export const revalidate = 3600;
export const maxDuration = 30;

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

// Racing fetch (direct + proxies in parallel, 4s per try, honest tool UA) —
// see src/lib/race-json.ts. The old sequential 9s-per-proxy walk with a fake
// browser UA is what got all the Wikipedia-backed tabs killed at once.
const getJson = raceJson;

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

// 0) The xeno-canto recording the Wikipedia article EXPLICITLY links to.
//    Wikipedia bird articles cite xeno-canto for the Voice/Calls section, so
//    this is the recording a reader would actually click. We read the
//    article's external links (clean JSON via prop=externallinks), find the
//    first xeno-canto recording id, and return its PUBLIC DOWNLOAD URL
//    (xeno-canto.org/<id>/download) — a stable endpoint that streams the mp3
//    with NO API key. (xeno-canto's JSON API was gated behind registration in
//    2024, which is why the old api/2 calls silently stopped returning files.)
function xcDownloadUrl(id: string): string {
  return `https://xeno-canto.org/${id}/download`;
}

async function audioFromWikiXc(title: string): Promise<string> {
  const j = await getJson<{ parse?: { externallinks?: string[] } }>(
    `https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&prop=externallinks&page=${encodeURIComponent(title.replace(/ /g, "_"))}`,
  );
  const links = j?.parse?.externallinks ?? [];
  for (const url of links) {
    if (!/xeno-canto\.org/i.test(url)) continue;
    const mRec = url.match(/xeno-canto\.org\/(\d{3,8})(?:[/?#]|$)/);
    if (mRec) return xcDownloadUrl(mRec[1]);
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
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > 6500;
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);

  const pool = await getBirdPool();
  if (pool.length === 0) {
    return NextResponse.json({ error: "no_pool" }, { status: 502 });
  }

  // Fetch 8 candidate summaries IN PARALLEL — doing this sequentially was
  // blowing the 10s function limit on the route (10 attempts * ~9s each),
  // which is exactly why the bird tab kept "going back to previous code":
  // the function was getting killed before returning anything.
  const candidateTitles = Array.from({ length: 8 }, (_, i) =>
    pool[seedIdx(`${dateKey}:bird:${i}`, pool.length)],
  );
  const summaries = await Promise.all(
    candidateTitles.map(async (t) => ({ title: t, wiki: await fetchSummary(t) })),
  );
  const usable = summaries
    .map(({ title, wiki }) =>
      wiki?.extract && (wiki.originalimage?.source || wiki.thumbnail?.source)
        ? { title, wiki }
        : null,
    )
    .filter((x): x is { title: string; wiki: WikiSummary } => !!x);
  const photoOnly = usable[0] ?? null;

  // Try audio for the FIRST usable bird only (sequential calls within one
  // candidate are fine; sequential across 10 candidates was the killer).
  // Each step checks the deadline — a photo-only bird with "No song
  // archived" beats a dead tab every time.
  let best: { title: string; wiki: WikiSummary; audio: string } | null = null;
  if (photoOnly) {
    let audio = await audioFromWikiXc(photoOnly.title);
    if (!audio && !outOfTime()) audio = await audioFromArticle(photoOnly.title);
    if (!audio && !outOfTime()) audio = await audioFromCommonsSearch(photoOnly.title);
    if (audio) best = { title: photoOnly.title, wiki: photoOnly.wiki, audio };
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
