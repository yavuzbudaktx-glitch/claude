// Server-side helpers for pulling a channel's (or playlist's) FULL library of
// videos — not just the 15 the Atom feed exposes. We seed from the public
// /playlist or /shorts HTML (ytInitialData) and then page through the rest via
// YouTube's innertube `browse` continuation API (no key/account needed beyond
// the public web key). Results are cached per source for a while because
// walking a whole library is several round-trips.
//
// Everything degrades gracefully: if innertube is unreachable we still return
// whatever the first page gave us (≈100 for playlists, ≈30 for a videos tab).

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// Public web innertube key (embedded in every youtube.com page).
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const CLIENT = { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "US" };

const MAX_PAGES = 80;        // up to ~80 * 100 ≈ 8k videos
const TIME_BUDGET_MS = 22000; // soft cap on the total walk

export interface LibVideo { id: string; title: string }

interface CacheEntry { at: number; items: LibVideo[] }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6h
const idCache = new Map<string, string>();

async function getText(url: string): Promise<string | null> {
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const res = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 1000) return text;
    } catch { /* next */ }
  }
  return null;
}

async function innertubeBrowse(continuation: string): Promise<string | null> {
  // Try innertube directly, then proxy-wrapped (browser-style POST through a
  // public CORS reflector). Direct gets blocked from a lot of egress IPs; the
  // proxies don't easily forward POST/JSON, so we also have a GET fallback
  // path via `playlist?list=…&continuation=…` for playlists where possible.
  const body = JSON.stringify({ context: { client: CLIENT }, continuation });
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}&prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": HEADERS["User-Agent"],
        "Accept-Language": HEADERS["Accept-Language"],
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": CLIENT.clientVersion,
        "Origin": "https://www.youtube.com",
        "Referer": "https://www.youtube.com/",
      },
      body,
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (res.ok) return await res.text();
  } catch { /* fall through to proxy */ }
  // Proxy fallback — POST through a CORS reflector that supports it.
  try {
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}&prettyPrint=false`)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (res.ok) return await res.text();
  } catch { /* give up */ }
  return null;
}

export async function resolveChannelId(handle: string): Promise<string | null> {
  const hit = idCache.get(handle);
  if (hit) return hit;
  const html = await getText(`https://www.youtube.com/@${handle}`);
  if (!html) return null;
  const m =
    /<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html) ||
    /<meta[^>]+property="og:url"[^>]+content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html) ||
    /"externalId":"(UC[\w-]{22})"/.exec(html) ||
    /"channelId":"(UC[\w-]{22})"/.exec(html);
  if (m) { idCache.set(handle, m[1]); return m[1]; }
  return null;
}

// Grab the load-more continuation token from a blob. YouTube's responses can
// contain multiple `continuationCommand` tokens (one for the main list, one
// each for sidebars, related, sorts, …). Empirically the FIRST one inside a
// `continuationItemRenderer` is the actual "load more" handle for the main
// list, so we anchor on that. We also fall back to the legacy
// `nextContinuationData` shape used in older snapshots.
function findContinuation(blob: string): string | null {
  const reA = /"continuationItemRenderer":\{[^]*?"continuationCommand":\{"token":"((?:[^"\\]|\\.)*?)"/;
  const a = reA.exec(blob);
  if (a) { try { return JSON.parse(`"${a[1]}"`); } catch { return a[1]; } }
  const reB = /"nextContinuationData":\{"continuation":"((?:[^"\\]|\\.)*?)"/;
  const b = reB.exec(blob);
  if (b) { try { return JSON.parse(`"${b[1]}"`); } catch { return b[1]; } }
  return null;
}

function pushVideo(out: LibVideo[], seen: Set<string>, id: string, rawTitle: string) {
  if (!id || seen.has(id)) return;
  seen.add(id);
  let title = "";
  try { title = JSON.parse(`"${rawTitle}"`); } catch { title = rawTitle; }
  out.push({ id, title: (title || "").trim() });
}

// Works for playlistVideoRenderer / videoRenderer / gridVideoRenderer — all
// carry "videoId":"…" shortly followed by a title (runs[].text or simpleText).
function extractVideos(blob: string, out: LibVideo[], seen: Set<string>) {
  const re = /"videoId":"([\w-]{11})"(?:(?!"videoId").)*?"title":\{(?:"runs":\[\{"text":"((?:[^"\\]|\\.)*?)"|"simpleText":"((?:[^"\\]|\\.)*?)")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob))) pushVideo(out, seen, m[1], m[2] ?? m[3] ?? "");
}

// Shorts use shortsLockupViewModel (primaryText) or the older reelItemRenderer.
function extractShorts(blob: string, out: LibVideo[], seen: Set<string>) {
  const re = /"videoId":"([\w-]{11})"(?:(?!"videoId").)*?"primaryText":\{"content":"((?:[^"\\]|\\.)*?)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob))) pushVideo(out, seen, m[1], m[2]);
  if (out.length === 0) {
    const re2 = /"reelItemRenderer":\{"videoId":"([\w-]{11})"(?:(?!"reelItemRenderer").)*?"headline":\{"simpleText":"((?:[^"\\]|\\.)*?)"/g;
    while ((m = re2.exec(blob))) pushVideo(out, seen, m[1], m[2]);
  }
  if (out.length === 0) {
    const re3 = /"videoId":"([\w-]{11})"/g;
    while ((m = re3.exec(blob))) pushVideo(out, seen, m[1], "");
  }
}

async function walk(
  firstHtml: string | null,
  extractor: (blob: string, out: LibVideo[], seen: Set<string>) => void,
): Promise<LibVideo[]> {
  const out: LibVideo[] = [];
  const seen = new Set<string>();
  if (!firstHtml) return out;
  const started = Date.now();
  extractor(firstHtml, out, seen);
  let token = findContinuation(firstHtml);
  let pages = 0;
  while (token && pages < MAX_PAGES && Date.now() - started < TIME_BUDGET_MS) {
    const resp = await innertubeBrowse(token);
    if (!resp) break;
    const before = out.length;
    extractor(resp, out, seen);
    token = findContinuation(resp);
    pages++;
    if (out.length === before) break; // no new videos — stop
  }
  return out;
}

function cached(key: string): LibVideo[] | null {
  const e = cache.get(key);
  if (e && Date.now() - e.at < CACHE_TTL && e.items.length) return e.items;
  return null;
}

export async function fetchPlaylistVideos(playlistId: string): Promise<LibVideo[]> {
  const key = `pl:${playlistId}`;
  const hit = cached(key);
  if (hit) return hit;
  const html = await getText(`https://www.youtube.com/playlist?list=${playlistId}&hl=en`);
  const items = await walk(html, extractVideos);
  if (items.length) cache.set(key, { at: Date.now(), items });
  return items;
}

export async function fetchChannelVideos(handle: string): Promise<LibVideo[]> {
  const key = `ch:${handle}`;
  const hit = cached(key);
  if (hit) return hit;
  const id = await resolveChannelId(handle);
  if (!id) return [];
  // The uploads playlist (UU…) is the whole upload history, newest first.
  const uploads = "UU" + id.slice(2);
  const items = await fetchPlaylistVideos(uploads);
  if (items.length) cache.set(key, { at: Date.now(), items });
  return items;
}

export async function fetchChannelShorts(handle: string): Promise<LibVideo[]> {
  const key = `sh:${handle}`;
  const hit = cached(key);
  if (hit) return hit;
  const html = await getText(`https://www.youtube.com/@${handle}/shorts?hl=en`);
  const items = await walk(html, extractShorts);
  if (items.length) cache.set(key, { at: Date.now(), items });
  return items;
}
