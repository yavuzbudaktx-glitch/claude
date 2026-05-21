"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import { Card } from "@/components/Card";
import { Sparkline } from "@/components/Sparkline";
import { createClient } from "@/lib/supabase/client";

// =============================================================================
//   Watchlist — user-picked stock tickers, fetched client-side from Yahoo
//   Finance via public CORS proxies and synced across devices via Supabase
//   when the user is signed in. localStorage is a cache for cold-start +
//   offline reads.
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
    if (quote && quote.symbol === symbol) return;
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

interface WatchlistRow { symbol: string; position: number }

function readLocalWatchlist(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function writeLocalWatchlist(list: string[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)); } catch {}
}

function MarketsBody() {
  const supabase = useMemo(() => createClient(), []);
  const [tickers, setTickers] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const hydrated = useRef(false);

  // On mount: figure out auth state, then load tickers from the right source.
  // - Signed-in: Supabase is source of truth. If empty, seed from
  //   localStorage (carry-over from before sign-in) or defaults.
  // - Signed-out: localStorage only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);

      if (uid) {
        const { data, error } = await supabase
          .from("watchlist")
          .select("symbol, position, created_at")
          .eq("user_id", uid)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true });
        if (cancelled) return;
        const fromDb = !error && data ? data.map((r) => (r as { symbol: string }).symbol) : [];
        if (fromDb.length > 0) {
          setTickers(fromDb);
        } else {
          // First time signed in on this account — seed from the local
          // list (if any) so the user doesn't lose tickers they added
          // pre-auth, otherwise from defaults.
          const seed = readLocalWatchlist() ?? DEFAULT_WATCHLIST;
          setTickers(seed);
          await supabase
            .from("watchlist")
            .insert(seed.map((symbol, i) => ({ user_id: uid, symbol, position: i })));
        }
      } else {
        const local = readLocalWatchlist();
        setTickers(local && local.length > 0 ? local : DEFAULT_WATCHLIST);
      }
      hydrated.current = true;
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // Mirror to localStorage so a fresh page-load before Supabase
  // round-trips still shows the right list.
  useEffect(() => {
    if (!hydrated.current) return;
    writeLocalWatchlist(tickers);
  }, [tickers]);

  const add = useCallback(
    async (raw: string) => {
      const sym = raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
      if (!sym || sym.length > 6) return;
      if (tickers.includes(sym)) return;
      const next = [...tickers, sym];
      setTickers(next);
      setAdding("");
      if (userId) {
        await supabase
          .from("watchlist")
          .upsert({ user_id: userId, symbol: sym, position: next.length - 1 });
      }
    },
    [tickers, userId, supabase],
  );

  const remove = useCallback(
    async (sym: string) => {
      setTickers((t) => t.filter((s) => s !== sym));
      if (userId) {
        await supabase
          .from("watchlist")
          .delete()
          .eq("user_id", userId)
          .eq("symbol", sym);
      }
    },
    [userId, supabase],
  );

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
      {userId === null && (
        <div className="font-mono text-[9px] uppercase tracking-wider text-muted mt-3">
          Sign in to sync this watchlist across devices.
        </div>
      )}
    </div>
  );
}

export function MoversCard() {
  return (
    <Card num="05" title="Watchlist">
      <MarketsBody />
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted mt-3">
        Source · Yahoo Finance
      </div>
    </Card>
  );
}
