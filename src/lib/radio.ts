"use client";

// SlowTurk radio — a module-level singleton so the stream keeps playing as
// you navigate between pages (the button component unmounts/remounts, but the
// <audio> lives here, outside React). HLS streams are played via hls.js,
// loaded on demand from a CDN so it isn't bundled.

type Status = "idle" | "loading" | "playing" | "error";

// SlowTurk's published HLS endpoints + several known mirrors. Tried in
// order; the first that plays wins.
const STREAMS = [
  // Moon Digital edges (primary Turkish radio CDN)
  "https://moondigitaledge1.radyotvonline.net/slowturk/playlist.m3u8",
  "https://moondigitaledge2.radyotvonline.net/slowturk/playlist.m3u8",
  "https://moondigitaledge3.radyotvonline.net/slowturk/playlist.m3u8",
  "https://moondigital.radyotvonline.net/slowturk/playlist.m3u8",
  // Direct stream IP (fallback when DNS misbehaves)
  "https://moondigitaledge2.mediatriple.net/slowturk/playlist.m3u8",
  // Shoutcast / icecast direct (last-ditch — usually still playable as audio)
  "https://moondigitaledge.radyotvonline.net/slowturk",
  // Aggregator stream
  "https://radio.garden/api/ara/content/listen/yV9KpRdr/channel.mp3",
];

let audio: HTMLAudioElement | null = null;
// hls.js instance — loaded dynamically from a CDN, so it's untyped here.
let hls: any = null;
let status: Status = "idle";
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
function setStatus(s: Status) { status = s; emit(); }

export function radioStatus(): Status { return status; }
export function subscribeRadio(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

// Allow the user to set their own SlowTurk URL (in case the published
// mirrors rotate). Stored in localStorage so it survives across sessions.
const CUSTOM_KEY = "brief.radio.slowturk.url";
export function getCustomRadioUrl(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(CUSTOM_KEY) ?? ""; } catch { return ""; }
}
export function setCustomRadioUrl(u: string) {
  try { localStorage.setItem(CUSTOM_KEY, u.trim()); } catch { /* noop */ }
}

// Loaded from a CDN, so the constructor is loosely typed.
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

async function playUrl(url: string): Promise<void> {
  if (!audio) { audio = new Audio(); audio.preload = "none"; audio.volume = 0.72; }
  const el = audio;
  teardownHls();

  // Safari & iOS play HLS natively.
  if (el.canPlayType("application/vnd.apple.mpegurl")) {
    el.src = url;
    await el.play();
    return;
  }
  // Everyone else: hls.js.
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
  // Last resort: hand the URL straight to the element.
  el.src = url;
  await el.play();
}

export function stopRadio() {
  try { audio?.pause(); } catch { /* noop */ }
  teardownHls();
  if (audio) audio.src = "";
  setStatus("idle");
}

export async function toggleRadio() {
  if (status === "playing" || status === "loading") { stopRadio(); return; }
  setStatus("loading");
  // User-supplied URL gets first crack, then the published mirrors.
  const custom = getCustomRadioUrl();
  const ordered = custom ? [custom, ...STREAMS] : STREAMS;
  for (const url of ordered) {
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
  setTimeout(() => { if (status === "error") setStatus("idle"); }, 4000);
}
