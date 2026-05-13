"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "@/components/Card";
import { Sparkline } from "@/components/Sparkline";

// Vercel's egress IPs are being rate-limited by every free stock-history
// source we've tried (Yahoo, NASDAQ, Stooq), so server-side fetching keeps
// returning empty. The fix: fetch from the *client* instead — the user's
// browser is on a residential IP that isn't on those blocklists. Yahoo
// doesn't set CORS headers though, so we route through public CORS proxies.
const SPARKLINE_CACHE_KEY = "morning.sparkline.v2";
const SPARKLINE_CACHE_TTL = 1000 * 60 * 60 * 6; // 6h
interface CacheEntry { ts: number; data: number[] }

function readSparklineCache(symbol: string): number[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${SPARKLINE_CACHE_KEY}.${symbol}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.ts > SPARKLINE_CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeSparklineCache(symbol: string, data: number[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${SPARKLINE_CACHE_KEY}.${symbol}`,
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {}
}

interface YahooChartResp {
  chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> };
}

async function fetchYahooViaProxies(symbol: string): Promise<number[]> {
  const yahoo = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=1mo&interval=1d`;
  const candidates = [
    `https://corsproxy.io/?${encodeURIComponent(yahoo)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahoo)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahoo)}`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as YahooChartResp;
      const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      const cleaned = closes.filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n),
      );
      if (cleaned.length >= 3) return cleaned.slice(-30);
    } catch {
      // try next proxy
    }
  }
  return [];
}

function useClientSparkline(symbol: string, type: "stock" | "crypto", initial: number[]): number[] {
  const [data, setData] = useState<number[]>(() => {
    if (type !== "stock") return initial;
    const cached = readSparklineCache(symbol);
    if (cached && cached.length >= 3) return cached;
    return initial;
  });

  useEffect(() => {
    if (type !== "stock") return;
    if (data.length >= 10) return; // already have a real chart; don't refetch
    let cancelled = false;
    (async () => {
      const fetched = await fetchYahooViaProxies(symbol);
      if (cancelled) return;
      if (fetched.length >= 3) {
        setData(fetched);
        writeSparklineCache(symbol, fetched);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, type, data.length]);

  return data;
}

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
  fmpError?: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Resp>);

function fmtTime(ms: number | null | undefined) {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtPrice(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  if (p >= 1000) return `$${Math.round(p).toLocaleString()}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function MoverRow({ m }: { m: Mover }) {
  const up = m.changePct >= 0;
  const history = useClientSparkline(m.symbol, m.type, m.history);
  return (
    <li className="grid grid-cols-[52px_1fr_64px_88px_64px] items-center gap-2 py-1.5 text-sm">
      <span className={`font-mono text-[12px] tabular-nums ${m.type === "crypto" ? "italic" : ""}`}>
        {m.symbol}
      </span>
      <span className="text-[11px] text-muted truncate">{m.name}</span>
      <span className="font-mono tabular-nums text-[12px] text-right">
        {fmtPrice(m.price)}
      </span>
      <div className="flex justify-end">
        <Sparkline data={history} width={88} height={22} up={up} />
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

      {data &&
        data.fmpConfigured &&
        data.fmpError &&
        data.stocks.gainers.length === 0 &&
        data.stocks.losers.length === 0 && (
          <p className="text-accent text-xs italic mb-3">
            FMP error: <span className="font-mono">{data.fmpError}</span>
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
        Sources · FMP · CoinGecko
      </div>
    </Card>
  );
}
