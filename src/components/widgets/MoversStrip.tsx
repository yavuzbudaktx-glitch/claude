"use client";

import useSWR from "swr";
import { ArrowUp, ArrowDown } from "lucide-react";

interface Mover {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number;
  type: "stock" | "crypto";
}

interface Resp { movers: Mover[] }

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Resp>);

export function MoversStrip() {
  const { data } = useSWR<Resp>("/api/movers", fetcher, {
    refreshInterval: 1000 * 60,
    keepPreviousData: true,
  });

  if (!data || data.movers.length === 0) return null;

  return (
    <div className="border-t rule-soft -mx-5 px-5 pt-3 mt-4">
      <div className="flex items-center gap-3 mb-1.5">
        <div className="label">Top Movers · 24h</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Stocks &amp; Crypto
        </div>
      </div>
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
        {data.movers.map((m) => {
          const up = m.changePct >= 0;
          return (
            <div
              key={`${m.type}:${m.symbol}`}
              className="flex items-center gap-1 font-mono text-[12px] tabular-nums"
              title={`${m.name}${m.price ? ` · $${m.price.toFixed(2)}` : ""}`}
            >
              {up ? (
                <ArrowUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-accent" />
              )}
              <span className={m.type === "crypto" ? "italic" : ""}>{m.symbol}</span>
              <span className={up ? "text-emerald-600 dark:text-emerald-400" : "text-accent"}>
                {up ? "+" : ""}{m.changePct.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
