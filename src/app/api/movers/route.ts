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
// FMP's intraday "historical-chart/{interval}" endpoints ARE available on
// the free tier (unlike the daily-resolution historical-price-full path,
// which the user's key returns Premium for). Hourly bars over ~30 days
// gives us 150+ real data points per ticker — a proper-looking chart.
// We try a sequence of intervals and pick the first that returns data.
//
// If every intraday candidate fails, fall back to synthesizing a sparkline
// from /api/v3/quote/{symbol}'s summary stats (yearLow / priceAvg200 /
// priceAvg50 / previousClose / price) so the row at least conveys
// trajectory. Worst case (quote also fails) we draw a two-point direction
// indicator.

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
  // Best case: real intraday history from FMP.
  const intraday = await fetchFmpIntraday(symbol);
  if (intraday.length >= 3) return intraday;

  // Mid-case: synthesize a multi-point trajectory from quote summary stats.
  const quote = await fetchFmpQuote(symbol);
  if (quote) {
    const points = synthesizeSparkline(quote);
    if (points.length >= 3) return points;
  }

  // Last resort: draw a two-point direction line from the percent change.
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

  // Sort by signed % so the top of the list is the biggest gainer and the
  // bottom is the biggest loser.
  const sorted = [...tradeable].sort(
    (a, b) =>
      (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0),
  );

  const gainersRaw = sorted.slice(0, 5);
  const losersRaw = sorted.slice(-5).reverse();

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
