"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Shuffle, Tv, Paintbrush, Sprout, Film } from "lucide-react";
import { YouTubePlayer } from "./YouTubePlayer";

// Full-size ambient video at the top of the Fun page. Pick a channel via the
// tabs; each plays a RANDOM video drawn from that source's entire library
// (the server walks the whole catalogue and caches it). Shuffle for another.

interface LibResp { label?: string; url?: string; count?: number; videos?: Array<{ id: string; title: string }>; error?: string }
const fetcher = (u: string) => fetch(u).then((r) => r.json());

const TABS = [
  { id: "vlog",    label: "Country Life", icon: Sprout },
  { id: "bobross", label: "Bob Ross",     icon: Paintbrush },
  { id: "elif",    label: "Elif'in Hecesi", icon: Tv },
  { id: "turgut",  label: "Belgesel",     icon: Film },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function AmbientVideo() {
  const [tab, setTab] = useState<TabId>("vlog");
  const { data, isLoading } = useSWR<LibResp>(`/api/yt-library?source=${tab}`, fetcher, {
    keepPreviousData: false,
    revalidateOnFocus: false,
  });
  const videos = useMemo(() => data?.videos ?? [], [data]);
  const [idx, setIdx] = useState(0);
  const recent = useRef<number[]>([]);

  // New random pick whenever the library (tab) changes.
  useEffect(() => {
    if (videos.length) { setIdx(Math.floor(Math.random() * videos.length)); recent.current = []; }
  }, [videos]);

  function shuffle() {
    if (videos.length < 2) return;
    let pool = videos.map((_, i) => i).filter((i) => i !== idx && !recent.current.includes(i));
    if (pool.length === 0) pool = videos.map((_, i) => i).filter((i) => i !== idx);
    const n = pool[Math.floor(Math.random() * pool.length)];
    recent.current = [...recent.current, n].slice(-Math.min(videos.length - 1, 20));
    setIdx(n);
  }

  const cur = videos[idx];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`chip normal-case !px-2.5 !py-0.5 !text-[11px] inline-flex items-center gap-1 ${on ? "chip-active" : ""}`}
              >
                <Icon className="h-3 w-3" /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-2">
          {videos.length > 0 && <span className="tabular-nums">{idx + 1}/{videos.length}</span>}
          <button
            onClick={shuffle}
            disabled={videos.length < 2}
            className="btn-ghost !h-8 !w-8 disabled:opacity-40"
            title="Shuffle"
            aria-label="Shuffle"
          >
            <Shuffle className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 grid place-items-center">
        {isLoading && !cur && (
          <div className="text-muted text-sm">Loading library…</div>
        )}
        {!isLoading && !cur && (
          <div className="text-muted text-sm italic text-center px-4">
            Couldn&rsquo;t load this channel right now.
          </div>
        )}
        {cur && (
          <YouTubePlayer
            key={cur.id}
            videoId={cur.id}
            title={cur.title}
            aspect="video"
            className="h-full w-full rounded-2xl border border-[var(--rule)]"
          />
        )}
      </div>
    </div>
  );
}
