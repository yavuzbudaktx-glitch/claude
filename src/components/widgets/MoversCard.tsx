"use client";

import useSWR from "swr";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "@/components/Card";
import { Sparkline } from "@/components/Sparkline";

interface Mover {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number;
  history: number[];
  type: "stock" | "crypto";
}

interface Buckets {
  gainers: Mover[];
  losers: Mover[];
}

interface Resp {
  stocks: Buckets;
  crypto: Buckets;
  asOf: number;
  fmpConfigured: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Resp>);

function fmtTime(ms: number | null | undefined) {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function MoverRow({ m }: { m: Mover }) {
  const up = m.changePct >= 0;
  return (
    <li className="grid grid-cols-[56px_1fr_88px_72px] items-center gap-2 py-1.5 text-sm">
      <span className={`font-mono text-[12px] tabular-nums ${m.type === "crypto" ? "italic" : ""}`}>
        {m.symbol}
      </span>
      <span className="text-[11px] text-muted truncate">{m.name}</span>
      <div className="flex justify-end">
        <Sparkline data={m.history} width={88} height={22} />
      </div>
      <span
        className={`font-mono tabular-nums text-[12px] text-right inline-flex items-center justify-end gap-0.5 ${
          up ? "text-emerald-600 dark:text-emerald-400" : "text-accent"
        }`}
      >
        {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {up ? "+" : ""}
        {m.changePct.toFixed(2)}%
      </span>
    </li>
  );
}

function Section({
  label,
  meta,
  items,
  empty,
}: {
  label: string;
  meta?: string;
  items: Mover[];
  empty: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="label">{label}</div>
        {meta && (
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{meta}</div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-muted text-xs italic py-2">{empty}</p>
      ) : (
        <ul className="divide-rule">
          {items.map((m) => (
            <MoverRow key={`${m.type}:${m.symbol}`} m={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function MoversCard() {
  const { data, isLoading } = useSWR<Resp>("/api/movers", fetcher, {
    refreshInterval: 1000 * 60 * 10,
    keepPreviousData: true,
    revalidateOnFocus: true,
  });

  return (
    <Card
      num="05"
      title="Movers"
      action={
        data?.asOf ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            as of {fmtTime(data.asOf)}
          </span>
        ) : null
      }
    >
      {isLoading && !data && <p className="text-muted text-sm">Loading…</p>}

      {data && data.fmpConfigured === false && (
        <p className="text-accent text-xs italic mb-3">
          Stocks unavailable: <span className="font-mono">FMP_API_KEY</span> not set in env.
        </p>
      )}

      {data && (
        <div className="space-y-4">
          <Section
            label="Stocks · Top Gainers"
            meta="1-mo chart · 24h move"
            items={data.stocks.gainers}
            empty="No data."
          />
          <Section
            label="Stocks · Top Losers"
            items={data.stocks.losers}
            empty="No data."
          />

          <div className="border-t rule-soft -mx-5" />

          <Section
            label="Crypto · Top Gainers · Robinhood"
            meta="1-mo chart · 24h move"
            items={data.crypto.gainers}
            empty="No data."
          />
          <Section
            label="Crypto · Top Losers · Robinhood"
            items={data.crypto.losers}
            empty="No data."
          />
        </div>
      )}

      <div className="font-mono text-[9px] uppercase tracking-wider text-muted mt-3">
        Sources · FMP · CoinGecko · Stooq
      </div>
    </Card>
  );
}
