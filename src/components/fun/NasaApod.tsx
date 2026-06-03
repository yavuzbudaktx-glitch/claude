"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useState } from "react";
import { ExternalLink, Rocket, Info } from "lucide-react";

interface Apod {
  date?: string;
  title?: string;
  explanation?: string;
  url?: string;
  hdurl?: string;
  media_type?: string;
  copyright?: string;
  error?: string;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function NasaApod() {
  const { data, isLoading } = useSWR<Apod>("/api/nasa-apod", fetcher, {
    refreshInterval: 1000 * 60 * 60 * 6,
    keepPreviousData: true,
  });
  const [showText, setShowText] = useState(false);

  if (isLoading && !data) return <p className="text-muted text-sm">Loading NASA…</p>;
  if (data?.error) return <p className="text-down text-sm">Couldn&rsquo;t reach NASA.</p>;
  if (!data?.url) return null;

  const isVideo = data.media_type === "video";

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)] shrink-0">
        {isVideo ? (
          <iframe
            src={data.url}
            title={data.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <a href={data.hdurl || data.url} target="_blank" rel="noreferrer" className="block h-full w-full">
            <img
              src={data.url}
              alt={data.title}
              className="h-full w-full object-cover transition hover:scale-[1.01]"
              loading="lazy"
            />
            <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-white">
              <Rocket className="h-3 w-3" /> NASA · {data.date}
            </span>
          </a>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <a
              href={data.hdurl || data.url}
              target="_blank"
              rel="noreferrer"
              title={data.title}
              className="block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-2"
            >
              {data.title}
              <ExternalLink className="ml-1 h-3 w-3 inline opacity-0 group-hover:opacity-100" />
            </a>
            {data.copyright && (
              <div className="text-[10.5px] text-muted-2 truncate mt-0.5">© {data.copyright.trim()}</div>
            )}
          </div>
          <button
            onClick={() => setShowText((v) => !v)}
            className="btn-ghost !h-8 !w-8 shrink-0"
            title={showText ? "Hide caption" : "Show caption"}
            aria-label={showText ? "Hide caption" : "Show caption"}
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {showText && data.explanation && (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-soft max-h-[160px] overflow-y-auto pr-1">
            {data.explanation}
          </p>
        )}
      </div>
    </div>
  );
}
