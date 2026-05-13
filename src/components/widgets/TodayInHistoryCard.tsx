"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";
import { extractFeaturedEvent, type BritannicaTopic } from "@/lib/britannica-extract";

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
async function clientScrapeBritannica(): Promise<BritannicaTopic | null> {
  const target = "https://www.britannica.com/on-this-day";
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(target)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
  ];
  for (const url of proxies) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const html = await res.text();
      const topic = extractFeaturedEvent(html);
      if (topic) return topic;
    } catch {
      // try next proxy
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
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setClientFeatured(JSON.parse(cached) as BritannicaTopic);
        return;
      }
    } catch {}
    let cancelled = false;
    (async () => {
      const topic = await clientScrapeBritannica();
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

  const Wrapper = (props: { children: React.ReactNode }) =>
    displayed.link ? (
      <a
        href={displayed.link}
        target="_blank"
        rel="noreferrer"
        className="block group hover:opacity-90 transition"
      >
        {props.children}
      </a>
    ) : (
      <div>{props.children}</div>
    );

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
      <div className="label mb-1.5">{labelKind}</div>
      <Wrapper>
        <div className="flex items-baseline gap-3 group-hover:underline group-hover:underline-offset-4 group-hover:decoration-[var(--rule)]">
          {displayed.year != null && (
            <span className="font-serif text-2xl font-light tabular-nums leading-none text-accent shrink-0">
              {displayed.year}
            </span>
          )}
          <span className="font-serif text-[14px] leading-snug min-w-0 line-clamp-2">
            {displayed.text}
          </span>
        </div>
        {displayed.summary && (
          <p className="font-serif text-[12.5px] leading-snug text-muted mt-1.5 line-clamp-2">
            {displayed.summary}
          </p>
        )}
      </Wrapper>
    </div>
  );
}
