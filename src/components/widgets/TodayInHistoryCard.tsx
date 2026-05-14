"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";
import { extractFeaturedEvent, isPlausibleFeaturedEvent, type BritannicaTopic } from "@/lib/britannica-extract";

interface TodayResp {
  date?: string;
  year?: number | null;
  text?: string;
  summary?: string | null;
  kind?: "featured" | "selected" | "events" | "births" | "deaths";
  source?: "britannica" | "wikipedia";
  thumbnail?: string | null;
  pageTitle?: string | null;
  link?: string | null;
  error?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<TodayResp>);

// Vercel's egress IPs are sometimes blocked from britannica.com, in which
// case the server route falls back to Wikipedia. The user's browser, on a
// residential IP, isn't blocked — so we scrape Britannica directly from
// the client via a public CORS proxy and override the displayed content
// when the server response wasn't already Britannica.
async function clientScrapeBritannica(date: Date): Promise<BritannicaTopic | null> {
  const MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const targets = [
    `https://www.britannica.com/on-this-day/${MONTHS[date.getMonth()]}-${date.getDate()}`,
    "https://www.britannica.com/on-this-day",
  ];
  const proxify = (target: string): string[] => [
    `https://corsproxy.io/?${encodeURIComponent(target)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    `https://proxy.cors.sh/${target}`,
    `https://thingproxy.freeboard.io/fetch/${target}`,
  ];
  for (const target of targets) {
    for (const url of proxify(target)) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const html = await res.text();
        const topic = extractFeaturedEvent(html);
        if (topic && isPlausibleFeaturedEvent(topic)) return topic;
      } catch {
        // try next proxy / target
      }
    }
  }
  return null;
}

export function TodayInHistoryCard() {
  // The SWR cache key is the user's *local* date so the content bucket flips
  // at local midnight, not at UTC midnight (which is 7-8 hours off in CST).
  const [dateKey, setDateKey] = useState(() => localDateKey());

  useEffect(() => {
    const t = setTimeout(() => setDateKey(localDateKey()), msUntilLocalMidnight());
    return () => clearTimeout(t);
  }, [dateKey]);

  const { data, isLoading } = useSWR<TodayResp>(
    `/api/today-in-history?d=${dateKey}`,
    fetcher,
    {
      refreshInterval: 1000 * 60 * 30,
      keepPreviousData: true,
      revalidateOnFocus: true,
    },
  );

  // Client-side Britannica override. Runs only when the server response
  // wasn't already Britannica. Cached in localStorage per date so we don't
  // re-scrape on every render.
  const [clientFeatured, setClientFeatured] = useState<BritannicaTopic | null>(null);
  useEffect(() => {
    if (!data) return;
    if (data.source === "britannica") return;
    const cacheKey = `britannica-tih.${dateKey}`;
    // Use a cached value only if it actually looks like a featured event.
    // We've had stale localStorage entries from earlier deploys that
    // matched the wrong section of the page and stuck around all day.
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as BritannicaTopic;
        if (isPlausibleFeaturedEvent(parsed)) {
          setClientFeatured(parsed);
          return;
        }
        localStorage.removeItem(cacheKey);
      }
    } catch {}
    let cancelled = false;
    (async () => {
      const now = new Date();
      const topic = await clientScrapeBritannica(now);
      if (cancelled || !topic) return;
      setClientFeatured(topic);
      try { localStorage.setItem(cacheKey, JSON.stringify(topic)); } catch {}
    })();
    return () => { cancelled = true; };
  }, [data, dateKey]);

  // Merge: client-side Britannica takes priority over the server response
  // whenever it succeeded, since "featured" is the source we prefer.
  const displayed: TodayResp = clientFeatured
    ? {
        ...data,
        year: clientFeatured.year ?? null,
        text: clientFeatured.title,
        summary: clientFeatured.summary,
        kind: "featured",
        source: "britannica",
        thumbnail: clientFeatured.thumbnail,
        pageTitle: clientFeatured.title,
        link: clientFeatured.link,
      }
    : data ?? {};

  const labelKind =
    displayed.kind === "births" ? "Born today"
    : displayed.kind === "deaths" ? "Died today"
    : displayed.kind === "featured" ? "Featured event"
    : "On this day";

  const sourceLabel = displayed.source === "britannica" ? "Britannica" : displayed.source === "wikipedia" ? "Wikipedia" : null;

  if (isLoading && !data) {
    return (
      <div className="animate-fadeIn">
        <div className="label mb-1.5">{labelKind}</div>
        <span className="text-muted text-xs italic">Loading…</span>
      </div>
    );
  }
  if (displayed.error || !displayed.text) {
    return (
      <div className="animate-fadeIn">
        <div className="label mb-1.5">{labelKind}</div>
        <span className="text-muted text-xs italic">No record for today.</span>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="label">{labelKind}</div>
        {sourceLabel && (
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted">
            via {sourceLabel}
          </div>
        )}
      </div>
      {/* Render the body inline (no full-card link wrapper) so the user
          reads the Britannica content without needing to click out. The
          title alone deep-links to the article when available. */}
      <div className="flex gap-3">
        {displayed.thumbnail && (
          <img
            src={displayed.thumbnail}
            alt=""
            className="h-16 w-16 object-cover rounded shrink-0 border rule-soft"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            {displayed.year != null && (
              <span className="font-serif text-2xl font-light tabular-nums leading-none text-accent shrink-0">
                {displayed.year}
              </span>
            )}
            {displayed.link ? (
              <a
                href={displayed.link}
                target="_blank"
                rel="noreferrer"
                className="font-serif text-[14px] leading-snug min-w-0 line-clamp-2 hover:underline underline-offset-4 decoration-[var(--rule)]"
              >
                {displayed.text}
              </a>
            ) : (
              <span className="font-serif text-[14px] leading-snug min-w-0 line-clamp-2">
                {displayed.text}
              </span>
            )}
          </div>
          {displayed.summary && (
            <p className="font-serif text-[12.5px] leading-snug text-muted mt-1.5 line-clamp-3">
              {displayed.summary}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
