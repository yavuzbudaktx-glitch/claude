"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { useZuya } from "@/components/zuya/ZuyaProvider";

// A small waveform-ish set of bars — purely decorative, deterministic per clip
// so it doesn't reshuffle on every render.
function bars(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: 22 }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.35 + ((h >>> (i % 8)) % 100) / 100 * 0.65;
  });
}

function fmt(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function VoiceMessage({
  path,
  dur,
  mine,
}: {
  path: string;
  dur: number | null;
  mine: boolean;
}) {
  const { supabase } = useZuya();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [total, setTotal] = useState(dur ?? 0);
  const [loading, setLoading] = useState(false);
  const wave = bars(path);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      return;
    }
    let src = url;
    if (!src) {
      setLoading(true);
      const { data } = await supabase.storage.from("zuya").createSignedUrl(path, 3600);
      setLoading(false);
      if (!data?.signedUrl) return;
      src = data.signedUrl;
      setUrl(src);
    }
    let el = audioRef.current;
    if (!el) {
      el = new Audio(src);
      audioRef.current = el;
      el.addEventListener("timeupdate", () => setPos(el!.currentTime));
      el.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(el!.duration)) setTotal(el!.duration);
      });
      el.addEventListener("play", () => setPlaying(true));
      el.addEventListener("pause", () => setPlaying(false));
      el.addEventListener("ended", () => {
        setPlaying(false);
        setPos(0);
      });
    }
    void el.play();
  }

  const pct = total > 0 ? Math.min(1, pos / total) : 0;

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-2.5 min-w-[168px] text-left"
      aria-label={playing ? "Pause voice message" : "Play voice message"}
    >
      <span
        className={`grid place-items-center h-8 w-8 rounded-full shrink-0 ${
          mine ? "bg-white/20 text-white" : "bg-[var(--accent-soft)] text-accent"
        }`}
      >
        {loading ? (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 translate-x-[1px]" />
        )}
      </span>
      <span className="flex items-center gap-[2px] h-6 flex-1">
        {wave.map((v, i) => {
          const filled = i / wave.length <= pct;
          return (
            <span
              key={i}
              className="w-[3px] rounded-full transition-colors"
              style={{
                height: `${Math.round(v * 22)}px`,
                background: filled
                  ? mine
                    ? "rgba(255,255,255,0.95)"
                    : "var(--accent)"
                  : mine
                    ? "rgba(255,255,255,0.4)"
                    : "var(--rule)",
              }}
            />
          );
        })}
      </span>
      <span className={`text-[10px] tabular-nums shrink-0 ${mine ? "text-white/80" : "text-muted"}`}>
        {fmt(playing || pos > 0 ? total - pos : total)}
      </span>
    </button>
  );
}
