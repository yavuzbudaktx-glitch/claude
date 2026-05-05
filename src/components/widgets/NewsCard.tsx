"use client";

import useSWR from "swr";
import { useState } from "react";
import { Newspaper } from "lucide-react";
import { Card } from "@/components/Card";
import { CATEGORY_LABELS, type NewsCategory, type NewsItem } from "@/lib/feeds";

type Resp = Record<NewsCategory, NewsItem[]>;
const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Resp>);
const ORDER: NewsCategory[] = ["turkey", "tech", "world", "science"];

export function NewsCard() {
  const { data, error, isLoading } = useSWR<Resp>("/api/news", fetcher, {
    refreshInterval: 1000 * 60 * 15,
  });
  const [active, setActive] = useState<NewsCategory>("turkey");

  return (
    <Card title="Headlines" icon={<Newspaper className="h-3.5 w-3.5" />}>
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {ORDER.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className={`text-xs px-3 py-1 rounded-full border transition ${
              active === c
                ? "bg-amber-400/90 border-amber-400 text-slate-900 font-medium"
                : "border-[var(--border)] text-muted hover:text-current hover:bg-[var(--glass-strong)]"
            }`}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-rose-400">Couldn&rsquo;t load news.</p>}
      {data && (
        <ul className="space-y-3">
          {(data[active] ?? []).map((item) => (
            <li key={item.link}>
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="block group"
              >
                <div className="text-sm leading-snug group-hover:underline underline-offset-2">
                  {item.title}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-muted mt-0.5">
                  {item.source}
                </div>
              </a>
            </li>
          ))}
          {(data[active] ?? []).length === 0 && (
            <li className="text-muted text-sm">No headlines right now.</li>
          )}
        </ul>
      )}
    </Card>
  );
}
