"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useState } from "react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { Card } from "@/components/Card";
import { CATEGORY_LABELS, CATEGORY_ORDER, type NewsCategory, type NewsItem } from "@/lib/feeds";

type Resp = Record<NewsCategory, NewsItem[]>;
const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Resp>);

// Stable colour per source, derived from name. Only used when the feed
// item has no thumbnail of its own.
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
  const [active, setActive] = useState<NewsCategory>("world");

  return (
    <Card num="03" title="The Wire">
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
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div
                      className="h-full w-full flex items-center justify-center font-serif text-base text-white tracking-wide select-none"
                      style={{ background: `linear-gradient(135deg, ${placeholderColor(item.source)}, ${placeholderColor(item.source)}dd)` }}
                    >
                      {sourceInitials(item.source)}
                    </div>
                  )}
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
