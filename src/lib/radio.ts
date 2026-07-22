"use client";

// SlowTurk radio — a module-level singleton so the stream keeps playing as
// you navigate between pages. The reliable way to get a working stream URL is
// to resolve it at play-time from the Radio Browser community API (which
// tracks live, https-capable stream URLs for thousands of stations) rather
// than hard-coding mirrors that rotate. Hard-coded HLS endpoints + a
// user-supplied URL are kept as fallbacks. HLS is played via hls.js, loaded
// on demand from a CDN.

type Status = "idle" | "loading" | "playing" | "error";

// Last-resort hard-coded candidates (Moon Digital / radyotvonline HLS) +
// a YouTube live broadcast as the absolute fallback when every audio stream
// is unreachable from the browser. The yt: scheme is intercepted below and
// played via a hidden YouTube IFrame instead of <audio>.
const FALLBACK_STREAMS = [
  "https://moondigitaledge1.radyotvonline.net/slowturk/playlist.m3u8",
  "https://moondigitaledge2.radyotvonline.net/slowturk/playlist.m3u8",
  "https://moondigitaledge3.radyotvonline.net/slowturk/playlist.m3u8",
  "yt:6He9sFxFv8Y",  // Kral Müzik Akustik 24/7 broadcast
];

// Radio Browser mirrors (https, CORS-enabled, built for apps like this).
const RB_SERVERS = [
  "https://de2.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://de1.api.radio-browser.info",
];

let audio: HTMLAudioElement | null = null;
let hls: any = null;
let status: Status = "idle";
let resolved: string[] | null = null; // cached resolved stream URLs
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
function setStatus(s: Status) { status = s; emit(); }

export function radioStatus(): Status { return status; }
export function subscribeRadio(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const CUSTOM_KEY = "brief.radio.slowturk.url";
export function getCustomRadioUrl(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(CUSTOM_KEY) ?? ""; } catch { return ""; }
}
export function setCustomRadioUrl(u: string) {
  try { localStorage.setItem(CUSTOM_KEY, u.trim()); } catch { /* noop */ }
}

interface RbStation { url?: string; url_resolved?: string; name?: string; votes?: number; }

// Ask Radio Browser for SlowTurk's live stream URLs (https only, so we never
// trip mixed-content blocking on our https site). Cached after first success.
async function resolveSlowTurk(): Promise<string[]> {
  if (resolved && resolved.length) return resolved;
  for (const base of RB_SERVERS) {
    try {
      const r = await fetch(`${base}/json/stations/search?name=slow&limit=120&hidebroken=true&order=votes&reverse=true`, {
        headers: { "User-Agent": "brief-dashboard/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(7000),
      });
      if (!r.ok) continue;
      const arr = (await r.json()) as RbStation[];
      const urls = arr
        .filter((s) => /slow\s*t[uü]rk/i.test(s.name ?? ""))
        .map((s) => (s.url_resolved || s.url || "").trim())
        .filter((u) => u.startsWith("https://"));
      const uniq = Array.from(new Set(urls));
      if (uniq.length) { resolved = uniq; return uniq; }
    } catch {
      // try next mirror
    }
  }
  return [];
}

function loadHls(): Promise<any> {
  const w = window as unknown as { Hls?: unknown };
  if (w.Hls) return Promise.resolve(w.Hls);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
    s.async = true;
    s.onload = () => resolve((window as unknown as { Hls?: unknown }).Hls);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function teardownHls() {
  if (hls) { try { hls.destroy(); } catch { /* noop */ } hls = null; }
}

// ---- YouTube fallback (a hidden iframe player) -----------------------------
// Some "stations" we want as the last-resort fallback only exist as YouTube
// 24/7 broadcasts (Kral Müzik Akustik, etc). YouTube can't be played via
// <audio>, so when the URL starts with `yt:` we mount a hidden iframe instead.
// One iframe at a time; tear down on stop.
let ytWrap: HTMLDivElement | null = null;
// Mount a hidden YouTube IFrame from a full embed `src`. `enablejsapi=1` lets
// us send commands; `mute=0` keeps it audible; the click that triggered this
// is a real user gesture, so autoplay-with-sound is allowed. One iframe at a
// time.
function mountYouTubeEmbed(src: string) {
  if (typeof document === "undefined") return;
  if (!ytWrap) {
    ytWrap = document.createElement("div");
    ytWrap.style.cssText = "position:fixed;left:-9999px;top:0;width:320px;height:180px;";
    ytWrap.setAttribute("aria-hidden", "true");
    document.body.appendChild(ytWrap);
  }
  ytWrap.innerHTML =
    `<iframe src="${src}" allow="autoplay; encrypted-media" ` +
    `width="320" height="180" frameborder="0"></iframe>`;
}
// Single video looped forever — a `playlist` value equal to the id makes a
// non-live video loop; live broadcasts already loop.
function mountYouTube(videoId: string) {
  mountYouTubeEmbed(
    `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&controls=0&loop=1&playlist=${videoId}&enablejsapi=1`,
  );
}
function unmountYouTube() {
  if (ytWrap) { ytWrap.innerHTML = ""; }
}

// Indefinite playback — radio streams drop on network glitches, sleeping
// tabs, and after long idle periods (the common ~5 minute symptom). When the
// element errors or quietly ends, automatically resume from the same URL.
// Bumps are throttled so we never burn through every candidate URL at once.
let lastPlayedUrl: string | null = null;
let intentionallyStopped = true;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReconnect() {
  if (intentionallyStopped) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(15000, 1500 * Math.pow(1.6, reconnectAttempts));
  reconnectAttempts++;
  reconnectTimer = setTimeout(async () => {
    if (intentionallyStopped) return;
    setStatus("loading");
    try {
      if (lastPlayedUrl) {
        await playUrl(lastPlayedUrl);
        setStatus("playing");
        reconnectAttempts = 0;
        return;
      }
    } catch { /* fall through to full retry */ }
    // Re-resolve from scratch
    await toggleRadio(); // toggle off
    await toggleRadio(); // toggle back on
  }, delay);
}

function bindKeepAlive(el: HTMLAudioElement) {
  // Bind once. Each event nudges a reconnect if the user hasn't intentionally
  // stopped — covering network blips, station rotation, and tab-throttled
  // idle drops.
  if ((el as any)._briefBound) return;
  (el as any)._briefBound = true;
  el.addEventListener("error", () => { if (!intentionallyStopped) scheduleReconnect(); });
  el.addEventListener("ended", () => { if (!intentionallyStopped) scheduleReconnect(); });
  el.addEventListener("stalled", () => { if (!intentionallyStopped) scheduleReconnect(); });
  el.addEventListener("waiting", () => { /* buffering — just wait */ });
  el.addEventListener("playing", () => { reconnectAttempts = 0; });
  // Resume on tab refocus if we got dropped.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !intentionallyStopped && el.paused) {
      scheduleReconnect();
    }
  });
}

async function playUrl(url: string): Promise<void> {
  // YouTube intercept — `yt:VIDEO_ID` mounts a hidden iframe instead of
  // trying to feed YouTube into the <audio> element.
  if (url.startsWith("yt:")) {
    const id = url.slice(3);
    // Make sure the <audio> element isn't also playing in the background.
    try { audio?.pause(); } catch { /* noop */ }
    teardownHls();
    lastPlayedUrl = url;
    mountYouTube(id);
    return;
  }
  // `ytembed:<encoded full embed src>` — used by the multi-video / mix radio
  // sources below. Encoding the whole embed URL keeps reconnect (which replays
  // lastPlayedUrl through playUrl) working uniformly.
  if (url.startsWith("ytembed:")) {
    const src = decodeURIComponent(url.slice("ytembed:".length));
    try { audio?.pause(); } catch { /* noop */ }
    teardownHls();
    lastPlayedUrl = url;
    mountYouTubeEmbed(src);
    return;
  }
  // For audio streams we leave any prior YouTube iframe up only until the
  // first audio frame arrives; tear it down so we don't double-broadcast.
  unmountYouTube();

  // NOTE: do NOT set crossOrigin — radio streams rarely send CORS headers,
  // and requiring them ("anonymous") silently breaks plain <audio> playback.
  if (!audio) { audio = new Audio(); audio.preload = "none"; audio.volume = 0.72; }
  const el = audio;
  bindKeepAlive(el);
  lastPlayedUrl = url;
  teardownHls();

  const isHls = /\.m3u8(\?|$)/i.test(url);
  if (!isHls) {
    // Direct icecast / mp3 / aac stream.
    el.src = url;
    await el.play();
    return;
  }
  if (el.canPlayType("application/vnd.apple.mpegurl")) {
    el.src = url;
    await el.play();
    return;
  }
  const Hls = await loadHls();
  if (Hls && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true });
    hls.loadSource(url);
    hls.attachMedia(el);
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("hls timeout")), 12000);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { clearTimeout(to); resolve(); });
      hls.on(Hls.Events.ERROR, (_e: unknown, d: any) => {
        if (d?.fatal) { clearTimeout(to); reject(new Error("hls fatal")); }
      });
    });
    await el.play();
    return;
  }
  el.src = url;
  await el.play();
}

export function stopRadio() {
  intentionallyStopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempts = 0;
  try { audio?.pause(); } catch { /* noop */ }
  teardownHls();
  unmountYouTube();
  if (audio) audio.src = "";
  setStatus("idle");
}

export async function toggleRadio() {
  if (status === "playing" || status === "loading") { stopRadio(); return; }
  intentionallyStopped = false;
  reconnectAttempts = 0;
  setStatus("loading");

  // Primary station is now the Kral Müzik Akustik 24/7 YouTube broadcast —
  // the SlowTurk HLS mirrors keep dropping after a few minutes, the YouTube
  // live stream does not. SlowTurk (resolved + hard-coded) stays as fallback.
  const custom = getCustomRadioUrl();
  const primary = "yt:6He9sFxFv8Y";

  // Try Kral first; only spend time resolving SlowTurk if it fails.
  for (const url of [...(custom ? [custom] : []), primary]) {
    try { await playUrl(url); setStatus("playing"); return; }
    catch { /* next */ }
  }
  const fromRb = await resolveSlowTurk();
  for (const url of [...fromRb, ...FALLBACK_STREAMS]) {
    try {
      await playUrl(url);
      setStatus("playing");
      return;
    } catch {
      // try next candidate
    }
  }
  teardownHls();
  setStatus("error");
  setTimeout(() => { if (status === "error") setStatus("idle"); }, 4500);
}

// ---- Pick-a-source radio ---------------------------------------------------
// The button offers three picks before playing:
//   kral  — the live Kral Müzik Akustik 24/7 YouTube broadcast
//   quran — a random video from the Relaxing Holy Quran channel (a shuffled
//           playlist of the whole library, looped)
//   mix   — YouTube's personalized radio "mix" seeded from one track (the RDEM
//           list is a generated station that can't be enumerated, so we hand
//           the seed + list to YouTube and let it autoplay the mix)
export type RadioSource = "kral" | "quran" | "mix";

const KRAL_LIVE_ID = "6He9sFxFv8Y";
const MIX_SEED_ID = "7t2paZZDSso";
const MIX_LIST_ID = "RDEMDGoxo2Ts4QVsaNGNvhxDKw";

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pull the Relaxing Holy Quran library (cached server-side) and return the
// video ids. Empty array on any failure so the caller can fall back.
async function fetchQuranIds(): Promise<string[]> {
  try {
    const r = await fetch("/api/yt-library?source=quran", { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { videos?: Array<{ id?: string }> };
    const vids = Array.isArray(j.videos) ? j.videos : [];
    return vids.map((v) => (v?.id ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// Warm the Quran library BEFORE the user picks it. Browsers only allow
// autoplay-with-sound from inside a real user gesture; if we had to await a
// network round-trip after the click, the iframe would mount too late and be
// blocked (muted). Prefetching on picker-open means the ids are already in
// hand, so the pick handler can mount synchronously. Fire-and-forget.
let quranIdsCache: string[] | null = null;
let quranPrefetching = false;
export function prefetchQuranLibrary() {
  if (quranIdsCache?.length || quranPrefetching) return;
  quranPrefetching = true;
  fetchQuranIds()
    .then((ids) => { if (ids.length) quranIdsCache = ids; })
    .catch(() => { /* noop */ })
    .finally(() => { quranPrefetching = false; });
}

function ytEmbedUrl(src: string): string {
  return `ytembed:${encodeURIComponent(src)}`;
}

export async function playRadioSource(source: RadioSource) {
  if (status === "playing" || status === "loading") stopRadio();
  intentionallyStopped = false;
  reconnectAttempts = 0;
  setStatus("loading");

  try {
    if (source === "kral") {
      await playUrl(`yt:${KRAL_LIVE_ID}`);
      setStatus("playing");
      return;
    }

    if (source === "mix") {
      // Seed video + generated-radio list. YouTube autoplays the whole mix.
      const src =
        `https://www.youtube.com/embed/${MIX_SEED_ID}` +
        `?autoplay=1&mute=0&controls=0&enablejsapi=1&list=${MIX_LIST_ID}`;
      await playUrl(ytEmbedUrl(src));
      setStatus("playing");
      return;
    }

    // quran — shuffle the library and play it as a looping playlist. The first
    // id is the embed target; `playlist=` lists the rest (plus the first) so
    // `loop=1` cycles the whole set indefinitely. Prefer the prefetched cache
    // so the mount stays inside the click gesture (autoplay-with-sound); only
    // fall back to a live fetch if the prefetch hasn't landed yet.
    const ids = shuffled(quranIdsCache?.length ? quranIdsCache : await fetchQuranIds());
    if (ids.length) {
      const first = ids[0];
      const list = ids.join(",");
      const src =
        `https://www.youtube.com/embed/${first}` +
        `?autoplay=1&mute=0&controls=0&enablejsapi=1&loop=1&playlist=${list}`;
      await playUrl(ytEmbedUrl(src));
      setStatus("playing");
      return;
    }
    // Library fetch failed — fall back to the live Kral broadcast so the button
    // still does something audible.
    await playUrl(`yt:${KRAL_LIVE_ID}`);
    setStatus("playing");
  } catch {
    teardownHls();
    setStatus("error");
    setTimeout(() => { if (status === "error") setStatus("idle"); }, 4500);
  }
}
