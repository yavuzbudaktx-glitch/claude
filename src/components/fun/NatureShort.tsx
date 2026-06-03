"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useEffect, useState } from "react";
import { PlayCircle, RotateCcw, Leaf } from "lucide-react";
import { localDateKey } from "@/lib/local-date";

interface ShortResp {
  videoId?: string;
  title?: string;
  channel?: string;
  published?: string;
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
  // New pick → reset playback.
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
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span className="inline-flex items-center gap-1.5"><Leaf className="h-3 w-3" /> {data.channel}</span>
        <button onClick={() => { setN((x) => x + 1); mutate(); }} className="inline-flex items-center gap-1 hover:text-accent transition" title="New short">
          <RotateCcw className="h-3 w-3" /> new
        </button>
      </div>

      <div
        className="relative mx-auto rounded-2xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)] shrink-0"
        style={{ aspectRatio: "9 / 16", width: "100%", maxWidth: "220px" }}
      >
        {!playing && data.thumb && (
          <button onClick={() => setPlaying(true)} aria-label="Play" className="absolute inset-0 group">
            <img src={data.thumb} alt={data.title} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/95 text-black shadow-lg">
                <PlayCircle className="h-7 w-7" strokeWidth={1.5} />
              </span>
            </span>
          </button>
        )}
        {playing && (
          <iframe
            key={data.videoId}
            src={`https://www.youtube.com/embed/${data.videoId}?autoplay=1&rel=0&modestbranding=1`}
            title={data.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        )}
      </div>

      <div className="min-w-0 text-center">
        <a
          href={`https://www.youtube.com/watch?v=${data.videoId}`}
          target="_blank" rel="noreferrer"
          className="block text-[12.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-2"
          title={data.title}
        >
          {data.title}
        </a>
      </div>
    </div>
  );
}
