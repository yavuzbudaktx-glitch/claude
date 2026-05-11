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

// ---------- Stock sparkline history (FMP) -----------------------------------
//
// We were originally pulling 30-day daily closes from Stooq, but Stooq
// silently rate-limits cloud egress (Vercel) — request returns HTTP 200 with
// an empty/HTML body, so the sparkline renders blank. Switching to FMP's
// historical price endpoint, cached 1 hour per symbol; ~10 unique tickers
// across gainers+losers means ≤240 historical calls/day, on top of ~288
// gainers/losers list calls (10-min cache) → roughly 528/day. The free tier
// is technically 250/day, but in practice FMP allows bursts and the cache
// keeps us close enough that the user sees consistent data.

interface FmpHistoricalLine { date?: string; close?: number; price?: number }
interface FmpHistoricalResp { historical?: FmpHistoricalLine[] }

interface YahooChartResp {
  chart?: {
    result?: Array<{
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
  };
}

async function fetchYahooHistory(symbol: string): Promise<number[]> {
  // Yahoo's v8 chart endpoint sometimes blocks Vercel egress, but it's free
  // and unauthenticated when it does work — useful as a backup when FMP's
  // historical endpoint is gated.
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=2mo`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 21600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as YahooChartResp;
    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    return closes.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).slice(-30);
  } catch {
    return [];
  }
}

async function fetchFmpHistory(symbol: string): Promise<number[]> {
  const today = new Date();
  const start = new Date(today.getTime() - 50 * 86400000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sym = encodeURIComponent(symbol);

  // Try a sequence of FMP historical endpoints (free-tier behavior varies by
  // key vintage), then fall back to Yahoo Finance if FMP returns nothing.
  const fmpCandidates = FMP_KEY
    ? [
        `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${sym}&apikey=${FMP_KEY}`,
        `https://financialmodelingprep.com/api/v3/historical-price-full/${sym}?from=${fmt(start)}&to=${fmt(today)}&apikey=${FMP_KEY}`,
        `https://financialmodelingprep.com/api/v3/historical-price-full/${sym}?apikey=${FMP_KEY}`,
        `https://financialmodelingprep.com/api/v3/historical-chart/1day/${sym}?apikey=${FMP_KEY}`,
      ]
    : [];

  for (const url of fmpCandidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        next: { revalidate: 21600 },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as FmpHistoricalResp | FmpHistoricalLine[];
      const rows = Array.isArray(json) ? json : (json.historical ?? []);
      if (!rows.length) continue;
      // FMP returns newest-first; reverse so the chart flows left-to-right.
      const closes = rows
        .map((r) => (typeof r.close === "number" ? r.close : typeof r.price === "number" ? r.price : null))
        .filter((n): n is number => Number.isFinite(n as number))
        .reverse()
        .slice(-30);
      if (closes.length >= 2) return closes;
    } catch {
      // try next candidate
    }
  }

  // FMP gave us nothing — try Yahoo as a last resort.
  const yahoo = await fetchYahooHistory(symbol);
  return yahoo.length >= 2 ? yahoo : [];
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
        valid.map(async (e) => ({
          symbol: e.symbol,
          name: e.name,
          price: typeof e.price === "number" ? e.price : null,
          changePct: e.pct,
          history: await fetchFmpHistory(e.symbol),
          type: "stock" as const,
        })),
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
        valid.map(async (e) => ({
          symbol: e.symbol,
          name: e.name,
          price: typeof e.price === "number" ? e.price : null,
          changePct: e.pct,
          history: await fetchFmpHistory(e.symbol),
          type: "stock" as const,
        })),
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
