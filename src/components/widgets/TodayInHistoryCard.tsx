"use client";

import useSWR from "swr";

interface TodayResp {
  date?: string;
  year?: number;
  text?: string;
  kind?: "selected" | "events" | "births" | "deaths";
  thumbnail?: string | null;
  pageTitle?: string | null;
  link?: string | null;
  error?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<TodayResp>);

function utcDateKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function TodayInHistoryCard() {
  // Embedding the UTC date in the SWR key makes the cache bucket flip
  // automatically at midnight UTC, even if the user keeps the tab open.
  const { data, isLoading } = useSWR<TodayResp>(
    `/api/today-in-history?d=${utcDateKey()}`,
    fetcher,
    {
      refreshInterval: 1000 * 60 * 30,
      keepPreviousData: true,
      revalidateOnFocus: true,
    },
  );

  const inner = (() => {
    if (isLoading && !data) return <span className="text-muted text-xs italic">Loading…</span>;
    if (data?.error || !data?.year) return <span className="text-muted text-xs italic">No record for today.</span>;
    return (
      <>
        <span className="font-serif text-2xl font-light tabular-nums leading-none text-accent shrink-0">
          {data.year}
        </span>
        <span className="font-serif text-[14px] leading-snug min-w-0 line-clamp-2">
          {data.text}
        </span>
      </>
    );
  })();

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

  return (
    <div className="animate-fadeIn">
      <div className="label mb-1.5">{labelKind}</div>
      <Wrapper>
        <div className="flex items-baseline gap-3 group-hover:underline group-hover:underline-offset-4 group-hover:decoration-[var(--rule)]">
          {inner}
        </div>
      </Wrapper>
    </div>
  );
}
