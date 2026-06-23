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
  // Pre-accept the consent interstitial. From datacenter / EU egress IPs
  // YouTube otherwise serves a consent.youtube.com gate whose HTML has NO
  // ytInitialData, which is exactly how a channel silently collapses to a
  // handful of videos. These cookies make it serve the real page.
  "Cookie": "CONSENT=YES+cb; SOCS=CAISEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg",
};

// Public web innertube key (embedded in every youtube.com page).
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const CLIENT = { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "US" };

// ===========================================================================
// Official YouTube Data API v3 — the ONLY upstream that's 100% reliable from
// a datacenter IP. Scraping youtube.com from Vercel egress gets the consent /
// bot wall, and the Piped/Invidious public mirrors are routinely down. With a
// (free) API key set in YOUTUBE_API_KEY this becomes the primary source and
// everything else is just a no-key fallback.
//   - quota: playlistItems.list = 1 unit/page (50 videos), videos.list = 1
//     unit/50 ids. A 500-video channel ≈ 20 units; the daily free quota is
//     10,000. Effectively free.
// ===========================================================================
const YT_API_KEY = process.env.YOUTUBE_API_KEY || process.env.YT_API_KEY || "";

function isoDurationSeconds(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

async function ytApiGet<T>(path: string): Promise<T | null> {
  if (!YT_API_KEY) return null;
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${YT_API_KEY}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

interface YtPlaylistItemsResp {
  items?: Array<{
    snippet?: { title?: string; resourceId?: { videoId?: string } };
    contentDetails?: { videoId?: string };
  }>;
  nextPageToken?: string;
}
interface YtVideosResp {
  items?: Array<{ id?: string; contentDetails?: { duration?: string } }>;
}

// Resolve @handle → UC… channel id via the official API.
async function resolveChannelIdApi(handle: string): Promise<string | null> {
  const j = await ytApiGet<{ items?: Array<{ id?: string }> }>(
    `channels?part=id&forHandle=${encodeURIComponent(handle.replace(/^@/, ""))}`,
  );
  return j?.items?.[0]?.id ?? null;
}

// Page through a playlist (an uploads playlist UU… or a regular playlist) via
// the official API, optionally dropping Shorts (duration ≤ 60s) — the uploads
// playlist mixes Shorts in with regular videos, which is why Belgesel showed
// Shorts. We resolve durations in a second batched pass.
async function fetchPlaylistViaApi(playlistId: string, target: number, excludeShorts: boolean): Promise<LibVideo[]> {
  if (!YT_API_KEY) return [];
  const items: LibVideo[] = [];
  let pageToken = "";
  for (let i = 0; i < 30 && items.length < target * 1.5; i++) {
    const j = await ytApiGet<YtPlaylistItemsResp>(
      `playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlistId)}${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    if (!j?.items?.length) break;
    for (const it of j.items) {
      const id = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
      const title = it.snippet?.title ?? "";
      if (id && title && title !== "Private video" && title !== "Deleted video") {
        items.push({ id, title });
      }
    }
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  if (!excludeShorts || items.length === 0) return items;

  // Drop Shorts: look up durations 50 at a time, keep anything over 60s
  // (and keep anything whose duration we couldn't resolve, to be safe).
  const keep: LibVideo[] = [];
  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50);
    const j = await ytApiGet<YtVideosResp>(
      `videos?part=contentDetails&maxResults=50&id=${batch.map((b) => b.id).join(",")}`,
    );
    const durById = new Map<string, number>();
    for (const v of j?.items ?? []) if (v.id) durById.set(v.id, isoDurationSeconds(v.contentDetails?.duration ?? ""));
    for (const b of batch) {
      const d = durById.get(b.id);
      if (d === undefined || d > 60) keep.push(b);
    }
  }
  return keep;
}


// Budgets sized to fit inside a Vercel HOBBY function's 10s hard kill (which
// caps regardless of `maxDuration`). All upstreams run in PARALLEL, so the
// route's wall-clock ≈ the slowest single source, not their sum. Keeping each
// source under ~8s is what makes the whole thing return in time — the earlier
// 25s budget was getting the function killed before it returned anything,
// which is exactly why the boxes went empty. 8s of innertube paging still
// pulls hundreds of videos.
const MAX_PAGES = 40;         // up to ~40 * 100 videos per walk
const TIME_BUDGET_MS = 8000;  // soft cap on a single source's walk
const MIN_CACHEABLE = 8;      // never cache an obviously-truncated result

export interface LibVideo { id: string; title: string }

interface CacheEntry { at: number; items: LibVideo[] }
const cache = new Map<string, CacheEntry>();
// 2h cache. The previous 6h window meant a single midnight-window blip
// (when YouTube hands out a consent gate to cloud egress IPs) locked the
// box to whatever truncated result the route happened to get for up to
// six hours. Two hours is still long enough to keep things fast.
const CACHE_TTL = 1000 * 60 * 60 * 2; // 2h
// "Last-good" cache: per-source biggest result we've ever seen that met the
// caller's minimum. This persists for a long time and is used ONLY as a
// fallback when the fresh fetch can't meet the minimum (e.g. YouTube
// throttled us through the consent gate). This is the fix for "the long
// view shrinks back to a tiny library after midnight" — when a fresh walk
// returns 80 instead of the user's expected 500, we serve the last 500-strong
// result instead of the truncated one.
const lastGood = new Map<string, CacheEntry>();
const LAST_GOOD_TTL = 1000 * 60 * 60 * 24 * 14; // 14 days
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
  // Official API first (reliable from any IP), then HTML scrape fallback.
  if (YT_API_KEY) {
    const viaApi = await resolveChannelIdApi(handle);
    if (viaApi) { idCache.set(handle, viaApi); return viaApi; }
  }
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

// Heuristic Shorts filter for paths that DON'T have duration info (the
// innertube + HTML walks). Logan in particular tags every Short with
// "#shorts" / "#Shorts" / "#short" in the title, and most creators do the
// same. This keeps the channel libraries free of Shorts even without the
// YouTube Data API key.
function looksLikeShortByTitle(title: string): boolean {
  return /#shorts?\b/i.test(title);
}
function dropShortsByTitle(items: LibVideo[]): LibVideo[] {
  return items.filter((v) => !looksLikeShortByTitle(v.title));
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

// Floor for caching: anything at/above this is worth keeping for the TTL.
// We DON'T gate on the caller's high per-source minimum here — doing that was
// a self-defeating bug: when a walk returned (say) 250 for a min-300 channel,
// nothing got cached, so EVERY request re-walked the whole library, which got
// the Vercel egress IP rate-limited by YouTube until walks returned 0 and the
// box went empty. Caching the 250 and serving it for the TTL (walk once, serve
// many) is exactly what the older, working version did. The client-side
// growing library then unions toward the full count over time.
const HARD_MIN_CACHE = 20;

function cached(key: string): LibVideo[] | null {
  const e = cache.get(key);
  if (e && Date.now() - e.at < CACHE_TTL && e.items.length > 0) return e.items;
  return null;
}

// The biggest result we've ever seen for this key (within 14 days). Used as a
// floor so a throttled walk never collapses the box below a known-good size.
function lastGoodFor(key: string): LibVideo[] | null {
  const e = lastGood.get(key);
  if (!e) return null;
  if (Date.now() - e.at > LAST_GOOD_TTL) return null;
  return e.items;
}

function rememberIfGood(key: string, items: LibVideo[]) {
  if (items.length < HARD_MIN_CACHE) return;
  const cur = lastGood.get(key);
  // Keep the better of (existing, new) — never trade down to a smaller result.
  if (cur && cur.items.length > items.length) return;
  lastGood.set(key, { at: Date.now(), items });
}

// The Atom upload feed — always exactly the latest 15, but rock-solid (it's a
// plain XML endpoint that isn't behind the consent gate). We merge it in so a
// channel can never collapse to a near-empty list even if the HTML walk fails.
async function fetchAtom(channelId: string): Promise<LibVideo[]> {
  const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!xml) return [];
  const out: LibVideo[] = [];
  const seen = new Set<string>();
  const re = /<entry>[\s\S]*?<yt:videoId>([\w-]{11})<\/yt:videoId>[\s\S]*?<title>([\s\S]*?)<\/title>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const title = m[2].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    out.push({ id, title });
  }
  return out;
}

function mergeInto(out: LibVideo[], seen: Set<string>, more: LibVideo[]) {
  for (const v of more) if (v.id && !seen.has(v.id)) { seen.add(v.id); out.push(v); }
}

// ===========================================================================
// Piped — public mirrors of YouTube's API operated as real servers, so they
// don't get the consent-gate / bot wall that cloud IPs hit on youtube.com
// directly. This is the most reliable upstream we have. We rotate through
// instances until one answers, then page through `nextpage` continuations.
// ===========================================================================

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.darkness.services",
  "https://api.piped.private.coffee",
];
// Bound the time spent probing Piped HARD so a slow/down Piped network can't
// blow the 10s function limit. Short per-instance timeout, small total budget;
// if Piped doesn't answer fast we just rely on the parallel YouTube sources.
const PIPED_PROBE_TIMEOUT = 3500;
const PIPED_PROBE_BUDGET = 5000;
// Total wall-clock for a Piped channel/playlist pull (probe + pagination).
const PIPED_TOTAL_BUDGET = 8000;

interface PipedStream { url?: string; title?: string; uploadedDate?: string; type?: string; duration?: number; isShort?: boolean }
interface PipedChannelResp { relatedStreams?: PipedStream[]; nextpage?: string | null; name?: string; id?: string }
interface PipedPlaylistResp { relatedStreams?: PipedStream[]; nextpage?: string | null; name?: string }

function videoIdFromUrl(url: string | undefined): string {
  if (!url) return "";
  const m = url.match(/[?&]v=([\w-]{11})/) || url.match(/^\/?watch\?v=([\w-]{11})/);
  return m ? m[1] : "";
}

// True when a Piped stream is a Short (vertical, <=60s). Piped's `/channel/<id>`
// returns the HOME tab which mixes regular videos AND Shorts — that's why
// Belgesel and others were showing shorts now. We exclude anything that
// either says it's a Short or has a duration of 60 seconds or less.
function isShort(s: PipedStream): boolean {
  if (s.isShort === true) return true;
  if (typeof s.duration === "number" && s.duration > 0 && s.duration <= 60) return true;
  if (s.url && /\/shorts\//.test(s.url)) return true;
  return false;
}

async function pipedJsonAny<T>(pathBuilder: (base: string) => string): Promise<{ base: string; data: T } | null> {
  const started = Date.now();
  for (const base of PIPED_INSTANCES) {
    if (Date.now() - started > PIPED_PROBE_BUDGET) break;
    try {
      const r = await fetch(pathBuilder(base), {
        headers: { "User-Agent": HEADERS["User-Agent"], Accept: "application/json" },
        signal: AbortSignal.timeout(PIPED_PROBE_TIMEOUT),
        cache: "no-store",
      });
      if (!r.ok) continue;
      const data = (await r.json()) as T;
      return { base, data };
    } catch { /* try next instance */ }
  }
  return null;
}

async function fetchChannelPiped(channelId: string, minCount: number): Promise<LibVideo[]> {
  const started = Date.now();
  const first = await pipedJsonAny<PipedChannelResp>((b) => `${b}/channel/${channelId}`);
  if (!first) return [];
  const out: LibVideo[] = [];
  const seen = new Set<string>();
  const pushAll = (streams: PipedStream[] | undefined) => {
    for (const s of streams ?? []) {
      if (isShort(s)) continue;        // exclude Shorts from regular video libs
      const id = videoIdFromUrl(s.url);
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push({ id, title: s.title ?? "" });
      }
    }
  };
  pushAll(first.data.relatedStreams);
  let next = first.data.nextpage;
  const base = first.base;
  let pages = 0;
  // Page until the total Piped budget runs out (must leave room under the
  // 10s function limit — this runs in parallel with the YouTube sources).
  while (next && pages < 40 && Date.now() - started < PIPED_TOTAL_BUDGET) {
    try {
      const r = await fetch(`${base}/nextpage/channel/${channelId}?nextpage=${encodeURIComponent(next)}`, {
        headers: { "User-Agent": HEADERS["User-Agent"], Accept: "application/json" },
        signal: AbortSignal.timeout(3500),
        cache: "no-store",
      });
      if (!r.ok) break;
      const j = (await r.json()) as PipedChannelResp;
      const before = out.length;
      pushAll(j.relatedStreams);
      next = j.nextpage ?? null;
      pages++;
      if (out.length === before && (j.relatedStreams?.length ?? 0) === 0) break;
      if (out.length >= minCount * 2) break; // we have plenty
    } catch { break; }
  }
  return out;
}

async function fetchPlaylistPiped(playlistId: string, minCount: number): Promise<LibVideo[]> {
  // Piped's playlist endpoint is `/playlists/<id>`.
  const first = await pipedJsonAny<PipedPlaylistResp>((b) => `${b}/playlists/${playlistId}`);
  if (!first) return [];
  const out: LibVideo[] = [];
  const seen = new Set<string>();
  const pushAll = (streams: PipedStream[] | undefined) => {
    for (const s of streams ?? []) {
      // Playlists never contain Shorts but we filter defensively.
      if (isShort(s)) continue;
      const id = videoIdFromUrl(s.url);
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push({ id, title: s.title ?? "" });
      }
    }
  };
  pushAll(first.data.relatedStreams);
  let next = first.data.nextpage;
  const base = first.base;
  const started = Date.now();
  let pages = 0;
  while (next && pages < 40 && Date.now() - started < PIPED_TOTAL_BUDGET) {
    try {
      const r = await fetch(`${base}/nextpage/playlists/${playlistId}?nextpage=${encodeURIComponent(next)}`, {
        headers: { "User-Agent": HEADERS["User-Agent"], Accept: "application/json" },
        signal: AbortSignal.timeout(3500),
        cache: "no-store",
      });
      if (!r.ok) break;
      const j = (await r.json()) as PipedPlaylistResp;
      const before = out.length;
      pushAll(j.relatedStreams);
      next = j.nextpage ?? null;
      pages++;
      if (out.length === before && (j.relatedStreams?.length ?? 0) === 0) break;
      if (out.length >= minCount * 2) break;
    } catch { break; }
  }
  return out;
}

export async function fetchPlaylistVideos(playlistId: string, minCache = MIN_CACHEABLE): Promise<LibVideo[]> {
  // v2 key prefix flushes any cached library that contained Shorts from
  // before the title-heuristic filter landed.
  const key = `pl2:${playlistId}`;
  const hit = cached(key);
  if (hit) return hit;
  const collected: LibVideo[] = [];
  const seen = new Set<string>();
  // Official API first when a key is set — reliable and complete.
  if (YT_API_KEY) {
    const api = await fetchPlaylistViaApi(playlistId, minCache, false);
    mergeInto(collected, seen, api);
  }
  // If the API got us there, skip the flaky scrapers. Otherwise race the
  // fallback sources in parallel and union them.
  if (collected.length < minCache) {
    const [piped, inner, html] = await Promise.all([
      fetchPlaylistPiped(playlistId, minCache),
      fetchPlaylistInnertube(playlistId),
      getText(`https://www.youtube.com/playlist?list=${playlistId}&hl=en`),
    ]);
    mergeInto(collected, seen, piped);
    mergeInto(collected, seen, inner);
    if (html) mergeInto(collected, seen, await walk(html, extractVideos));
  }
  // Drop anything tagged as a Short in its title (covers innertube/HTML
  // sources that don't expose duration).
  const out = dropShortsByTitle(collected);
  if (out.length >= HARD_MIN_CACHE) {
    cache.set(key, { at: Date.now(), items: out });
    rememberIfGood(key, out);
  }
  const fallback = lastGoodFor(key);
  if (fallback && fallback.length > out.length) return fallback;
  return out;
}

// Cache threshold for a CHANNEL specifically: don't pin a near-empty result
// for 6 hours. If we only got the Atom feed's 15 videos, that's a sign the
// uploads walk was throttled — retry on the next request instead of locking
// the box to "only ever 15 random videos" until the cache expires.
const CHANNEL_MIN_CACHE = 30;

// Direct innertube playlist fetch — gives JSON back without going through
// the consent-gate HTML the playlist?list= page returns from cloud egress
// IPs. The `browseId: "VL" + playlistId` is YouTube's own internal playlist
// browse endpoint. This is the MOST reliable path; HTML walk + Atom feed
// stay as fallbacks.
async function fetchPlaylistInnertube(playlistId: string): Promise<LibVideo[]> {
  const out: LibVideo[] = [];
  const seen = new Set<string>();
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}&prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": HEADERS["User-Agent"],
        "Accept-Language": HEADERS["Accept-Language"],
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": CLIENT.clientVersion,
        Origin: "https://www.youtube.com",
        Referer: "https://www.youtube.com/",
      },
      body: JSON.stringify({ context: { client: CLIENT }, browseId: "VL" + playlistId }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) return out;
    const text = await res.text();
    extractVideos(text, out, seen);
    let token = findContinuation(text);
    let pages = 0;
    const started = Date.now();
    while (token && pages < MAX_PAGES && Date.now() - started < TIME_BUDGET_MS) {
      const resp = await innertubeBrowse(token);
      if (!resp) break;
      const before = out.length;
      extractVideos(resp, out, seen);
      token = findContinuation(resp);
      pages++;
      if (out.length === before) break;
    }
  } catch { /* ignore — fall through to HTML walk */ }
  return out;
}

export async function fetchChannelVideos(handle: string, minCache = CHANNEL_MIN_CACHE): Promise<LibVideo[]> {
  // v2 prefix flushes anything cached from before the Shorts title filter.
  const key = `ch2:${handle}`;
  const hit = cached(key);
  if (hit) return hit;

  const id = await resolveChannelId(handle);
  const collected: LibVideo[] = [];
  const seen = new Set<string>();
  const uploads = id ? "UU" + id.slice(2) : null;

  // Official API first when a key is set — reliable from any IP, complete,
  // and drops Shorts via the duration pass.
  if (YT_API_KEY && uploads) {
    const api = await fetchPlaylistViaApi(uploads, minCache, true);
    mergeInto(collected, seen, api);
  }

  if (collected.length < minCache) {
    const [piped, innertube, uploadsHtml, vidsHtml, atom, invid] = await Promise.all([
      id ? fetchChannelPiped(id, minCache) : Promise.resolve([] as LibVideo[]),
      uploads ? fetchPlaylistInnertube(uploads) : Promise.resolve([] as LibVideo[]),
      uploads ? getText(`https://www.youtube.com/playlist?list=${uploads}&hl=en`) : Promise.resolve(null),
      getText(`https://www.youtube.com/@${handle}/videos?hl=en`),
      id ? fetchAtom(id) : Promise.resolve([] as LibVideo[]),
      id ? fetchChannelInvidious(id) : Promise.resolve([] as LibVideo[]),
    ]);
    mergeInto(collected, seen, piped);
    mergeInto(collected, seen, innertube);
    if (uploadsHtml) mergeInto(collected, seen, await walk(uploadsHtml, extractVideos));
    if (vidsHtml) mergeInto(collected, seen, await walk(vidsHtml, extractVideos));
    mergeInto(collected, seen, atom);
    mergeInto(collected, seen, invid);
  }

  // Final defensive filter: drop anything whose TITLE marks it a Short
  // (Logan tags every Short with "#shorts"). This covers every source that
  // doesn't expose duration metadata, so Shorts never leak in regardless
  // of whether the API key path is configured.
  const out = dropShortsByTitle(collected);

  if (out.length >= HARD_MIN_CACHE) {
    cache.set(key, { at: Date.now(), items: out });
    rememberIfGood(key, out);
  }
  const fallback = lastGoodFor(key);
  if (fallback && fallback.length > out.length) return fallback;
  return out;
}

// Public Invidious instances — independent mirrors of YouTube's API that DO
// expose a channel's full library (with pagination) and aren't behind the
// consent gate. We try a handful of well-known instances in order; failures
// are silent so the caller's normal fallbacks still kick in.
const INVIDIOUS_INSTANCES = [
  "https://invidious.privacyredirect.com",
  "https://yewtu.be",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
];

interface InvidVideo { videoId?: string; title?: string }
interface InvidChannelVideos { videos?: InvidVideo[]; continuation?: string }

async function fetchChannelInvidious(channelId: string): Promise<LibVideo[]> {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const out: LibVideo[] = [];
      const seen = new Set<string>();
      let continuation: string | undefined;
      let pages = 0;
      const started = Date.now();
      while (pages < MAX_PAGES && Date.now() - started < TIME_BUDGET_MS) {
        const url = continuation
          ? `${base}/api/v1/channels/${channelId}/videos?continuation=${encodeURIComponent(continuation)}`
          : `${base}/api/v1/channels/${channelId}/videos?sort_by=newest`;
        const res = await fetch(url, {
          headers: { "User-Agent": HEADERS["User-Agent"], Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        });
        if (!res.ok) break;
        const j = (await res.json()) as InvidChannelVideos;
        const items = j?.videos ?? [];
        if (items.length === 0) break;
        const before = out.length;
        for (const v of items) {
          if (v.videoId && !seen.has(v.videoId)) {
            seen.add(v.videoId);
            out.push({ id: v.videoId, title: v.title ?? "" });
          }
        }
        if (out.length === before) break;
        continuation = j.continuation;
        pages++;
        if (!continuation) break;
      }
      if (out.length > 0) return out;
    } catch { /* try next instance */ }
  }
  return [];
}

export async function fetchChannelShorts(handle: string): Promise<LibVideo[]> {
  const key = `sh:${handle}`;
  const hit = cached(key);
  if (hit) return hit;
  const html = await getText(`https://www.youtube.com/@${handle}/shorts?hl=en`);
  const items = await walk(html, extractShorts);
  if (items.length >= MIN_CACHEABLE) {
    cache.set(key, { at: Date.now(), items });
    rememberIfGood(key, items);
    return items;
  }
  const fallback = lastGoodFor(key);
  if (fallback && fallback.length > items.length) return fallback;
  return items;
}
