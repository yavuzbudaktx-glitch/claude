"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { Card } from "@/components/Card";
import { CATEGORY_LABELS, CATEGORY_ORDER, type NewsCategory, type NewsItem } from "@/lib/feeds";

const EMPTY_RESP: Record<NewsCategory, NewsItem[]> = {
  world: [], turkey: [], dallas: [], tech: [], finance: [],
};

type Resp = Record<NewsCategory, NewsItem[]>;
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
    `https://logo.clearbit.com/${domain}?size=128`,
    `https://www.google.com/s2/favicons?sz=128&domain=${domain}`,
  ];
}

function NewsThumb({ item }: { item: NewsItem }) {
  // Three-tier image strategy. We don't conditionally render based on
  // `item.image` alone — we let the browser try the article image, then
  // walk down a fallback chain via onError so a 404'd thumbnail still
  // resolves to a publisher logo before settling on initials.
  const candidates = [
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
  return (
    <img
      src={candidates[idx]}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
  const { data, error, isLoading, mutate } = useSWR<Resp>("/api/news", fetcher, {
    refreshInterval: 1000 * 60 * 15,
    keepPreviousData: true,
  });
  const [active, setActive] = useState<NewsCategory>("world");
  const [refreshing, setRefreshing] = useState(false);

  // Refresh ONLY the tab currently in view. We visibly clear the column
  // first (so it's obvious something happened), then pull fresh items from
  // the force-dynamic single-category endpoint with a cache-busting param
  // — bypassing both the 15-min ISR cache and any PWA service-worker
  // cache — and patch just that slice of the SWR cache. The other four
  // categories are left untouched.
  async function refreshActive() {
    if (refreshing) return;
    setRefreshing(true);
    const prevItems = data?.[active] ?? [];
    try {
      await mutate((prev) => ({ ...(prev ?? EMPTY_RESP), [active]: [] }), { revalidate: false });
      const res = await fetch(`/api/news/category?c=${active}&t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`news refresh failed: ${res.status}`);
      const json = (await res.json()) as { items?: NewsItem[] };
      const items = json.items ?? [];
      await mutate((prev) => ({ ...(prev ?? EMPTY_RESP), [active]: items }), { revalidate: false });
    } catch {
      // Restore the previous items so a failed refresh doesn't blank the tab.
      await mutate((prev) => ({ ...(prev ?? EMPTY_RESP), [active]: prevItems }), { revalidate: false });
    } finally {
      setRefreshing(false);
    }
  }

  const refreshAction = (
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
      </div>

      {isLoading && !data && <p className="text-muted text-sm">Loading…</p>}
      {error && !data && <p className="text-accent text-sm">Couldn&rsquo;t load news.</p>}
      {data && (
        <ul className="space-y-3 pr-1">
          {(data[active] ?? []).map((item) => (
            <li key={item.link}>
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="group flex gap-3 items-start"
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
            </li>
          ))}
          {(data[active] ?? []).length === 0 && (
            <li className="text-muted text-sm">No headlines.</li>
          )}
        </ul>
      )}
    </Card>
  );
}
