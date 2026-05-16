"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import { Card } from "@/components/Card";
import { Sparkline } from "@/components/Sparkline";

// =============================================================================
//   Watchlist: user-picked stock tickers, fetched entirely client-side from
//   Yahoo Finance via the public CORS-proxy chain (the user's residential IP
//   isn't on Yahoo's anti-bot blocklist the way Vercel's egress is).
// =============================================================================

const WATCHLIST_KEY = "morning.watchlist.v1";
const DEFAULT_WATCHLIST = ["NVDA", "AAPL", "TSLA", "AMZN", "GOOGL"];

const QUOTE_CACHE_KEY = "morning.quote.v1";
const QUOTE_CACHE_TTL = 1000 * 60 * 5; // 5min

interface YahooMeta {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
}
interface YahooChartResp {
  chart?: {
    result?: Array<{
      meta?: YahooMeta;
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
  };
}

interface Quote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  changePct: number;
  closes: number[];
}

function readQuoteCache(symbol: string): Quote | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${QUOTE_CACHE_KEY}.${symbol}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { ts: number; data: Quote };
    if (Date.now() - entry.ts > QUOTE_CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}
function writeQuoteCache(symbol: string, data: Quote) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${QUOTE_CACHE_KEY}.${symbol}`,
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {}
}

async function fetchYahooQuote(symbol: string): Promise<Quote | null> {
  // 5d/1d gives us roughly a week of daily closes plus today's live
  // price in meta. interval=1d is the cleanest data shape; 5d is the
  // tightest range Yahoo supports for daily bars.
  const yahoo = (host: string) =>
    `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const candidates = [
    `https://corsproxy.io/?${encodeURIComponent(yahoo("query1.finance.yahoo.com"))}`,
    `https://corsproxy.io/?${encodeURIComponent(yahoo("query2.finance.yahoo.com"))}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahoo("query1.finance.yahoo.com"))}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahoo("query1.finance.yahoo.com"))}`,
    `https://proxy.cors.sh/${yahoo("query1.finance.yahoo.com")}`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = (await res.json()) as YahooChartResp;
      const result = json.chart?.result?.[0];
      const meta = result?.meta;
      const price = meta?.regularMarketPrice;
      const prevClose = meta?.chartPreviousClose ?? meta?.previousClose;
      if (typeof price !== "number" || typeof prevClose !== "number") continue;
      const closesRaw = result?.indicators?.quote?.[0]?.close ?? [];
      const closes = closesRaw.filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n),
      );
      const sym = meta?.symbol?.toUpperCase() ?? symbol.toUpperCase();
      return {
        symbol: sym,
        name: meta?.shortName ?? meta?.longName ?? sym,
        price,
        prevClose,
        changePct: ((price - prevClose) / prevClose) * 100,
        closes: closes.length > 0 ? closes : [prevClose, price],
      };
    } catch {
      // try next proxy
    }
  }
  return null;
}

function useTickerData(symbol: string): { quote: Quote | null; loading: boolean } {
  const [quote, setQuote] = useState<Quote | null>(() => readQuoteCache(symbol));
  const [loading, setLoading] = useState(!quote);

  useEffect(() => {
    if (quote && quote.symbol === symbol) return; // already have fresh data
    let cancelled = false;
    setLoading(true);
    (async () => {
      const fetched = await fetchYahooQuote(symbol);
      if (cancelled) return;
      if (fetched) {
        setQuote(fetched);
        writeQuoteCache(symbol, fetched);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [symbol, quote]);

  return { quote, loading };
}

function fmtPrice(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  if (p >= 1000) return `$${Math.round(p).toLocaleString()}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function WatchlistRow({ symbol, onRemove }: { symbol: string; onRemove: (s: string) => void }) {
  const { quote, loading } = useTickerData(symbol);
  const up = quote ? quote.changePct >= 0 : true;

  return (
    <li className="group grid grid-cols-[60px_1fr_72px_88px_72px_18px] items-center gap-2 py-1.5 text-sm">
      <span className="font-mono text-[12px] tabular-nums">{symbol}</span>
      <span className="text-[11px] text-muted truncate">
        {quote?.name ?? (loading ? "Loading…" : symbol)}
      </span>
      <span className="font-mono tabular-nums text-[12px] text-right">
        {fmtPrice(quote?.price ?? null)}
      </span>
      <div className="flex justify-end">
        <Sparkline data={quote?.closes ?? []} width={88} height={22} up={up} />
      </div>
      <span
        className={`font-mono tabular-nums text-[12px] text-right inline-flex items-center justify-end gap-0.5 ${
          quote
            ? up
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-accent"
            : "text-muted"
        }`}
      >
        {quote ? (
          <>
            {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {up ? "+" : ""}
            {quote.changePct.toFixed(2)}%
          </>
        ) : (
          "—"
        )}
      </span>
      <button
        onClick={() => onRemove(symbol)}
        className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-accent"
        aria-label={`Remove ${symbol}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function Watchlist() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : null;
      setTickers(parsed && parsed.length > 0 ? parsed : DEFAULT_WATCHLIST);
    } catch {
      setTickers(DEFAULT_WATCHLIST);
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(tickers)); } catch {}
  }, [tickers]);

  function add(raw: string) {
    const sym = raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    if (!sym || sym.length > 6) return;
    if (tickers.includes(sym)) return;
    setTickers((t) => [...t, sym]);
    setAdding("");
  }
  function remove(sym: string) {
    setTickers((t) => t.filter((s) => s !== sym));
  }

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="label">Watchlist</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
          5-day chart · today&rsquo;s move
        </div>
        <form
          className="ml-auto flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); add(adding); }}
        >
          <input
            type="text"
            value={adding}
            onChange={(e) => setAdding(e.target.value.toUpperCase())}
            placeholder="+ Add ticker"
            maxLength={6}
            className="font-mono text-[11px] tabular-nums uppercase bg-transparent border border-[var(--rule-soft)] rounded px-2 py-0.5 w-24 focus:border-[var(--rule)] focus:outline-none placeholder:text-muted placeholder:normal-case placeholder:tracking-wider"
          />
          <button
            type="submit"
            aria-label="Add"
            className="text-muted hover:text-accent transition"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
      {tickers.length === 0 ? (
        <p className="text-muted text-xs italic py-2">
          No tickers yet. Type one above and press Enter.
        </p>
      ) : (
        <ul className="divide-rule">
          {tickers.map((s) => (
            <WatchlistRow key={s} symbol={s} onRemove={remove} />
          ))}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
//   Crypto half — same as before. Server-side route returns top movers from
//   CoinGecko (no Yahoo / FMP dependency); display unchanged.
// =============================================================================

interface Mover {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number;
  history: number[];
  type: "stock" | "crypto";
}
interface Buckets { gainers: Mover[]; losers: Mover[] }
interface Resp {
  crypto: Buckets;
  asOf: number;
  fmpConfigured?: boolean;
  fmpError?: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Resp>);

function fmtTime(ms: number | null | undefined) {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function CryptoRow({ m }: { m: Mover }) {
  const up = m.changePct >= 0;
  return (
    <li className="grid grid-cols-[52px_1fr_64px_88px_64px] items-center gap-2 py-1.5 text-sm">
      <span className="font-mono text-[12px] tabular-nums italic">{m.symbol}</span>
      <span className="text-[11px] text-muted truncate">{m.name}</span>
      <span className="font-mono tabular-nums text-[12px] text-right">
        {fmtPrice(m.price)}
      </span>
      <div className="flex justify-end">
        <Sparkline data={m.history} width={88} height={22} up={up} />
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

function CryptoSection({ label, items, meta }: { label: string; items: Mover[]; meta?: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="label">{label}</div>
        {meta && (
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{meta}</div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-muted text-xs italic py-2">No data right now — will refresh.</p>
      ) : (
        <ul className="divide-rule">
          {items.map((m) => (
            <CryptoRow key={`${m.type}:${m.symbol}`} m={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function MoversCard() {
  const { data } = useSWR<Resp>("/api/movers", fetcher, {
    refreshInterval: 1000 * 60 * 10,
    keepPreviousData: true,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  const cryptoView = useMemo(
    () => ({
      gainers: data?.crypto?.gainers ?? [],
      losers: data?.crypto?.losers ?? [],
    }),
    [data],
  );

  return (
    <Card
      num="05"
      title="Markets"
      action={
        data?.asOf ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            as of {fmtTime(data.asOf)}
          </span>
        ) : null
      }
    >
      <div className="space-y-4">
        <Watchlist />

        <div className="border-t rule-soft -mx-5" />

        <CryptoSection
          label="Crypto · Top Gainers · Robinhood"
          meta="1-mo chart · 24h move"
          items={cryptoView.gainers}
        />
        <CryptoSection
          label="Crypto · Top Losers · Robinhood"
          items={cryptoView.losers}
        />
      </div>

      <div className="font-mono text-[9px] uppercase tracking-wider text-muted mt-3">
        Sources · Yahoo Finance · CoinGecko
      </div>
    </Card>
  );
}
