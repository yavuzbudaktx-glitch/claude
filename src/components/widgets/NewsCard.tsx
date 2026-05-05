"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useState } from "react";
import { Card } from "@/components/Card";
import { CATEGORY_LABELS, CATEGORY_ORDER, type NewsCategory, type NewsItem } from "@/lib/feeds";

type Resp = Record<NewsCategory, NewsItem[]>;
const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Resp>);

export function NewsCard() {
  const { data, error, isLoading } = useSWR<Resp>("/api/news", fetcher, {
    refreshInterval: 1000 * 60 * 15,
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

      {isLoading && <p className="text-muted text-sm">Loading…</p>}
      {error && <p className="text-accent text-sm">Couldn&rsquo;t load news.</p>}
      {data && (
        <ul className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
          {(data[active] ?? []).map((item) => (
            <li key={item.link}>
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="group flex gap-3 items-start"
              >
                <div className="shrink-0 w-16 h-16 rounded-md overflow-hidden border rule-soft bg-hl">
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
                    <div className="h-full w-full flex items-center justify-center font-mono text-[9px] text-muted">
                      {item.source.split(" ")[0]}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug font-medium group-hover:underline underline-offset-2 line-clamp-3">
                    {item.title}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted mt-1">
                    {item.source}
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
