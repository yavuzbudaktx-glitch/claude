import { NextResponse } from "next/server";

// Top movers feed used by MoversCard:
//   - 5 most-moving US stocks (by absolute 24h %), pulled from Yahoo's
//     day_gainers + day_losers screeners and ranked together so the list
//     mixes upside and downside.
//   - 5 most-moving Robinhood-tradeable cryptos (by absolute 24h %), pulled
//     from CoinGecko's top-100 list and filtered against a hand-maintained
//     allowlist of RH-supported coin IDs.
// For every chosen symbol we also return a 30-day daily close series so the
// card can render a 1-month sparkline next to the % move.

export const revalidate = 300;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface Mover {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number;
  history: number[];
  type: "stock" | "crypto";
}

interface YahooQuote {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
}
interface YahooScreenerResp {
  finance?: { result?: { quotes?: YahooQuote[] }[] };
}
interface YahooChartResp {
  chart?: {
    result?: {
      indicators?: {
        quote?: { close?: (number | null)[] }[];
        adjclose?: { adjclose?: (number | null)[] }[];
      };
    }[];
  };
}

async function fetchYahooScreener(scrId: string, count = 25): Promise<Mover[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=${count}&scrIds=${scrId}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as YahooScreenerResp;
    const quotes = json.finance?.result?.[0]?.quotes ?? [];
    return quotes
      .filter(
        (q): q is Required<Pick<YahooQuote, "symbol" | "regularMarketChangePercent">> & YahooQuote =>
          typeof q.symbol === "string" && typeof q.regularMarketChangePercent === "number",
      )
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        price: q.regularMarketPrice ?? null,
        changePct: q.regularMarketChangePercent,
        history: [],
        type: "stock" as const,
      }));
  } catch {
    return [];
  }
}

async function fetchYahooHistory(symbol: string): Promise<number[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=1mo`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as YahooChartResp;
    const result = json.chart?.result?.[0];
    const adj = result?.indicators?.adjclose?.[0]?.adjclose;
    const close = result?.indicators?.quote?.[0]?.close;
    const series = adj && adj.some((v) => typeof v === "number") ? adj : close;
    return (series ?? []).filter((v): v is number => typeof v === "number");
  } catch {
    return [];
  }
}

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

// CoinGecko IDs of cryptos currently tradeable on Robinhood (US).
// Sourced from Robinhood's published "currencies you can trade" list.
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
  "render-token",
  "arbitrum",
  "optimism",
  "near",
  "internet-computer",
  "filecoin",
  "cosmos",
  "hedera-hashgraph",
  "crypto-com-chain",
  "the-sandbox",
  "tron",
  "toncoin",
  "sui",
  "official-trump",
  "kaspa",
  "fartcoin",
  "popcat",
]);

async function fetchCryptoMarkets(): Promise<CoinGeckoCoin[]> {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false&price_change_percentage=24h";
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
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
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as CoinGeckoChart;
    return (json.prices ?? []).map(([, p]) => p).filter((p): p is number => typeof p === "number");
  } catch {
    return [];
  }
}

async function buildStockMovers(): Promise<Mover[]> {
  const [gainers, losers] = await Promise.all([
    fetchYahooScreener("day_gainers", 25),
    fetchYahooScreener("day_losers", 25),
  ]);
  const seen = new Set<string>();
  const pool = [...gainers, ...losers].filter((m) => {
    if (seen.has(m.symbol)) return false;
    seen.add(m.symbol);
    return true;
  });
  pool.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const top = pool.slice(0, 5);
  const withHistory = await Promise.all(
    top.map(async (m) => ({ ...m, history: await fetchYahooHistory(m.symbol) })),
  );
  return withHistory;
}

async function buildCryptoMovers(): Promise<Mover[]> {
  const markets = await fetchCryptoMarkets();
  const tradeable = markets.filter(
    (c): c is CoinGeckoCoin & { id: string; symbol: string; name: string } =>
      typeof c.id === "string" &&
      RH_TRADEABLE_COIN_IDS.has(c.id) &&
      typeof c.symbol === "string" &&
      typeof c.name === "string" &&
      typeof c.price_change_percentage_24h === "number",
  );
  tradeable.sort(
    (a, b) =>
      Math.abs(b.price_change_percentage_24h ?? 0) -
      Math.abs(a.price_change_percentage_24h ?? 0),
  );
  const top = tradeable.slice(0, 5);
  const withHistory = await Promise.all(
    top.map(async (c) => ({
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price: c.current_price ?? null,
      changePct: c.price_change_percentage_24h ?? 0,
      history: await fetchCoinGeckoHistory(c.id),
      type: "crypto" as const,
    })),
  );
  return withHistory;
}

export async function GET() {
  const [stocks, crypto] = await Promise.all([buildStockMovers(), buildCryptoMovers()]);
  return NextResponse.json({ stocks, crypto, asOf: Date.now() });
}
