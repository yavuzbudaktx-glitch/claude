"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { format } from "date-fns";
import { useEffect, useState } from "react";

interface TodayResp {
  date?: string;
  year?: number;
  text?: string;
  thumbnail?: string | null;
  pageTitle?: string | null;
  link?: string | null;
  error?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<TodayResp>);

export function TodayInHistoryCard() {
  const { data, isLoading } = useSWR<TodayResp>("/api/today-in-history", fetcher, {
    refreshInterval: 1000 * 60 * 60 * 6,
  });
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const Wrapper = (props: { children: React.ReactNode }) =>
    data?.link ? (
      <a
        href={data.link}
        target="_blank"
        rel="noreferrer"
        className="card-bare flex items-stretch gap-5 group hover:bg-hl/40 transition"
      >
        {props.children}
      </a>
    ) : (
      <div className="card-bare flex items-stretch gap-5">{props.children}</div>
    );

  return (
    <section className="animate-fadeIn">
      <Wrapper>
        <div className="flex items-baseline gap-2 shrink-0 self-center">
          <span className="label">Today in History</span>
          {now && (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              · {format(now, "MMM d")}
            </span>
          )}
        </div>

        <div className="flex-1 flex items-center gap-5 min-w-0">
          {isLoading && <p className="text-muted text-sm italic">Loading…</p>}
          {!isLoading && data?.error && (
            <p className="text-muted text-sm italic">No record for today.</p>
          )}
          {data?.year && data.text && (
            <>
              <div className="font-serif text-4xl md:text-5xl font-light tabular-nums leading-none text-accent shrink-0">
                {data.year}
              </div>
              <p className="font-serif text-[14px] md:text-[15px] leading-snug min-w-0 group-hover:underline underline-offset-2 decoration-from-font">
                {data.text}
              </p>
              {data.thumbnail && (
                <img
                  src={data.thumbnail}
                  alt={data.pageTitle ?? ""}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-16 w-24 object-cover rounded-md border rule shrink-0 hidden md:block"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </>
          )}
        </div>
      </Wrapper>
    </section>
  );
}
