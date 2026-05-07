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

// ---------- Stooq helpers (sparklines for stocks) ---------------------------

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }

function parseStooqCsv(text: string): number[] {
  // If Stooq rate-limits us it returns an HTML error page; bail before we
  // try to interpret <html>... as a CSV header.
  if (!text || text.trimStart().startsWith("<")) return [];
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",");
  const closeIdx = header.indexOf("close");
  if (closeIdx < 0) return [];
  const out: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const close = Number(parts[closeIdx]);
    if (Number.isFinite(close)) out.push(close);
  }
  return out;
}

async function fetchStooqHistory(symbol: string): Promise<number[]> {
  const today = new Date();
  const start = new Date(today.getTime() - 50 * 86400000);
  const stooqSym = symbol.toLowerCase().replace(/\./g, "-");
  const url = `https://stooq.com/q/d/l/?s=${stooqSym}.us&i=d&d1=${ymd(start)}&d2=${ymd(today)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/csv,*/*" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const text = await res.text();
    const closes = parseStooqCsv(text);
    return closes.slice(-30);
  } catch {
    return [];
  }
}

// ---------- FMP (stocks) ----------------------------------------------------

interface FmpMover {
  symbol?: string;
  name?: string;
  change?: number;
  price?: number;
  changesPercentage?: number;
  // The "stable" API uses changePercentage instead of changesPercentage.
  changePercentage?: number;
}

interface FmpFetchResult {
  movers: Mover[];
  error: string | null;
}

// FMP migrated their endpoints to a new "/stable/biggest-{gainers,losers}"
// path; the legacy "/api/v3/stock_market/{gainers,losers}" path now returns
// a "Premium endpoint" error for newer free-tier keys. Try stable first,
// fall back to v3 for older accounts.
async function fetchFmpList(kind: "gainers" | "losers"): Promise<FmpFetchResult> {
  if (!FMP_KEY) return { movers: [], error: "FMP_API_KEY not set" };

  const candidates = [
    { tag: "stable", url: `https://financialmodelingprep.com/stable/biggest-${kind}?apikey=${FMP_KEY}` },
    { tag: "v3", url: `https://financialmodelingprep.com/api/v3/stock_market/${kind}?apikey=${FMP_KEY}` },
  ];

  let lastError = "no candidate succeeded";
  for (const { tag, url } of candidates) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        next: { revalidate: 600 },
      });
      if (!res.ok) {
        lastError = `${tag}: HTTP ${res.status}`;
        continue;
      }
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
      if (json.length === 0) {
        lastError = `${tag}: empty list`;
        continue;
      }

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

      const withHistory = await Promise.all(
        valid.map(async (e) => ({
          symbol: e.symbol,
          name: e.name,
          price: typeof e.price === "number" ? e.price : null,
          changePct: e.pct,
          history: await fetchStooqHistory(e.symbol),
          type: "stock" as const,
        })),
      );
      return { movers: withHistory, error: null };
    } catch (err) {
      lastError = `${tag}: ${err instanceof Error ? err.message : "fetch failed"}`;
    }
  }
  return { movers: [], error: lastError };
}

async function buildStockBuckets(): Promise<{ buckets: Buckets; error: string | null }> {
  const [gainers, losers] = await Promise.all([
    fetchFmpList("gainers"),
    fetchFmpList("losers"),
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
      next: { revalidate: 600 },
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
