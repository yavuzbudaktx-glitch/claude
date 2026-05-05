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
    <Card title="Headlines" icon={<Newspaper className="h-4 w-4" />}>
      <div className="flex gap-1 mb-3 flex-wrap">
        {ORDER.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className={`text-xs px-2.5 py-1 rounded-full border transition ${
              active === c
                ? "bg-accent/20 border-accent/50 text-white"
                : "border-white/10 text-muted hover:text-white"
            }`}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-rose-400">Couldn&rsquo;t load news.</p>}
      {data && (
        <ul className="space-y-2.5">
          {(data[active] ?? []).map((item) => (
            <li key={item.link}>
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="block hover:bg-white/5 -mx-2 px-2 py-1 rounded transition"
              >
                <div className="text-sm leading-snug">{item.title}</div>
                <div className="text-xs text-muted mt-0.5">{item.source}</div>
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
