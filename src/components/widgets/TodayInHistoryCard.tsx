"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";

interface TodayResp {
  date?: string;
  year?: number | null;
  text?: string;
  summary?: string | null;
  kind?: "featured" | "selected" | "events" | "births" | "deaths";
  source?: "curated" | "britannica" | "britannica-email" | "wikipedia" | "wikipedia-featured" | "wikipedia-onthisday";
  thumbnail?: string | null;
  pageTitle?: string | null;
  link?: string | null;
  error?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<TodayResp>);

export function TodayInHistoryCard() {
  const [dateKey, setDateKey] = useState(() => localDateKey());
  useEffect(() => {
    const t = setTimeout(() => setDateKey(localDateKey()), msUntilLocalMidnight());
    return () => clearTimeout(t);
  }, [dateKey]);

  const { data, isLoading } = useSWR<TodayResp>(
    `/api/today-in-history?d=${dateKey}`,
    fetcher,
    { refreshInterval: 1000 * 60 * 30, keepPreviousData: true, revalidateOnFocus: true },
  );

  const displayed: TodayResp = data ?? {};

  const labelKind =
    displayed.kind === "births" ? "Born today"
    : displayed.kind === "deaths" ? "Died today"
    : displayed.kind === "featured" ? "On This Day"
    : "On this day";

  // Require something that actually looks like a real headline. The previous
  // !displayed.text guard accepted one-word link labels ("Read", "More"),
  // which the Britannica scraper occasionally grabs from the wrong card
  // chunk — leaving the user with a thumbnail and a useless caption.
  const isMeaningfulText = (s: string | null | undefined): boolean => {
    if (!s) return false;
    const trimmed = s.trim();
    if (trimmed.length < 10) return false;
    if (/^(read|more|browse|see|view|details|home|next|previous)\b/i.test(trimmed)) return false;
    return true;
  };

  if (isLoading && !data) {
    return (
      <div className="animate-fadeIn">
        <div className="label mb-1.5">{labelKind}</div>
        <span className="text-muted text-xs italic">Loading…</span>
      </div>
    );
  }
  if (displayed.error || !isMeaningfulText(displayed.text)) {
    return (
      <div className="animate-fadeIn">
        <div className="label mb-1.5">{labelKind}</div>
        <span className="text-muted text-xs italic">No record for today.</span>
      </div>
    );
  }

  // The link ALWAYS goes to today's britannica.com/on-this-day landing
  // page, regardless of what the upstream returned. The data may be a day
  // behind (Britannica's email lags, scrape may be from yesterday), but
  // the user clicking the title should always land on TODAY's page so the
  // link feels current.
  const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const now = new Date();
  const britannicaLink = `https://www.britannica.com/on-this-day/${MONTHS[now.getMonth()]}-${now.getDate()}`;

  return (
    <div className="animate-fadeIn">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="label">{labelKind}</div>
      </div>
      {/* Text-only render. We dropped the thumbnail because Britannica's
          card images regularly loaded ahead of a missing/invalid title,
          producing the "I see a picture but no text" failure mode. */}
      <div className="flex items-baseline gap-3">
        {displayed.year != null && (
          <span className="font-serif text-2xl font-light tabular-nums leading-none text-accent shrink-0">
            {displayed.year}
          </span>
        )}
        <a
          href={britannicaLink}
          target="_blank"
          rel="noreferrer"
          className="font-serif text-[14px] leading-snug min-w-0 hover:underline underline-offset-4 decoration-[var(--rule)]"
        >
          {displayed.text}
        </a>
      </div>
      {displayed.summary && (
        <p className="font-serif text-[12.5px] leading-snug text-muted mt-1.5">
          {displayed.summary}
        </p>
      )}
    </div>
  );
}
