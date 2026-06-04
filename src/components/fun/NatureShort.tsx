"use client";

import useSWR from "swr";
import { useEffect, useMemo } from "react";
import { RotateCcw, Leaf } from "lucide-react";
import { localDateKey } from "@/lib/local-date";
import { usePref } from "@/components/PrefsProvider";
import { YouTubePlayer } from "./YouTubePlayer";

interface LibResp { label?: string; videos?: Array<{ id: string; title: string }>; error?: string }
const fetcher = (u: string) => fetch(u).then((r) => r.json());

// One BBC Earth Short, drawn at random from the channel's whole Shorts
// library. The pick is SAVED for the day — a refresh/SWR revalidation keeps
// the same Short until midnight, and the "new" button rolls a fresh one.
export function NatureShort() {
  const dateKey = localDateKey();
  const { data, isLoading } = useSWR<LibResp>("/api/yt-library?source=bbc", fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const videos = useMemo(() => data?.videos ?? [], [data]);

  // Persisted daily pick (synced). {date, id} — re-rolled at midnight or on "new".
  const [pick, setPick] = usePref<{ date: string; id: string } | null>("hub.natureShort.daily", null);

  // Choose the first time we have a library and no valid pick for today.
  useEffect(() => {
    if (!videos.length) return;
    if (pick && pick.date === dateKey && videos.some((v) => v.id === pick.id)) return;
    const v = videos[Math.floor(Math.random() * videos.length)];
    setPick({ date: dateKey, id: v.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, dateKey]);

  function roll() {
    if (videos.length < 2) return;
    let v = videos[Math.floor(Math.random() * videos.length)];
    if (pick) { let guard = 0; while (v.id === pick.id && guard++ < 8) v = videos[Math.floor(Math.random() * videos.length)]; }
    setPick({ date: dateKey, id: v.id });
  }

  const curId = pick && pick.date === dateKey ? pick.id : videos[0]?.id;
  const cur = videos.find((v) => v.id === curId);

  if (isLoading && !videos.length) return <p className="text-muted text-sm">Loading nature…</p>;
  if (!cur) {
    return (
      <div className="text-sm text-muted italic flex items-center justify-center h-full">
        Couldn&rsquo;t reach BBC Earth right now.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0">
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span className="inline-flex items-center gap-1.5 text-accent">
          <Leaf className="h-3 w-3" /> BBC Earth
        </span>
        <button onClick={roll} className="inline-flex items-center gap-1 hover:text-accent transition" title="New short">
          <RotateCcw className="h-3 w-3" /> new
        </button>
      </div>

      <div className="relative flex-1 min-h-0 grid place-items-center">
        <YouTubePlayer
          key={cur.id}
          videoId={cur.id}
          title={cur.title}
          aspect="short"
          loop
          className="h-full max-h-full rounded-[20px] border border-[var(--rule)] shadow-[var(--shadow-hover)]"
        />
      </div>
    </div>
  );
}
