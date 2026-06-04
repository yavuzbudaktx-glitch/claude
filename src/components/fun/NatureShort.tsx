"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useEffect, useState } from "react";
import { Play, RotateCcw, Leaf } from "lucide-react";
import { localDateKey } from "@/lib/local-date";

interface ShortResp {
  videoId?: string;
  title?: string;
  channel?: string;
  thumb?: string;
  isPortrait?: boolean;
  error?: string;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function NatureShort() {
  const dateKey = localDateKey();
  const [n, setN] = useState(0);
  const { data, isLoading, mutate } = useSWR<ShortResp>(
    `/api/nature-short?d=${dateKey}&r=${n}`,
    fetcher,
    { refreshInterval: 1000 * 60 * 60 * 6, keepPreviousData: true },
  );
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setPlaying(false); }, [data?.videoId]);

  if (isLoading && !data) return <p className="text-muted text-sm">Loading nature…</p>;
  if (data?.error || !data?.videoId) {
    return (
      <div className="text-sm text-muted italic flex items-center justify-center h-full">
        Couldn&rsquo;t reach the nature feeds.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0">
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span className="inline-flex items-center gap-1.5 text-accent">
          <Leaf className="h-3 w-3" /> {data.channel}
        </span>
        <button
          onClick={() => { setN((x) => x + 1); mutate(); }}
          className="inline-flex items-center gap-1 hover:text-accent transition"
          title="New short"
        >
          <RotateCcw className="h-3 w-3" /> new
        </button>
      </div>

      {/* Big vertical Short — fills the available height, centered. */}
      <div className="relative flex-1 min-h-0 grid place-items-center">
        <div
          className="relative h-full max-h-full rounded-[22px] overflow-hidden shadow-[var(--shadow-hover)]"
          style={{
            aspectRatio: "9 / 16",
            background: "var(--rule-soft)",
            padding: "2px",
            backgroundImage: "linear-gradient(160deg, color-mix(in srgb, var(--accent) 55%, transparent), color-mix(in srgb, var(--accent-2) 45%, transparent))",
          }}
        >
          <div className="relative h-full w-full rounded-[20px] overflow-hidden bg-black">
            {!playing && data.thumb && (
              <button onClick={() => setPlaying(true)} aria-label="Play" className="absolute inset-0 group">
                <img
                  src={data.thumb}
                  alt={data.title}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/25" />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-white/15 backdrop-blur-md border border-white/30 text-white shadow-2xl transition group-hover:scale-110 group-hover:bg-white/25">
                    <Play className="h-7 w-7 translate-x-[2px]" fill="currentColor" strokeWidth={0} />
                  </span>
                </span>
                {data.title && (
                  <span className="absolute inset-x-0 bottom-0 p-3 text-left">
                    <span className="block text-[12.5px] font-semibold text-white leading-snug line-clamp-2 drop-shadow">
                      {data.title}
                    </span>
                  </span>
                )}
              </button>
            )}
            {playing && (
              <iframe
                key={data.videoId}
                src={`https://www.youtube.com/embed/${data.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                title={data.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
