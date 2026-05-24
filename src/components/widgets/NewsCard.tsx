"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useState } from "react";
import { RefreshCw, Star } from "lucide-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { Card } from "@/components/Card";
import { usePref } from "@/components/PrefsProvider";
import { useCommand } from "@/lib/commands";
import { CATEGORY_LABELS, CATEGORY_ORDER, type NewsCategory, type NewsItem } from "@/lib/feeds";

type Resp = Record<NewsCategory, NewsItem[]>;

// How many headlines to show at once. Each refresh advances by this much
// through a deep, freshly-fetched pool so the column shows different
// stories every time.
const WINDOW = 5;
const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Resp>);

// Stable colour per source, derived from name. Used as the *final*
// fallback when neither the article thumbnail nor the publisher's
// logo is available.
const PLACEHOLDER_PALETTE = [
  "#8a1f17", "#1a5e8a", "#5a8a1a", "#8a5a1a",
  "#5a1a8a", "#1a8a5a", "#8a1a5a", "#1a1a8a",
];
function placeholderColor(source: string) {
  let h = 0;
  for (const c of source) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PLACEHOLDER_PALETTE[h % PLACEHOLDER_PALETTE.length];
}
function sourceInitials(source: string) {
  const trimmed = source.replace(/[^A-Za-zÀ-ž0-9 ]/g, "").trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1][0] ?? "")).toUpperCase();
}

// Derive the publisher's logo from the article's URL. We try Clearbit's
// public Logo API first (clean square logos for nearly every news
// publisher) and fall back to Google's S2 favicon service, which exists
// for literally every domain.
function publisherDomain(link: string): string | null {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
function publisherLogoUrls(link: string): string[] {
  const domain = publisherDomain(link);
  if (!domain) return [];
  return [
    // Higher-res first so logos stay crisp on retina (the 64px tile is
    // 128–192 physical px). DuckDuckGo's icon service is a sharp fallback
    // when Clearbit lacks a brand; Google favicons are the last resort.
    `https://logo.clearbit.com/${domain}?size=256`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?sz=128&domain=${domain}`,
  ];
}

// Per-source high-quality logo overrides — used as the logo fallback when
// an article has no thumbnail (and for sources like Hacker News whose links
// point at external domains, so the publisher favicon would be wrong).
const SOURCE_LOGOS: Record<string, string> = {
  "Al Jazeera":
    "https://www.emergencyusa.org/wp-content/uploads/2017/03/Aljazeera-logo-English-1024x768.png",
  "Hacker News": "https://cdn-icons-png.flaticon.com/512/9543/9543111.png",
  "Anadolu Ajansı":
    "https://play-lh.googleusercontent.com/ME_9wBMHWB_QmJwy-QXRmEsOd_i0VFw4K-3wdHAmydgnmJnDmrqWVFfEOGnHzubdzg",
  TechCrunch:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/TechCrunch_logo.svg/250px-TechCrunch_logo.svg.png",
  "FT Markets":
    "https://pbs.twimg.com/profile_images/931162839905161216/FsnHwgvX_400x400.jpg",
};

function NewsThumb({ item }: { item: NewsItem }) {
  // Three-tier image strategy. We don't conditionally render based on
  // `item.image` alone — we let the browser try the article image, then
  // walk down a fallback chain via onError so a 404'd thumbnail still
  // resolves to a publisher logo before settling on initials.
  const sourceLogo = SOURCE_LOGOS[item.source];
  const candidates = [
    ...(sourceLogo ? [sourceLogo] : []),
    ...(item.image ? [item.image] : []),
    ...publisherLogoUrls(item.link),
  ];
  const [idx, setIdx] = useState(0);
  if (idx >= candidates.length) {
    return (
      <div
        className="h-full w-full flex items-center justify-center font-serif text-base text-white tracking-wide select-none"
        style={{ background: `linear-gradient(135deg, ${placeholderColor(item.source)}, ${placeholderColor(item.source)}dd)` }}
      >
        {sourceInitials(item.source)}
      </div>
    );
  }
  // Brand logos are letter-boxed on a clean background so wide/landscape
  // marks (e.g. Al Jazeera) aren't cropped; article photos still cover.
  const isLogo = !!sourceLogo && candidates[idx] === sourceLogo;
  return (
    <img
      src={candidates[idx]}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`h-full w-full transition-transform duration-300 group-hover:scale-105 ${
        isLogo ? "object-contain bg-white p-1.5" : "object-cover"
      }`}
      onError={() => setIdx((n) => n + 1)}
    />
  );
}

function PubDate({ iso }: { iso: string }) {
  let date: Date | null = null;
  try { date = new Date(iso); } catch {}
  if (!date || Number.isNaN(date.getTime())) return null;
  const ageHours = (Date.now() - date.getTime()) / 3_600_000;
  const text = ageHours < 24
    ? formatDistanceToNowStrict(date, { addSuffix: true })
    : format(date, "MMM d");
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
      · {text}
    </span>
  );
}

export function NewsCard() {
  const { data, error, isLoading } = useSWR<Resp>("/api/news", fetcher, {
    refreshInterval: 1000 * 60 * 15,
    keepPreviousData: true,
  });
  const [active, setActive] = useState<NewsCategory | "saved">("world");
  const [refreshing, setRefreshing] = useState(false);
  // Per-category deep pools fetched on refresh, plus a rolling window
  // offset so each refresh reveals a different slice of headlines.
  const [pools, setPools] = useState<Partial<Record<NewsCategory, NewsItem[]>>>({});
  const [offsets, setOffsets] = useState<Partial<Record<NewsCategory, number>>>({});

  // Saved / read-later articles, synced across devices.
  const [saved, setSaved] = usePref<NewsItem[]>("savedNews", []);
  const isSaved = (link: string) => saved.some((s) => s.link === link);
  function toggleSave(item: NewsItem) {
    setSaved(isSaved(item.link) ? saved.filter((s) => s.link !== item.link) : [item, ...saved].slice(0, 50));
  }

  // Let the command palette switch the active news tab.
  useCommand((c) => { if (c.kind === "news-tab") setActive(c.value as NewsCategory); });

  const cat = active === "saved" ? null : active;
  const pool = cat ? pools[cat] : undefined;
  const offset = cat ? offsets[cat] ?? 0 : 0;
  const visibleItems: NewsItem[] =
    active === "saved"
      ? saved
      : pool && pool.length > 0
        ? Array.from({ length: Math.min(WINDOW, pool.length) }, (_, k) => pool[(offset + k) % pool.length])
        : (data?.[active] ?? []).slice(0, WINDOW);

  // Refresh ONLY the tab currently in view. Pulls a deep, freshly-fetched
  // pool from the force-dynamic single-category endpoint (cache-busting
  // param bypasses the ISR + PWA service-worker caches) and advances the
  // window so genuinely different stories appear on every click.
  async function refreshActive() {
    if (refreshing || active === "saved") return;
    const cat = active;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/news/category?c=${cat}&t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`news refresh failed: ${res.status}`);
      const json = (await res.json()) as { items?: NewsItem[] };
      const items = json.items ?? [];
      if (items.length === 0) return;
      setPools((p) => ({ ...p, [cat]: items }));
      setOffsets((o) => {
        const cur = o[cat] ?? 0;
        return { ...o, [cat]: (cur + WINDOW) % items.length };
      });
    } catch {
      // leave the current headlines in place on failure
    } finally {
      setRefreshing(false);
    }
  }

  const refreshAction =
    active === "saved" ? null : (
      <button
        onClick={refreshActive}
        disabled={refreshing}
        title={`Refresh ${CATEGORY_LABELS[active]}`}
        aria-label={`Refresh ${CATEGORY_LABELS[active]}`}
        className="text-muted hover:text-accent transition disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    );

  return (
    <Card num="03" title="The Wire" action={refreshAction}>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {CATEGORY_ORDER.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className={`chip ${active === c ? "chip-active" : ""}`}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
        <button
          onClick={() => setActive("saved")}
          className={`chip inline-flex items-center gap-1 ${active === "saved" ? "chip-active" : ""}`}
        >
          <Star className="h-3 w-3" fill={active === "saved" ? "currentColor" : "none"} />
          Saved{saved.length ? ` ${saved.length}` : ""}
        </button>
      </div>

      {isLoading && !data && <p className="text-muted text-sm">Loading…</p>}
      {error && !data && <p className="text-accent text-sm">Couldn&rsquo;t load news.</p>}

      {(data || pool || active === "saved") &&
        (refreshing ? (
          <div className="py-10 flex items-center justify-center gap-2 text-muted text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" /> Fetching fresh headlines…
          </div>
        ) : (
          <ul className="space-y-3 pr-1">
            {visibleItems.map((item) => (
              <li key={item.link} className="group relative">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-3 items-start pr-6"
                >
                  <div className="shrink-0 w-16 h-16 rounded-md overflow-hidden border rule-soft">
                    <NewsThumb item={item} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-snug font-medium group-hover:underline underline-offset-2 line-clamp-3">
                      {item.title}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted mt-1 flex items-center gap-1.5 flex-wrap">
                      <span>{item.source}</span>
                      <PubDate iso={item.pubDate} />
                    </div>
                  </div>
                </a>
                <button
                  onClick={() => toggleSave(item)}
                  title={isSaved(item.link) ? "Remove from saved" : "Save for later"}
                  aria-label={isSaved(item.link) ? "Remove from saved" : "Save for later"}
                  className={`absolute top-0 right-0 p-0.5 transition ${
                    isSaved(item.link)
                      ? "text-accent opacity-100"
                      : "text-muted opacity-0 group-hover:opacity-100 hover:text-accent"
                  }`}
                >
                  <Star className="h-4 w-4" fill={isSaved(item.link) ? "currentColor" : "none"} />
                </button>
              </li>
            ))}
            {visibleItems.length === 0 && (
              <li className="text-muted text-sm italic">
                {active === "saved" ? "No saved articles yet — tap the star on any headline." : "No headlines."}
              </li>
            )}
          </ul>
        ))}
    </Card>
  );
}
