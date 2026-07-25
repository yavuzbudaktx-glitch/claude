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
// ---- YouTube: IFrame Player API (reliable audio) ---------------------------
// The old approach dropped a hidden `autoplay=1` iframe into the page. That
// only plays WITH SOUND when the browser grants the iframe *transient*
// activation at load-time — fragile, and the reason picking a station could
// stay silent. The IFrame Player API is the reliable path: we build ONE player
// up front (warmed the moment the picker opens), then on the user's pick call
// unMute()+playVideo() on it. Those succeed on *sticky* activation (any prior
// click on the page), which always holds by the time a station is chosen.
//
// A raw <iframe> embed is kept only as a last-ditch fallback if the API can't
// load at all; it lives in its own wrapper so it never clobbers the player.
let ytWrap: HTMLDivElement | null = null;      // hosts the API player
let embedWrap: HTMLDivElement | null = null;   // hosts the fallback iframe
let ytPlayer: any = null;
let ytPlayerReady = false;
let ytApiPromise: Promise<void> | null = null;
let ytPlayerPromise: Promise<any> | null = null;

function loadYtApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") { try { prev(); } catch { /* noop */ } }
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => resolve();   // fall through to the iframe-embed path
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

function ytHost(): HTMLElement {
  if (!ytWrap) {
    ytWrap = document.createElement("div");
    ytWrap.setAttribute("aria-hidden", "true");
    // Kept technically on-screen but invisible: a real (if tiny) box plays more
    // reliably than a display:none / 0×0 one.
    ytWrap.style.cssText =
      "position:fixed;left:0;bottom:0;width:180px;height:101px;opacity:0.001;pointer-events:none;z-index:-1;overflow:hidden;";
    document.body.appendChild(ytWrap);
  }
  const host = document.createElement("div");
  ytWrap.appendChild(host);
  return host;
}

// Build (or return) the singleton player. Safe to call repeatedly; resolves to
// null if the API can't load so callers can fall back.
export function ensureYtPlayer(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (ytPlayer && ytPlayerReady) return Promise.resolve(ytPlayer);
  if (ytPlayerPromise) return ytPlayerPromise;
  ytPlayerPromise = loadYtApi()
    .then(() => {
      const w = window as any;
      if (!w.YT || !w.YT.Player) return null;
      return new Promise<any>((resolve) => {
        ytPlayer = new w.YT.Player(ytHost(), {
          width: "180",
          height: "101",
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => { ytPlayerReady = true; resolve(ytPlayer); },
          },
        });
      });
    })
    .catch(() => null);
  return ytPlayerPromise;
}

// Apply a load command then force audible playback. Returns false if the
// player isn't usable so the caller can fall back to the raw embed.
function ytApplyAndPlay(load: (p: any) => void): boolean {
  if (!ytPlayer || !ytPlayerReady) return false;
  try {
    load(ytPlayer);
    try { ytPlayer.unMute?.(); ytPlayer.setVolume?.(100); } catch { /* noop */ }
    ytPlayer.playVideo?.();
    return true;
  } catch {
    return false;
  }
}

// Fallback only: a hidden autoplay <iframe> in its OWN wrapper.
function mountYouTubeEmbed(src: string) {
  if (typeof document === "undefined") return;
  if (!embedWrap) {
    embedWrap = document.createElement("div");
    embedWrap.style.cssText = "position:fixed;left:-9999px;top:0;width:320px;height:180px;";
    embedWrap.setAttribute("aria-hidden", "true");
    document.body.appendChild(embedWrap);
  }
  embedWrap.innerHTML =
    `<iframe src="${src}" allow="autoplay; encrypted-media" ` +
    `width="320" height="180" frameborder="0"></iframe>`;
}
function mountYouTube(videoId: string) {
  mountYouTubeEmbed(
    `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&controls=0&loop=1&playlist=${videoId}&enablejsapi=1`,
  );
}
function unmountYouTube() {
  try { ytPlayer?.stopVideo?.(); } catch { /* noop */ }
  if (embedWrap) { embedWrap.innerHTML = ""; }
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

// Pull the Relaxing Holy Quran library (cached server-side). Returns the video
// ids plus the channel's uploads-playlist id, which the PLAYER can expand by
// itself when the server-side enumeration comes back empty.
interface QuranLib { ids: string[]; uploads: string | null }
async function fetchQuranLibrary(): Promise<QuranLib> {
  try {
    const r = await fetch("/api/yt-library?source=quran", { signal: AbortSignal.timeout(9000) });
    if (!r.ok) {
      // Even an error response carries the uploads id when we could resolve it.
      const j = (await r.json().catch(() => null)) as { uploads?: string } | null;
      return { ids: [], uploads: j?.uploads ?? null };
    }
    const j = (await r.json()) as { videos?: Array<{ id?: string }>; uploads?: string };
    const vids = Array.isArray(j.videos) ? j.videos : [];
    return {
      ids: vids.map((v) => (v?.id ?? "").trim()).filter(Boolean),
      uploads: j.uploads ?? null,
    };
  } catch {
    return { ids: [], uploads: null };
  }
}

// Warm the Quran library BEFORE the user picks it, so the pick handler never
// has to await a network round-trip (which would also cost us the click's
// user-activation). Fire-and-forget.
let quranLib: QuranLib | null = null;
let quranPrefetching = false;
export function prefetchQuranLibrary() {
  if (quranLib?.ids.length || quranPrefetching) return;
  quranPrefetching = true;
  fetchQuranLibrary()
    .then((lib) => { if (lib.ids.length || lib.uploads) quranLib = lib; })
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

  // Silence any audio-element stream that might be running.
  try { audio?.pause(); } catch { /* noop */ }
  teardownHls();

  // Make sure the player exists. Warmed on picker-open, so this usually
  // resolves instantly; even if it has to await, playVideo() still succeeds
  // afterwards because the page already has sticky user activation.
  await ensureYtPlayer();

  try {
    if (source === "kral") {
      lastPlayedUrl = `yt:${KRAL_LIVE_ID}`;
      if (ytApplyAndPlay((p) => p.loadVideoById(KRAL_LIVE_ID))) { setStatus("playing"); return; }
      await playUrl(`yt:${KRAL_LIVE_ID}`);       // fallback embed
      setStatus("playing");
      return;
    }

    if (source === "mix") {
      lastPlayedUrl = `ytmix:${MIX_LIST_ID}`;
      // Start somewhere RANDOM in the mix, and turn YouTube's own shuffle on.
      // Previously this always passed index 0, so every play began with the
      // same track. A generated radio mix is ~25-50 items; a random index in
      // [0,24] is always in range, and setShuffle re-orders the rest.
      const startAt = Math.floor(Math.random() * 25);
      const ok = ytApplyAndPlay((p) => {
        if (typeof p.loadPlaylist === "function") {
          p.loadPlaylist({ list: MIX_LIST_ID, listType: "playlist", index: startAt });
          try { p.setShuffle?.(true); } catch { /* noop */ }
        } else {
          p.loadVideoById(MIX_SEED_ID);
        }
      });
      if (ok) { setStatus("playing"); return; }
      const src =
        `https://www.youtube.com/embed/${MIX_SEED_ID}` +
        `?autoplay=1&mute=0&controls=0&enablejsapi=1&list=${MIX_LIST_ID}`;
      await playUrl(ytEmbedUrl(src));            // fallback embed
      setStatus("playing");
      return;
    }

    // quran — shuffle the whole library and play it as a looping playlist.
    // Prefer the prefetched cache (warmed on picker-open) so nothing blocks.
    const lib = quranLib ?? (await fetchQuranLibrary());
    // Remember it so a second pick reshuffles the same library instantly
    // instead of re-hitting the route.
    if (!quranLib && (lib.ids.length || lib.uploads)) quranLib = lib;
    const ids = shuffled(lib.ids);
    if (ids.length) {
      lastPlayedUrl = "ytquran";
      // Shuffled order AND a random start index — belt and braces so two plays
      // in a row don't open on the same recitation.
      const startAt = Math.floor(Math.random() * ids.length);
      const ok = ytApplyAndPlay((p) => {
        p.loadPlaylist(ids, startAt);
        try { p.setShuffle?.(true); p.setLoop?.(true); } catch { /* noop */ }
      });
      if (ok) { setStatus("playing"); return; }
      const src =
        `https://www.youtube.com/embed/${ids[startAt]}` +
        `?autoplay=1&mute=0&controls=0&enablejsapi=1&loop=1&playlist=${ids.join(",")}`;
      await playUrl(ytEmbedUrl(src));            // fallback embed
      setStatus("playing");
      return;
    }

    // The server couldn't enumerate the channel (YouTube rate-limits Vercel's
    // datacenter IPs). Second chance: hand the channel's *uploads playlist* to
    // the player and let IT do the fetching — that request comes from the
    // user's own browser, which isn't blocked. Random index = a different
    // recitation each time.
    if (lib.uploads) {
      lastPlayedUrl = "ytquran";
      const startAt = Math.floor(Math.random() * 30);
      const ok = ytApplyAndPlay((p) => {
        p.loadPlaylist({ list: lib.uploads, listType: "playlist", index: startAt });
        try { p.setShuffle?.(true); p.setLoop?.(true); } catch { /* noop */ }
      });
      if (ok) { setStatus("playing"); return; }
    }

    // Library unavailable — fall back to the live Kral broadcast so the button
    // still does something audible.
    lastPlayedUrl = `yt:${KRAL_LIVE_ID}`;
    if (ytApplyAndPlay((p) => p.loadVideoById(KRAL_LIVE_ID))) { setStatus("playing"); return; }
    await playUrl(`yt:${KRAL_LIVE_ID}`);
    setStatus("playing");
  } catch {
    teardownHls();
    setStatus("error");
    setTimeout(() => { if (status === "error") setStatus("idle"); }, 4500);
  }
}
