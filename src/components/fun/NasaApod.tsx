"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useState, useRef, useEffect } from "react";
import {
  ExternalLink, Rocket, Info, Palette as PaletteIcon,
  Landmark, Bird as BirdIcon, BookOpen, Archive as ArchiveIcon,
  RotateCcw, Play, Pause,
} from "lucide-react";
import { usePref } from "@/components/PrefsProvider";
import { localDateKey } from "@/lib/local-date";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// ---------- shared bits -----------------------------------------------------

function InfoButton({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      onClick={() => set(!on)}
      className="btn-ghost !h-8 !w-8 shrink-0"
      title={on ? "Hide caption" : "Show caption"}
      aria-label={on ? "Hide caption" : "Show caption"}
    >
      <Info className="h-4 w-4" />
    </button>
  );
}

function Loading() { return <div className="grid place-items-center h-full text-muted text-sm">Loading…</div>; }
function Failed({ what }: { what: string }) {
  return <div className="grid place-items-center h-full text-down text-sm px-4 text-center">Couldn&rsquo;t reach {what}.</div>;
}

// ---------- NASA APOD -------------------------------------------------------

interface Apod { date?: string; title?: string; explanation?: string; url?: string; hdurl?: string; media_type?: string; copyright?: string; error?: string }

function NasaPanel({ showInfo, setShowInfo }: { showInfo: boolean; setShowInfo: (v: boolean) => void }) {
  const { data, isLoading } = useSWR<Apod>("/api/nasa-apod", fetcher, { refreshInterval: 1000 * 60 * 60 * 6, keepPreviousData: true });
  if (isLoading && !data) return <Loading />;
  if (data?.error || !data?.url) return <Failed what="NASA" />;
  const isVideo = data.media_type === "video";
  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="relative flex-[3] min-h-0 rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)]">
        {isVideo ? (
          <iframe src={data.url} title={data.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
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
            <a href={data.hdurl || data.url} target="_blank" rel="noreferrer" title={data.title} className="block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-2">{data.title}</a>
            {data.copyright && <div className="text-[10.5px] text-muted-2 truncate mt-0.5">© {data.copyright.trim()}</div>}
          </div>
          <InfoButton on={showInfo} set={setShowInfo} />
        </div>
        {showInfo && data.explanation && <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-soft min-h-0 flex-1 overflow-y-auto pr-1">{data.explanation}</p>}
      </div>
    </div>
  );
}

// ---------- Art of the day (AIC) -------------------------------------------

interface Art { title?: string; artist?: string; date?: string; medium?: string; origin?: string; description?: string | null; alt?: string; imageUrl?: string; pageUrl?: string; source?: string; error?: string }

function ArtPanel({ showInfo, setShowInfo }: { showInfo: boolean; setShowInfo: (v: boolean) => void }) {
  // Daily — keyed on the local date only. No reroll button: today's painting
  // IS today's painting, like a real museum label.
  const today = localDateKey();
  const { data, isLoading } = useSWR<Art>(`/api/art-of-day?d=${today}`, fetcher, { keepPreviousData: true, revalidateOnFocus: false });
  if (isLoading && !data) return <Loading />;
  if (data?.error || !data?.imageUrl) return <Failed what="the museum" />;
  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="relative flex-[3] min-h-0 rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)]">
        <a href={data.pageUrl} target="_blank" rel="noreferrer" className="absolute inset-0">
          <img src={data.imageUrl} alt={data.alt ?? ""} className="h-full w-full object-contain bg-black/20 transition hover:scale-[1.01]" loading="lazy" />
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-white"><PaletteIcon className="h-3 w-3" /> {data.source}</span>
        </a>
      </div>
      <div className="flex flex-col min-h-0 flex-[2]">
        <div className="flex items-start gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <a href={data.pageUrl} target="_blank" rel="noreferrer" title={data.title} className="block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-2">{data.title}</a>
            <div className="text-[10.5px] text-muted-2 truncate mt-0.5">{[data.artist, data.date].filter(Boolean).join(" · ")}</div>
          </div>
          <InfoButton on={showInfo} set={setShowInfo} />
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

// ---------- Cabinet of curiosities (Met) -----------------------------------

interface Cabinet { title?: string; artist?: string; date?: string; medium?: string; dimensions?: string; story?: string; imageUrl?: string; pageUrl?: string; source?: string; error?: string }

function CabinetPanel({ showInfo, setShowInfo, refreshN, onRefresh }: { showInfo: boolean; setShowInfo: (v: boolean) => void; refreshN: number; onRefresh: () => void }) {
  const { data, isLoading } = useSWR<Cabinet>(`/api/cabinet?r=${refreshN}`, fetcher, { keepPreviousData: true });
  if (isLoading && !data) return <Loading />;
  if (data?.error || !data?.imageUrl) return <Failed what="The Met" />;
  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="relative flex-[3] min-h-0 rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)]">
        <a href={data.pageUrl} target="_blank" rel="noreferrer" className="absolute inset-0">
          <img src={data.imageUrl} alt={data.title ?? ""} className="h-full w-full object-contain bg-black/20 transition hover:scale-[1.01]" loading="lazy" />
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-white"><Landmark className="h-3 w-3" /> {data.source}</span>
        </a>
        <RollButton onRefresh={onRefresh} />
      </div>
      <div className="flex flex-col min-h-0 flex-[2]">
        <div className="flex items-start gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <a href={data.pageUrl} target="_blank" rel="noreferrer" title={data.title} className="block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-2">{data.title}</a>
            <div className="text-[10.5px] text-muted-2 truncate mt-0.5">{[data.artist, data.date].filter(Boolean).join(" · ")}</div>
          </div>
          <InfoButton on={showInfo} set={setShowInfo} />
        </div>
        {showInfo && (
          <div className="mt-2.5 text-[12.5px] leading-relaxed text-ink-soft min-h-0 flex-1 overflow-y-auto pr-1">
            {data.medium && <div className="text-[11px] text-muted mb-1">{data.medium}{data.dimensions ? ` · ${data.dimensions}` : ""}</div>}
            {data.story ? <p>{data.story}</p> : <p className="italic text-muted-2">A curiosity with no caption.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Bird of the day (xeno-canto + Wikipedia) -----------------------

interface Bird { name?: string; scientific?: string; blurb?: string; imageUrl?: string; audioUrl?: string; sonogram?: string; recordist?: string; place?: string; pageUrl?: string; xcUrl?: string; source?: string; error?: string }

function BirdPanel({ showInfo, setShowInfo }: { showInfo: boolean; setShowInfo: (v: boolean) => void }) {
  // Daily — keyed on the local date only, no reroll. Today's bird is
  // today's bird.
  const today = localDateKey();
  const { data, isLoading } = useSWR<Bird>(`/api/bird-of-day?d=${today}`, fetcher, { keepPreviousData: true, revalidateOnFocus: false });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [audioState, setAudioState] = useState<"idle" | "loading" | "error">("idle");
  useEffect(() => {
    setPlaying(false); setAudioState("idle");
    if (audioRef.current) audioRef.current.pause();
  }, [data?.audioUrl]);

  if (isLoading && !data) return <Loading />;
  // Render whenever we have ANYTHING (photo OR song) — never bail just
  // because the audio archive didn't return a recording.
  if (data?.error || (!data?.imageUrl && !data?.audioUrl && !data?.blurb)) return <Failed what="the aviary" />;

  const hasAudio = !!data?.audioUrl;
  async function toggle() {
    if (!hasAudio) return;
    const a = audioRef.current; if (!a) return;
    if (!a.paused) { a.pause(); setPlaying(false); return; }
    try {
      setAudioState("loading");
      await a.play();
      setPlaying(true);
      setAudioState("idle");
    } catch {
      setPlaying(false);
      setAudioState("error");
    }
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="relative flex-[3] min-h-0 rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)]">
        {data!.imageUrl ? (
          <a href={data!.pageUrl} target="_blank" rel="noreferrer" className="absolute inset-0">
            {/* No object-cover scaling — `object-contain` keeps the original
                pixels so a high-res bird never gets upsampled to fuzz. */}
            <img
              src={data!.imageUrl}
              alt={data!.name ?? ""}
              className="h-full w-full object-contain transition hover:scale-[1.01]"
              loading="lazy"
              decoding="async"
            />
          </a>
        ) : (
          <div className="absolute inset-0 grid place-items-center"><BirdIcon className="h-12 w-12 text-muted-2" /></div>
        )}
        <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-white"><BirdIcon className="h-3 w-3" /> Bird of the day</span>
      </div>
      {/* Audio control — a small button UNDER the photo, not over it. */}
      <div className="flex items-center gap-2 shrink-0">
        {hasAudio ? (
          <>
            <button
              onClick={toggle}
              aria-label={playing ? "Pause song" : "Play song"}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft border border-[var(--rule)] px-3 py-1 text-[11.5px] font-semibold text-accent hover:brightness-110 transition"
            >
              {audioState === "loading"
                ? <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
                : playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5 translate-x-[1px]" fill="currentColor" />}
              {audioState === "loading" ? "Loading…" : playing ? "Pause song" : "Play song"}
            </button>
            {audioState === "error" && (
              <a href={data!.xcUrl} target="_blank" rel="noreferrer" className="text-[10.5px] text-down hover:underline">
                playback failed — open on source ↗
              </a>
            )}
          </>
        ) : (
          <a
            href={data!.xcUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rule-soft)] border border-[var(--rule)] px-3 py-1 text-[11.5px] font-medium text-muted hover:text-accent transition"
            title="No recording archived for this species — search Commons"
          >
            <Play className="h-3.5 w-3.5" fill="currentColor" /> No song archived
          </a>
        )}
        {/* Served from our same-origin /api/bird-audio proxy, so no CORS /
            mixed-content quirks. preload=auto so the first play is instant. */}
        {hasAudio && (
          <audio
            ref={audioRef}
            src={data!.audioUrl}
            preload="auto"
            onEnded={() => { setPlaying(false); setAudioState("idle"); }}
            onError={() => { setPlaying(false); setAudioState("error"); }}
          />
        )}
      </div>
      <div className="flex flex-col min-h-0 flex-[2]">
        <div className="flex items-start gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <a href={data!.pageUrl} target="_blank" rel="noreferrer" title={data!.name} className="block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-1">{data!.name}</a>
            {data!.scientific && <div className="text-[10.5px] text-muted-2 italic truncate mt-0.5">{data!.scientific}</div>}
          </div>
          <InfoButton on={showInfo} set={setShowInfo} />
        </div>
        {showInfo && (
          <div className="mt-2.5 text-[12.5px] leading-relaxed text-ink-soft min-h-0 flex-1 overflow-y-auto pr-1">
            {data!.blurb ? <p>{data!.blurb}</p> : <p className="italic text-muted-2">No notes on this species.</p>}
            <div className="text-[10.5px] text-muted-2 mt-2">
              {data!.place ? data!.place : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Wikipedia rabbithole -------------------------------------------

interface Wiki { title?: string; description?: string; extract?: string; imageUrl?: string; pageUrl?: string; source?: string; error?: string }

function WikiPanel({ showInfo, setShowInfo, refreshN, onRefresh }: { showInfo: boolean; setShowInfo: (v: boolean) => void; refreshN: number; onRefresh: () => void }) {
  const today = localDateKey();
  const { data, isLoading } = useSWR<Wiki>(`/api/wiki-random?d=${today}&r=${refreshN}`, fetcher, { keepPreviousData: true, revalidateOnFocus: false });
  if (isLoading && !data) return <Loading />;
  if (data?.error) return <Failed what="Wikipedia" />;
  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="relative flex-[3] min-h-0 rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)]">
        {data?.imageUrl ? (
          <a href={data.pageUrl} target="_blank" rel="noreferrer" className="absolute inset-0">
            <img src={data.imageUrl} alt={data.title ?? ""} className="h-full w-full object-cover transition hover:scale-[1.01]" loading="lazy" />
          </a>
        ) : (
          <a href={data?.pageUrl} target="_blank" rel="noreferrer" className="absolute inset-0 grid place-items-center p-6 text-center">
            <span className="font-display text-2xl text-ink-soft leading-tight">{data?.title}</span>
          </a>
        )}
        <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-white"><BookOpen className="h-3 w-3" /> Rabbit hole</span>
        <RollButton onRefresh={onRefresh} label="Another" />
      </div>
      <div className="flex flex-col min-h-0 flex-[2]">
        <div className="flex items-start gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <a href={data?.pageUrl} target="_blank" rel="noreferrer" title={data?.title} className="block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-1">{data?.title}</a>
            {data?.description && <div className="text-[10.5px] text-muted-2 truncate mt-0.5">{data.description}</div>}
          </div>
          <InfoButton on={showInfo} set={setShowInfo} />
        </div>
        {showInfo && data?.extract && <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-soft min-h-0 flex-1 overflow-y-auto pr-1">{data.extract}</p>}
      </div>
    </div>
  );
}

// ---------- Internet Archive -----------------------------------------------

interface Archive { title?: string; mediatype?: string; year?: string; description?: string; imageUrl?: string; pageUrl?: string; source?: string; error?: string }

function ArchivePanel({ showInfo, setShowInfo, refreshN, onRefresh }: { showInfo: boolean; setShowInfo: (v: boolean) => void; refreshN: number; onRefresh: () => void }) {
  // Key on the date — that's what makes the pick DAILY. SWR caches per key, so
  // opening this tab a second time on the same day returns the same archive
  // item instead of rolling a new one.
  const today = localDateKey();
  const { data, isLoading } = useSWR<Archive>(`/api/archive-random?d=${today}&r=${refreshN}`, fetcher, { keepPreviousData: true, revalidateOnFocus: false });
  if (isLoading && !data) return <Loading />;
  if (data?.error) return <Failed what="the Archive" />;
  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="relative flex-[3] min-h-0 rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)]">
        <a href={data?.pageUrl} target="_blank" rel="noreferrer" className="absolute inset-0">
          <img src={data?.imageUrl} alt={data?.title ?? ""} className="h-full w-full object-contain bg-black/30 transition hover:scale-[1.01]" loading="lazy" />
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-white"><ArchiveIcon className="h-3 w-3" /> {data?.mediatype || "Archive"}</span>
        </a>
        <RollButton onRefresh={onRefresh} label="Another" />
      </div>
      <div className="flex flex-col min-h-0 flex-[2]">
        <div className="flex items-start gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <a href={data?.pageUrl} target="_blank" rel="noreferrer" title={data?.title} className="block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-2">{data?.title}</a>
            <div className="text-[10.5px] text-muted-2 truncate mt-0.5">{[data?.source, data?.year].filter(Boolean).join(" · ")}</div>
          </div>
          <InfoButton on={showInfo} set={setShowInfo} />
        </div>
        {showInfo && data?.description && <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-soft min-h-0 flex-1 overflow-y-auto pr-1">{data.description}</p>}
      </div>
    </div>
  );
}

// A small "roll again" button pinned to the image corner.
function RollButton({ onRefresh, label }: { onRefresh: () => void; label?: string }) {
  return (
    <button
      onClick={onRefresh}
      className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-1 text-[10px] font-semibold text-white hover:bg-black/75 transition"
      title={label ?? "Show another"}
      aria-label={label ?? "Show another"}
    >
      <RotateCcw className="h-3 w-3" /> {label ?? "New"}
    </button>
  );
}

// ---------- the box ---------------------------------------------------------

type Tab = "art" | "bird" | "nasa" | "wiki" | "archive";

const TABS: Array<{ id: Tab; label: string; icon: typeof Rocket }> = [
  { id: "art",     label: "Art",      icon: PaletteIcon },
  { id: "bird",    label: "Bird",     icon: BirdIcon },
  { id: "nasa",    label: "NASA",     icon: Rocket },
  { id: "wiki",    label: "Wiki",     icon: BookOpen },
  { id: "archive", label: "Archive",  icon: ArchiveIcon },
];

type RollState = Record<Tab, { date: string; n: number }>;
const ZERO: RollState = {
  art: { date: "", n: 0 }, bird: { date: "", n: 0 },
  nasa: { date: "", n: 0 }, wiki: { date: "", n: 0 }, archive: { date: "", n: 0 },
};

export function NasaApod() {
  const [tab, setTab] = useState<Tab>("art");
  const [showInfo, setShowInfo] = useState(true);
  const today = localDateKey();
  // Per-tab reroll counter, PERSISTED (synced) so a "New" pick survives a page
  // refresh until midnight; it resets to the daily pick on a new day.
  const [rolls, setRolls] = usePref<RollState>("hub.frame.rolls", ZERO);
  const rollsRef = useRef(rolls);
  rollsRef.current = rolls;

  const refreshFor = (t: Tab): number => {
    const e = rolls[t];
    return e && e.date === today ? e.n : 0;
  };
  const roll = (t: Tab) => {
    const cur = rollsRef.current;
    const e = cur[t];
    const n = (e && e.date === today ? e.n : 0) + 1;
    setRolls({ ...cur, [t]: { date: today, n } });
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`chip normal-case !px-2.5 !py-0.5 !text-[11px] inline-flex items-center gap-1 ${on ? "chip-active" : ""}`}>
              <Icon className="h-3 w-3" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {tab === "art"     && <ArtPanel     showInfo={showInfo} setShowInfo={setShowInfo} />}
        {tab === "bird"    && <BirdPanel    showInfo={showInfo} setShowInfo={setShowInfo} />}
        {tab === "nasa"    && <NasaPanel    showInfo={showInfo} setShowInfo={setShowInfo} />}
        {tab === "wiki"    && <WikiPanel    showInfo={showInfo} setShowInfo={setShowInfo} refreshN={refreshFor("wiki")}    onRefresh={() => roll("wiki")} />}
        {tab === "archive" && <ArchivePanel showInfo={showInfo} setShowInfo={setShowInfo} refreshN={refreshFor("archive")} onRefresh={() => roll("archive")} />}
      </div>
    </div>
  );
}
