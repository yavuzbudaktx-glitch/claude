"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import { Card } from "@/components/Card";
import { Sparkline } from "@/components/Sparkline";
import { createClient } from "@/lib/supabase/client";
import { useCommand } from "@/lib/commands";

// =============================================================================
//   Watchlist — user-picked stock tickers, fetched client-side from Yahoo
//   Finance via public CORS proxies and synced across devices via Supabase
//   when the user is signed in. localStorage is a cache for cold-start +
//   offline reads.
// =============================================================================

const WATCHLIST_KEY = "morning.watchlist.v1";
const DEFAULT_WATCHLIST = ["NVDA", "AAPL", "TSLA", "AMZN", "GOOGL"];

const QUOTE_CACHE_KEY = "morning.quote.v1";
const QUOTE_FRESH_MS = 1000 * 60 * 5;       // <5min old → no refetch
const QUOTE_STALE_MAX_MS = 1000 * 60 * 60 * 12; // up to 12h old still rendered

// Cap concurrent CORS-proxy fetches so a watchlist with many tickers
// doesn't trip per-IP rate limits on corsproxy.io / allorigins / etc.
// Three slots is enough for fast aggregate load without saturating any
// single proxy.
const MAX_CONCURRENT_QUOTES = 3;
let inFlight = 0;
const queue: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_CONCURRENT_QUOTES) {
    await new Promise<void>((r) => queue.push(r));
  }
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    const next = queue.shift();
    if (next) next();
  }
}

// In-flight dedupe: if the same symbol is requested twice before the
// first fetch resolves, both calls await the same Promise instead of
// queueing two separate CORS-proxy round-trips.
const inFlightBySymbol = new Map<string, Promise<Quote | null>>();

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

interface CachedQuote { data: Quote; ts: number; fresh: boolean }
function readQuoteCache(symbol: string): CachedQuote | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${QUOTE_CACHE_KEY}.${symbol}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { ts: number; data: Quote };
    const age = Date.now() - entry.ts;
    if (age > QUOTE_STALE_MAX_MS) return null;
    return { data: entry.data, ts: entry.ts, fresh: age < QUOTE_FRESH_MS };
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

async function fetchYahooQuoteRaw(symbol: string): Promise<Quote | null> {
  const yahoo = (host: string) =>
    `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
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
      if (typeof price !== "number") continue;

      const closesRaw = result?.indicators?.quote?.[0]?.close ?? [];
      const closes = closesRaw.filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n),
      );

      // Yahoo's meta.chartPreviousClose for range=1mo is the close from
      // ~30 days ago, NOT yesterday's — using that would render the
      // monthly return, not today's move (and flip a lot of greens to
      // reds). Today's move is current price vs the most recent prior
      // close in the daily series.
      const priorClose =
        closes.length >= 2 ? closes[closes.length - 2] :
        typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose :
        typeof meta?.previousClose === "number" ? meta.previousClose :
        price;

      const sym = meta?.symbol?.toUpperCase() ?? symbol.toUpperCase();
      return {
        symbol: sym,
        name: meta?.shortName ?? meta?.longName ?? sym,
        price,
        prevClose: priorClose,
        changePct: priorClose ? ((price - priorClose) / priorClose) * 100 : 0,
        closes: closes.length > 0 ? closes : [priorClose, price],
      };
    } catch {
      // try next proxy
    }
  }
  return null;
}

// Shared accessor: same-symbol calls dedupe to one in-flight Promise,
// and the work itself only runs when a concurrency slot is free.
function fetchYahooQuote(symbol: string): Promise<Quote | null> {
  const existing = inFlightBySymbol.get(symbol);
  if (existing) return existing;
  const p = withSlot(() => fetchYahooQuoteRaw(symbol)).finally(() => {
    inFlightBySymbol.delete(symbol);
  });
  inFlightBySymbol.set(symbol, p);
  return p;
}

function useTickerData(symbol: string): { quote: Quote | null; loading: boolean } {
  // Stale-while-revalidate: show cached data immediately (even when
  // older than 5min) so the row never goes blank, then refresh in the
  // background. Concurrency limiter in fetchYahooQuote ensures large
  // watchlists don't hammer the CORS proxies all at once.
  const initial = typeof window !== "undefined" ? readQuoteCache(symbol) : null;
  const [quote, setQuote] = useState<Quote | null>(initial?.data ?? null);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    let cancelled = false;
    const cached = readQuoteCache(symbol);
    // Cached + fresh → trust it, no fetch.
    if (cached && cached.fresh && cached.data.symbol === symbol) {
      setQuote(cached.data);
      setLoading(false);
      return;
    }
    // Cached + stale → show stale data immediately, refresh below.
    if (cached) {
      setQuote(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const run = async (attempt: number) => {
      const fetched = await fetchYahooQuote(symbol);
      if (cancelled) return;
      if (fetched) {
        setQuote(fetched);
        writeQuoteCache(symbol, fetched);
        setLoading(false);
        return;
      }
      // No proxy returned data this round. If we still have nothing
      // (no cached data even), retry a couple of times with backoff
      // — usually it's one proxy briefly throttling.
      if (attempt < 2) {
        setTimeout(() => { if (!cancelled) run(attempt + 1); }, 1200 * (attempt + 1));
      } else {
        setLoading(false);
      }
    };
    run(0);

    return () => { cancelled = true; };
  }, [symbol]);

  return { quote, loading };
}

function fmtPrice(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  if (p >= 1000) return `$${Math.round(p).toLocaleString()}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function WatchlistTile({ symbol, onRemove }: { symbol: string; onRemove: (s: string) => void }) {
  const { quote, loading } = useTickerData(symbol);
  const up = quote ? quote.changePct >= 0 : true;
  const changeClass = quote
    ? up
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-accent"
    : "text-muted";

  return (
    <li className="group relative border rule-soft rounded-md p-3 hover:border-[var(--rule)] transition">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(symbol); }}
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition text-muted hover:text-accent"
        aria-label={`Remove ${symbol}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <a
          href={`https://stockinvest.us/stock/${encodeURIComponent(symbol)}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[13px] tabular-nums font-medium hover:text-accent transition"
        >
          {symbol}
        </a>
        <span
          className={`font-mono tabular-nums text-[12px] inline-flex items-center gap-0.5 ${changeClass}`}
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
      </div>

      <div className="text-[10.5px] text-muted truncate mb-2">
        {quote?.name ?? (loading ? "Loading…" : symbol)}
      </div>

      <div className="flex items-end justify-between gap-2">
        <span className="font-mono tabular-nums text-[15px]">
          {fmtPrice(quote?.price ?? null)}
        </span>
        <Sparkline data={quote?.closes ?? []} width={110} height={28} up={up} />
      </div>
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

  // Let the command palette add a ticker.
  useCommand((c) => { if (c.kind === "watchlist-add") add(c.value); });

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="label">Watchlist</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
          30-day chart · today&rsquo;s move
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
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tickers.map((s) => (
            <WatchlistTile key={s} symbol={s} onRemove={remove} />
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

function CurrencyRates() {
  const [rates, setRates] = useState<{ usdtry: number; eurtry: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { rates?: Record<string, number> };
        const tryRate = j.rates?.TRY;
        const eur = j.rates?.EUR;
        if (!cancelled && typeof tryRate === "number" && typeof eur === "number" && eur) {
          setRates({ usdtry: tryRate, eurtry: tryRate / eur });
        }
      } catch {
        // leave previous value
      }
    };
    load();
    const t = setInterval(load, 1000 * 60 * 30);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!rates) return null;
  return (
    <div className="flex items-center gap-4 mt-3 pt-3 border-t rule-soft font-mono text-[11px] tabular-nums">
      <span className="label !text-[9px]">FX</span>
      <span className="text-muted">
        USD/TRY <span className="text-ink font-medium">{rates.usdtry.toFixed(2)}</span>
      </span>
      <span className="text-muted">
        EUR/TRY <span className="text-ink font-medium">{rates.eurtry.toFixed(2)}</span>
      </span>
    </div>
  );
}

export function MoversCard() {
  return (
    <Card num="05" title="Watchlist">
      <MarketsBody />
      <CurrencyRates />
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted mt-3">
        Source · Yahoo Finance · exchangerate-api
      </div>
    </Card>
  );
}
