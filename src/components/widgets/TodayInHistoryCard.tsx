"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";

interface TodayResp {
  date?: string;
  year?: number;
  text?: string;
  summary?: string | null;
  kind?: "selected" | "events" | "births" | "deaths";
  thumbnail?: string | null;
  pageTitle?: string | null;
  link?: string | null;
  error?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<TodayResp>);

function localDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Returns ms until the next local midnight + 1s of jitter.
function msUntilLocalMidnight() {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return tomorrow.getTime() - now.getTime();
}

export function TodayInHistoryCard() {
  // The SWR cache key is the user's *local* date so the content bucket flips
  // at local midnight, not at UTC midnight (which is 7-8 hours off in CST).
  const [dateKey, setDateKey] = useState(() => localDateKey());

  // After local midnight, force the SWR key to advance even if the tab stayed
  // open. Without this we'd only refresh on the next refreshInterval tick.
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

  const labelKind =
    data?.kind === "births" ? "Born today"
    : data?.kind === "deaths" ? "Died today"
    : "On this day";

  const Wrapper = (props: { children: React.ReactNode }) =>
    data?.link ? (
      <a
        href={data.link}
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
  if (data?.error || !data?.year) {
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
          <span className="font-serif text-2xl font-light tabular-nums leading-none text-accent shrink-0">
            {data.year}
          </span>
          <span className="font-serif text-[14px] leading-snug min-w-0 line-clamp-2">
            {data.text}
          </span>
        </div>
        {data.summary && (
          <p className="font-serif text-[12.5px] leading-snug text-muted mt-1.5 line-clamp-2">
            {data.summary}
          </p>
        )}
      </Wrapper>
    </div>
  );
}
