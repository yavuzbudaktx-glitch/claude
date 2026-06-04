"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useState } from "react";
import { ExternalLink, Rocket, Info, Palette as PaletteIcon } from "lucide-react";

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

interface Art {
  title?: string;
  artist?: string;
  date?: string;
  medium?: string;
  origin?: string;
  description?: string | null;
  alt?: string;
  imageUrl?: string;
  pageUrl?: string;
  source?: string;
  error?: string;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function NasaPanel({ showInfo, setShowInfo }: { showInfo: boolean; setShowInfo: (v: boolean) => void }) {
  const { data, isLoading } = useSWR<Apod>("/api/nasa-apod", fetcher, {
    refreshInterval: 1000 * 60 * 60 * 6,
    keepPreviousData: true,
  });

  if (isLoading && !data) return <p className="text-muted text-sm">Loading…</p>;
  if (data?.error) return <p className="text-down text-sm">Couldn&rsquo;t reach NASA.</p>;
  if (!data?.url) return null;

  const isVideo = data.media_type === "video";

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Image takes the upper ~3/5; the caption gets the rest and scrolls
          inside it, so the whole panel always fits the card (no overflow off
          the bottom — the "doesn't fit on my Mac" bug). */}
      <div className="relative flex-[3] min-h-0 rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)]">
        {isVideo ? (
          <iframe
            src={data.url}
            title={data.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <a href={data.hdurl || data.url} target="_blank" rel="noreferrer" className="absolute inset-0">
            <img src={data.url} alt={data.title} className="h-full w-full object-cover transition hover:scale-[1.01]" loading="lazy" />
            <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-white">
              <Rocket className="h-3 w-3" /> NASA · {data.date}
            </span>
          </a>
        )}
      </div>

      <div className="flex flex-col min-h-0 flex-[2]">
        <div className="flex items-start gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <a
              href={data.hdurl || data.url}
              target="_blank"
              rel="noreferrer"
              title={data.title}
              className="block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-2"
            >
              {data.title}
            </a>
            {data.copyright && (
              <div className="text-[10.5px] text-muted-2 truncate mt-0.5">© {data.copyright.trim()}</div>
            )}
          </div>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="btn-ghost !h-8 !w-8 shrink-0"
            title={showInfo ? "Hide caption" : "Show caption"}
            aria-label={showInfo ? "Hide caption" : "Show caption"}
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {showInfo && data.explanation && (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-soft min-h-0 flex-1 overflow-y-auto pr-1">
            {data.explanation}
          </p>
        )}
      </div>
    </div>
  );
}

function ArtPanel({ showInfo, setShowInfo }: { showInfo: boolean; setShowInfo: (v: boolean) => void }) {
  const { data, isLoading } = useSWR<Art>("/api/art-of-day", fetcher, {
    refreshInterval: 1000 * 60 * 60 * 6,
    keepPreviousData: true,
  });

  if (isLoading && !data) return <p className="text-muted text-sm">Loading…</p>;
  if (data?.error) return <p className="text-down text-sm">Couldn&rsquo;t reach the museum.</p>;
  if (!data?.imageUrl) return null;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="relative flex-[3] min-h-0 rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)]">
        <a href={data.pageUrl} target="_blank" rel="noreferrer" className="absolute inset-0">
          <img src={data.imageUrl} alt={data.alt ?? ""} className="h-full w-full object-contain bg-black/20 transition hover:scale-[1.01]" loading="lazy" />
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-white">
            <PaletteIcon className="h-3 w-3" /> {data.source}
          </span>
        </a>
      </div>

      <div className="flex flex-col min-h-0 flex-[2]">
        <div className="flex items-start gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <a
              href={data.pageUrl}
              target="_blank"
              rel="noreferrer"
              title={data.title}
              className="block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-2"
            >
              {data.title}
            </a>
            <div className="text-[10.5px] text-muted-2 truncate mt-0.5">
              {[data.artist, data.date].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="btn-ghost !h-8 !w-8 shrink-0"
            title={showInfo ? "Hide caption" : "Show caption"}
            aria-label={showInfo ? "Hide caption" : "Show caption"}
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {showInfo && (
          <div className="mt-2.5 text-[12.5px] leading-relaxed text-ink-soft min-h-0 flex-1 overflow-y-auto pr-1">
            {data.medium && <div className="text-[11px] text-muted mb-1">{data.medium}{data.origin ? ` · ${data.origin}` : ""}</div>}
            {data.description ? <p>{data.description}</p> : <p className="italic text-muted-2">No description on file.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function NasaApod() {
  // Art of the day is the default panel — it lands on something painterly
  // most days, where APOD frequently lands on a noisy astrophotograph the
  // user is unlikely to want as their cover image.
  const [tab, setTab] = useState<"nasa" | "art">("art");
  // Per request: info is OPEN by default; the "i" button toggles it off.
  const [showInfo, setShowInfo] = useState(true);

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center gap-1.5 shrink-0">
        {(
          [
            { id: "art",  label: "Art of the day", icon: PaletteIcon },
            { id: "nasa", label: "NASA · APOD", icon: Rocket },
          ] as Array<{ id: "nasa" | "art"; label: string; icon: typeof Rocket }>
        ).map((t) => {
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

      <div className="flex-1 min-h-0">
        {tab === "nasa" ? <NasaPanel showInfo={showInfo} setShowInfo={setShowInfo} /> : <ArtPanel showInfo={showInfo} setShowInfo={setShowInfo} />}
      </div>
    </div>
  );
}
