"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, ExternalLink } from "lucide-react";

// A YouTube player with OUR OWN heads-up display instead of YouTube's. The
// embed runs with controls=0, so there is no native YouTube HUD; we draw a
// minimal control bar (play/pause, mute, scrubber, open-in-YouTube) that
// appears on hover and disappears the instant the pointer leaves the box.
//
// Reused by the ambient-video box, the nature-short box, and anywhere else
// that wants a clean, hover-only player.

// ---- IFrame API loader (singleton) ----------------------------------------
let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT && w.YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return apiPromise;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function YouTubePlayer({
  videoId,
  title,
  poster,
  loop = false,
  aspect = "video",
  className = "",
}: {
  videoId: string;
  title?: string;
  poster?: string;
  loop?: boolean;
  aspect?: "video" | "short";
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [hud, setHud] = useState(false);

  // Reset to the poster whenever the video changes.
  useEffect(() => {
    setStarted(false); setReady(false); setPlaying(false); setCur(0); setDur(0);
    if (playerRef.current) { try { playerRef.current.destroy(); } catch { /* noop */ } playerRef.current = null; }
  }, [videoId]);

  // Build the player once the user presses play (a real gesture → sound works).
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    loadApi().then(() => {
      if (cancelled || !hostRef.current) return;
      const YT = (window as unknown as { YT: any }).YT;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        playerVars: {
          autoplay: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1,
          fs: 0, iv_load_policy: 3, disablekb: 1,
          loop: loop ? 1 : 0, playlist: loop ? videoId : undefined,
        },
        events: {
          onReady: (e: any) => {
            if (cancelled) return;
            setReady(true);
            setDur(e.target.getDuration?.() ?? 0);
            setMuted(!!e.target.isMuted?.());
            try { e.target.playVideo(); } catch { /* noop */ }
          },
          onStateChange: (e: any) => {
            // 1 = playing, 2 = paused, 0 = ended
            setPlaying(e.data === 1);
            if (e.data === 1) setDur(e.target.getDuration?.() ?? 0);
          },
        },
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, videoId]);

  // Poll progress while playing.
  useEffect(() => {
    if (!ready || !playing) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (p?.getCurrentTime) { setCur(p.getCurrentTime()); setDur(p.getDuration() || dur); }
    }, 350);
    return () => clearInterval(t);
  }, [ready, playing, dur]);

  const togglePlay = useCallback(() => {
    const p = playerRef.current; if (!p) return;
    if (playing) p.pauseVideo(); else p.playVideo();
  }, [playing]);
  const toggleMute = useCallback(() => {
    const p = playerRef.current; if (!p) return;
    if (p.isMuted()) { p.unMute(); setMuted(false); } else { p.mute(); setMuted(true); }
  }, []);
  const seek = useCallback((v: number) => {
    const p = playerRef.current; if (!p) return;
    p.seekTo(v, true); setCur(v);
  }, []);

  const ratio = aspect === "short" ? "9 / 16" : "16 / 9";
  const thumb = poster || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <div
      className={`relative overflow-hidden bg-black ${className}`}
      style={{ aspectRatio: ratio }}
      onMouseEnter={() => setHud(true)}
      onMouseLeave={() => setHud(false)}
      onMouseMove={() => setHud(true)}
    >
      {!started ? (
        <button onClick={() => setStarted(true)} aria-label="Play" className="absolute inset-0 group">
          <img src={thumb} alt={title ?? ""} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/15 backdrop-blur-md border border-white/30 text-white shadow-2xl transition group-hover:scale-110 group-hover:bg-white/25">
              <Play className="h-7 w-7 translate-x-[2px]" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
          {title && (
            <span className="absolute inset-x-0 bottom-0 p-3 text-left">
              <span className="block text-[13px] font-semibold text-white leading-snug line-clamp-2 drop-shadow">{title}</span>
            </span>
          )}
        </button>
      ) : (
        <>
          <div className="absolute inset-0">
            <div ref={hostRef} className="h-full w-full" />
          </div>
          {/* click-to-toggle layer (sits under the HUD bar) */}
          <button aria-label={playing ? "Pause" : "Play"} onClick={togglePlay} className="absolute inset-0 z-[1]" />

          {/* custom HUD — only while hovering */}
          <div
            className={`absolute inset-x-0 bottom-0 z-[2] p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-150 ${hud ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <input
              type="range"
              min={0}
              max={Math.max(1, dur)}
              value={Math.min(cur, dur || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full h-1 mb-2 accent-[var(--accent)] cursor-pointer"
              aria-label="Seek"
            />
            <div className="flex items-center gap-3 text-white">
              <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="hover:text-[var(--accent)] transition">
                {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
              </button>
              <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="hover:text-[var(--accent)] transition">
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <span className="text-[11px] font-mono tabular-nums text-white/85">{fmt(cur)} / {fmt(dur)}</span>
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label="Open in YouTube"
                className="ml-auto hover:text-[var(--accent)] transition"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          {!ready && (
            <div className="absolute inset-0 z-[1] grid place-items-center bg-black/40 text-white/80 text-sm">Loading…</div>
          )}
        </>
      )}
    </div>
  );
}
