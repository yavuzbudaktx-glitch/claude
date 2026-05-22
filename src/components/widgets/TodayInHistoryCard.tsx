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
  source?: "curated" | "britannica" | "wikipedia" | "wikipedia-featured";
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

  const sourceLabel =
    displayed.source === "curated" ? null
    : displayed.source === "britannica" ? "Britannica"
    : displayed.source && displayed.source.startsWith("wikipedia") ? "Wikipedia"
    : null;

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
      {/* Editorial spread — big year as drop-cap-style ornament,
          headline in display serif, body paragraph below. */}
      <div className="flex items-baseline gap-4">
        {displayed.year != null && (
          <span
            className="font-display tabular-nums leading-none text-accent shrink-0 text-[2.4rem] md:text-[2.7rem]"
            style={{ fontVariationSettings: '"opsz" 144', fontWeight: 400 }}
          >
            {displayed.year}
          </span>
        )}
        {displayed.source === "britannica" ? (
          <a
            href="https://www.britannica.com/on-this-day"
            target="_blank"
            rel="noreferrer"
            className="font-display text-[17px] md:text-[19px] font-medium leading-[1.15] min-w-0 hover:text-accent transition"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            {displayed.text}
          </a>
        ) : displayed.link ? (
          <a
            href={displayed.link}
            target="_blank"
            rel="noreferrer"
            className="font-display text-[17px] md:text-[19px] font-medium leading-[1.15] min-w-0 hover:text-accent transition"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            {displayed.text}
          </a>
        ) : (
          <span
            className="font-display text-[17px] md:text-[19px] font-medium leading-[1.15] min-w-0"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            {displayed.text}
          </span>
        )}
      </div>
      {displayed.summary && (
        <p className="font-serif text-[13.5px] leading-[1.55] text-ink-soft mt-3 max-w-prose"
           style={{ fontFeatureSettings: '"onum"' }}>
          {displayed.summary}
        </p>
      )}
    </div>
  );
}
