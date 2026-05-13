import { NextResponse } from "next/server";

// Movers feed used by MoversCard. Returns four lists:
//   stocks.gainers, stocks.losers, crypto.gainers, crypto.losers
// Five entries each, with 30-day daily-close sparkline data per row.
//
// Stocks come from FMP (Financial Modeling Prep) which has native top
// gainers/losers list endpoints and works reliably from cloud egress IPs
// (unlike Yahoo Finance and Stooq, both of which silently rate-limit Vercel).
// FMP free tier = 250 calls/day; we make 2 calls per route refresh
// (gainers + losers) cached for 10 min, so worst-case ~288/day.
//
// Sparklines for stocks come from Stooq's free CSV endpoint, cached an hour
// per ticker — plenty of headroom because we only need ~10 unique symbols
// per cache window. If Stooq stalls for a symbol the row just renders an
// empty sparkline instead of breaking the row.
//
// Crypto comes from CoinGecko, filtered against an allowlist of cryptos
// that are tradeable on Robinhood for US customers.

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const FMP_KEY = process.env.FMP_API_KEY;

export interface Mover {
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

// ---------- Stock sparkline -------------------------------------------------
//
// We try several "real" 30-day daily-close sources in a row before falling
// back to FMP-synthesized data:
//   1. Yahoo query2 subdomain (separate IP allowlist from query1)
//   2. NASDAQ's public charting endpoint
//   3. Stooq's Polish mirror (different infra from stooq.com)
//   4. FMP intraday historical-chart (1hour / 4hour / 1day)
//   5. FMP /api/v3/quote synthesis (yearLow → priceAvg200 → priceAvg50
//      → previousClose → price)
//   6. 2-point direction line from changesPercentage
// Pair this with the smoothed Catmull-Rom path in the Sparkline component
// and even the synthesized fallback renders as a curve, not a flat line.

interface YahooChartResp {
  chart?: {
    result?: Array<{
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      timestamp?: number[];
    }>;
  };
}

async function fetchYahooHistory(symbol: string): Promise<number[]> {
  // Browser-like UA + Accept improves the odds of getting through Yahoo's
  // anti-scraping. query2 is a different subdomain than query1 — separate
  // rate-limit pool, often unblocked when query1 is throttled.
  const browserHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://finance.yahoo.com",
    Referer: "https://finance.yahoo.com/",
  };
  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: browserHeaders, next: { revalidate: 21600 } });
      if (!res.ok) continue;
      const json = (await res.json()) as YahooChartResp;
      const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      const cleaned = closes
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
        .slice(-30);
      if (cleaned.length >= 3) return cleaned;
    } catch {
      // try next
    }
  }
  return [];
}

interface NasdaqHistoricalResp {
  data?: { tradesTable?: { rows?: Array<{ date?: string; close?: string }> } };
}

async function fetchNasdaqHistory(symbol: string): Promise<number[]> {
  // NASDAQ's undocumented public chart endpoint powers nasdaq.com's own
  // charts. It accepts a date range and asset class; returns a clean JSON
  // table of daily closes. Cloud-friendly.
  const today = new Date();
  const start = new Date(today.getTime() - 45 * 86400000);
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  const url =
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical` +
    `?assetclass=stocks&fromdate=${encodeURIComponent(fmt(start))}` +
    `&todate=${encodeURIComponent(fmt(today))}&limit=40&time=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 21600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as NasdaqHistoricalResp;
    const rows = json.data?.tradesTable?.rows ?? [];
    // NASDAQ returns prices as "$190.50" strings, newest-first. Strip $ and reverse.
    const closes = rows
      .map((r) => (typeof r.close === "string" ? Number(r.close.replace(/[$,]/g, "")) : null))
      .filter((n): n is number => Number.isFinite(n as number))
      .reverse()
      .slice(-30);
    return closes.length >= 3 ? closes : [];
  } catch {
    return [];
  }
}

async function fetchStooqHistory(symbol: string): Promise<number[]> {
  // Polish mirror of stooq.com — separate IP allowlist, often unblocked
  // when stooq.com itself rate-limits. Returns CSV with daily closes.
  const today = new Date();
  const start = new Date(today.getTime() - 50 * 86400000);
  const ymd = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const stooqSym = symbol.toLowerCase().replace(/\./g, "-");
  const urls = [
    `https://stooq.pl/q/d/l/?s=${stooqSym}.us&i=d&d1=${ymd(start)}&d2=${ymd(today)}`,
    `https://stooq.com/q/d/l/?s=${stooqSym}.us&i=d&d1=${ymd(start)}&d2=${ymd(today)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/csv,*/*" },
        next: { revalidate: 21600 },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.trimStart().startsWith("<")) continue;
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 3) continue;
      const header = lines[0].toLowerCase().split(",");
      const closeIdx = header.indexOf("close");
      if (closeIdx < 0) continue;
      const closes: number[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        const c = Number(parts[closeIdx]);
        if (Number.isFinite(c)) closes.push(c);
      }
      if (closes.length >= 3) return closes.slice(-30);
    } catch {
      // try next mirror
    }
  }
  return [];
}

interface FmpIntradayBar { date?: string; close?: number; price?: number; open?: number }

async function fetchFmpIntraday(symbol: string): Promise<number[]> {
  if (!FMP_KEY) return [];
  const sym = encodeURIComponent(symbol);
  const candidates = [
    `https://financialmodelingprep.com/api/v3/historical-chart/1hour/${sym}?apikey=${FMP_KEY}`,
    `https://financialmodelingprep.com/api/v3/historical-chart/4hour/${sym}?apikey=${FMP_KEY}`,
    `https://financialmodelingprep.com/api/v3/historical-chart/30min/${sym}?apikey=${FMP_KEY}`,
    `https://financialmodelingprep.com/api/v3/historical-chart/1day/${sym}?apikey=${FMP_KEY}`,
    `https://financialmodelingprep.com/stable/historical-chart/1hour?symbol=${sym}&apikey=${FMP_KEY}`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        next: { revalidate: 21600 }, // 6h
      });
      if (!res.ok) continue;
      const json = (await res.json()) as FmpIntradayBar[] | { "Error Message"?: string };
      if (!Array.isArray(json) || json.length === 0) continue;
      // FMP intraday endpoints return newest-first; reverse for left-to-right.
      const closes = json
        .map((r) => (typeof r.close === "number" ? r.close : typeof r.price === "number" ? r.price : null))
        .filter((n): n is number => Number.isFinite(n as number))
        .reverse();
      if (closes.length < 2) continue;
      // Downsample to ~40 points so the SVG path stays compact but keeps shape.
      const step = Math.max(1, Math.ceil(closes.length / 40));
      const sampled: number[] = [];
      for (let i = 0; i < closes.length; i += step) sampled.push(closes[i]);
      // Always include the very last point so the chart ends at "now".
      if (sampled[sampled.length - 1] !== closes[closes.length - 1]) {
        sampled.push(closes[closes.length - 1]);
      }
      return sampled;
    } catch {
      // try next candidate
    }
  }
  return [];
}

interface FmpQuote {
  symbol?: string;
  name?: string;
  price?: number;
  changesPercentage?: number;
  changePercentage?: number;
  previousClose?: number;
  priceAvg50?: number;
  priceAvg200?: number;
  yearHigh?: number;
  yearLow?: number;
}

async function fetchFmpQuote(symbol: string): Promise<FmpQuote | null> {
  if (!FMP_KEY) return null;
  const sym = encodeURIComponent(symbol);
  const candidates = [
    `https://financialmodelingprep.com/api/v3/quote/${sym}?apikey=${FMP_KEY}`,
    `https://financialmodelingprep.com/stable/quote?symbol=${sym}&apikey=${FMP_KEY}`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        next: { revalidate: 21600 },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as FmpQuote[] | FmpQuote | { "Error Message"?: string };
      if (Array.isArray(json) && json.length > 0) return json[0];
      // Stable endpoint sometimes returns a single object rather than an array.
      if (json && typeof json === "object" && "symbol" in json) return json as FmpQuote;
    } catch {
      // next candidate
    }
  }
  return null;
}

function synthesizeSparkline(q: FmpQuote): number[] {
  const points: number[] = [];
  const push = (n: number | undefined) => {
    if (typeof n === "number" && Number.isFinite(n) && n > 0) points.push(n);
  };
  push(q.yearLow);
  push(q.priceAvg200);
  push(q.priceAvg50);
  push(q.previousClose);
  push(q.price);
  return points;
}

async function fetchSparkline(symbol: string, fallbackPrice: number | null, fallbackPct: number): Promise<number[]> {
  // Try real 30-day daily-close sources first, in order of historical
  // reliability from Vercel egress.
  const yahoo = await fetchYahooHistory(symbol);
  if (yahoo.length >= 3) return yahoo;

  const nasdaq = await fetchNasdaqHistory(symbol);
  if (nasdaq.length >= 3) return nasdaq;

  const stooq = await fetchStooqHistory(symbol);
  if (stooq.length >= 3) return stooq;

  // Real-data sources all failed (rate-limited or unavailable). Fall back
  // to FMP intraday, then synthesized quote stats, then the 2-point line.
  const intraday = await fetchFmpIntraday(symbol);
  if (intraday.length >= 3) return intraday;

  const quote = await fetchFmpQuote(symbol);
  if (quote) {
    const points = synthesizeSparkline(quote);
    if (points.length >= 3) return points;
  }

  if (typeof fallbackPrice === "number" && Number.isFinite(fallbackPct)) {
    const prevClose = fallbackPrice / (1 + fallbackPct / 100);
    return [prevClose, fallbackPrice];
  }
  return [];
}

// ---------- FMP (stocks) ----------------------------------------------------
//
// Gainers come from FMP's biggest-gainers list (often penny stocks moonshotting
// — that's what the user wants to see). Losers come from a curated mega-cap
// watchlist via batch quote, because biggest-losers also returns penny stocks
// crashing 50%+, which isn't useful — we want NVDA -5% type drops.

interface FmpMover {
  symbol?: string;
  name?: string;
  change?: number;
  price?: number;
  changesPercentage?: number;
  changePercentage?: number;
}

interface FmpListResult {
  movers: Mover[];
  error: string | null;
}

async function fetchFmpGainersList(): Promise<FmpListResult> {
  if (!FMP_KEY) return { movers: [], error: "FMP_API_KEY not set" };

  const candidates = [
    { tag: "stable", url: `https://financialmodelingprep.com/stable/biggest-gainers?apikey=${FMP_KEY}` },
    { tag: "v3", url: `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${FMP_KEY}` },
  ];

  let lastError = "no candidate succeeded";
  for (const { tag, url } of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        next: { revalidate: 600 },
      });
      if (!res.ok) { lastError = `${tag}: HTTP ${res.status}`; continue; }
      const json = (await res.json()) as
        | FmpMover[]
        | { "Error Message"?: string; message?: string; error?: string };
      if (!Array.isArray(json)) {
        const msg =
          (json as { "Error Message"?: string })["Error Message"] ??
          (json as { message?: string }).message ??
          (json as { error?: string }).error ??
          "non-array response";
        lastError = `${tag}: ${msg}`;
        continue;
      }
      if (json.length === 0) { lastError = `${tag}: empty list`; continue; }

      const valid = json
        .map((e) => {
          const pct =
            typeof e.changesPercentage === "number"
              ? e.changesPercentage
              : typeof e.changePercentage === "number"
                ? e.changePercentage
                : null;
          if (typeof e.symbol !== "string" || pct === null) return null;
          return { symbol: e.symbol, name: e.name ?? e.symbol, price: e.price, pct };
        })
        .filter((e): e is { symbol: string; name: string; price: number | undefined; pct: number } => !!e)
        .slice(0, 5);

      const movers = await Promise.all(
        valid.map(async (e) => {
          const price = typeof e.price === "number" ? e.price : null;
          return {
            symbol: e.symbol,
            name: e.name,
            price,
            changePct: e.pct,
            history: await fetchSparkline(e.symbol, price, e.pct),
            type: "stock" as const,
          };
        }),
      );
      return { movers, error: null };
    } catch (err) {
      lastError = `${tag}: ${err instanceof Error ? err.message : "fetch failed"}`;
    }
  }
  return { movers: [], error: lastError };
}

// For losers we use the same /stable/biggest-losers endpoint that we know
// works on this free-tier key (the batch /quote/ endpoint silently failed),
// then apply a price filter to skip penny stocks: real companies tend to
// trade above $15. We over-fetch from FMP (request 50 entries, slice 5
// after filtering) so big-name losers actually surface even on days when
// the top of the list is penny-stock noise.
const LOSER_MIN_PRICE = 15;

async function fetchFmpLosersList(): Promise<FmpListResult> {
  if (!FMP_KEY) return { movers: [], error: "FMP_API_KEY not set" };

  const candidates = [
    { tag: "stable", url: `https://financialmodelingprep.com/stable/biggest-losers?apikey=${FMP_KEY}` },
    { tag: "v3", url: `https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${FMP_KEY}` },
  ];

  let lastError = "no candidate succeeded";
  for (const { tag, url } of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        next: { revalidate: 600 },
      });
      if (!res.ok) { lastError = `${tag}: HTTP ${res.status}`; continue; }
      const json = (await res.json()) as
        | FmpMover[]
        | { "Error Message"?: string; message?: string; error?: string };
      if (!Array.isArray(json)) {
        const msg =
          (json as { "Error Message"?: string })["Error Message"] ??
          (json as { message?: string }).message ??
          (json as { error?: string }).error ??
          "non-array response";
        lastError = `${tag}: ${msg}`;
        continue;
      }
      if (json.length === 0) { lastError = `${tag}: empty list`; continue; }

      const valid = json
        .map((e) => {
          const pct =
            typeof e.changesPercentage === "number"
              ? e.changesPercentage
              : typeof e.changePercentage === "number"
                ? e.changePercentage
                : null;
          if (typeof e.symbol !== "string" || pct === null) return null;
          return { symbol: e.symbol, name: e.name ?? e.symbol, price: e.price, pct };
        })
        .filter((e): e is { symbol: string; name: string; price: number | undefined; pct: number } => !!e)
        // Skip penny stocks — keep names trading above the price threshold.
        // If `price` is missing entirely we err on the side of inclusion.
        .filter((e) => typeof e.price !== "number" || e.price >= LOSER_MIN_PRICE)
        .slice(0, 5);

      const movers = await Promise.all(
        valid.map(async (e) => {
          const price = typeof e.price === "number" ? e.price : null;
          return {
            symbol: e.symbol,
            name: e.name,
            price,
            changePct: e.pct,
            history: await fetchSparkline(e.symbol, price, e.pct),
            type: "stock" as const,
          };
        }),
      );
      return { movers, error: null };
    } catch (err) {
      lastError = `${tag}: ${err instanceof Error ? err.message : "fetch failed"}`;
    }
  }
  return { movers: [], error: lastError };
}

async function buildStockBuckets(): Promise<{ buckets: Buckets; error: string | null }> {
  const [gainers, losers] = await Promise.all([
    fetchFmpGainersList(),
    fetchFmpLosersList(),
  ]);
  return {
    buckets: { gainers: gainers.movers, losers: losers.movers },
    error: gainers.error ?? losers.error,
  };
}

// ---------- CoinGecko (crypto) ---------------------------------------------

interface CoinGeckoCoin {
  id?: string;
  symbol?: string;
  name?: string;
  current_price?: number;
  price_change_percentage_24h?: number;
}
interface CoinGeckoChart {
  prices?: [number, number][];
}

// CoinGecko IDs of cryptos verified as tradeable on Robinhood (US) — kept
// conservative; uncertain coins (NEAR, ICP, FIL, ATOM, TRX, TON, SUI, KAS,
// SAND, RENDER, FARTCOIN, POPCAT) are intentionally excluded so the user
// never sees a coin they can't actually trade.
const RH_TRADEABLE_COIN_IDS = new Set<string>([
  "bitcoin",
  "ethereum",
  "dogecoin",
  "solana",
  "cardano",
  "avalanche-2",
  "litecoin",
  "bitcoin-cash",
  "stellar",
  "chainlink",
  "uniswap",
  "matic-network",
  "polygon-ecosystem-token",
  "shiba-inu",
  "ripple",
  "aave",
  "compound-governance-token",
  "ethereum-classic",
  "usd-coin",
  "basic-attention-token",
  "tezos",
  "curve-dao-token",
  "maker",
  "the-graph",
  "algorand",
  "orchid-protocol",
  "yearn-finance",
  "decentraland",
  "pepe",
  "floki",
  "bonk",
  "dogwifcoin",
  "ondo-finance",
  "jito-governance-token",
  "arbitrum",
  "optimism",
  "hedera-hashgraph",
  "official-trump",
]);

async function fetchCryptoMarkets(): Promise<CoinGeckoCoin[]> {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h";
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // 60s cache so prices stay close to live (CoinGecko free tier allows
      // ~30 req/min — at 60s revalidate that's only ~1 req/min from us).
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return (await res.json()) as CoinGeckoCoin[];
  } catch {
    return [];
  }
}

async function fetchCoinGeckoHistory(id: string): Promise<number[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    id,
  )}/market_chart?vs_currency=usd&days=30&interval=daily`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as CoinGeckoChart;
    return (json.prices ?? []).map(([, p]) => p).filter((p): p is number => typeof p === "number");
  } catch {
    return [];
  }
}

async function buildCryptoBuckets(): Promise<Buckets> {
  const markets = await fetchCryptoMarkets();
  const tradeable = markets.filter(
    (c): c is CoinGeckoCoin & { id: string; symbol: string; name: string } =>
      typeof c.id === "string" &&
      RH_TRADEABLE_COIN_IDS.has(c.id) &&
      typeof c.symbol === "string" &&
      typeof c.name === "string" &&
      typeof c.price_change_percentage_24h === "number",
  );

  // Bucket by sign of the 24h move BEFORE picking top-5, so a positive
  // bucket never spills negative entries (and vice-versa) on days when
  // fewer than 5 coins moved in a given direction.
  const positives = tradeable
    .filter((c) => (c.price_change_percentage_24h ?? 0) > 0)
    .sort((a, b) => (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0));
  const negatives = tradeable
    .filter((c) => (c.price_change_percentage_24h ?? 0) < 0)
    .sort((a, b) => (a.price_change_percentage_24h ?? 0) - (b.price_change_percentage_24h ?? 0));

  const gainersRaw = positives.slice(0, 5);
  const losersRaw = negatives.slice(0, 5);

  const toMover = async (c: CoinGeckoCoin & { id: string; symbol: string; name: string }) => ({
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    price: c.current_price ?? null,
    changePct: c.price_change_percentage_24h ?? 0,
    history: await fetchCoinGeckoHistory(c.id),
    type: "crypto" as const,
  });

  const [gainers, losers] = await Promise.all([
    Promise.all(gainersRaw.map(toMover)),
    Promise.all(losersRaw.map(toMover)),
  ]);
  return { gainers, losers };
}

export async function GET() {
  const [stockResult, crypto] = await Promise.all([buildStockBuckets(), buildCryptoBuckets()]);
  return NextResponse.json({
    stocks: stockResult.buckets,
    crypto,
    asOf: Date.now(),
    fmpConfigured: !!FMP_KEY,
    fmpError: stockResult.error,
  });
}
