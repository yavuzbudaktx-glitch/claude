import { NextResponse } from "next/server";

// Top movers feed used by MoversCard.
//
// Stocks: Yahoo Finance now gates its convenient batch / screener endpoints
//   behind a crumb cookie that doesn't survive serverless cold-starts, so we
//   read prices straight from Stooq's free CSV API instead. For each ticker
//   in a curated 80-name universe we pull a 35-day daily-close window in one
//   small CSV, compute today's % from the last two closes, sort by absolute
//   move, and take the top 5. The same 30 closes are reused as the sparkline
//   data so we don't need a second round of HTTP calls.
//
// Crypto: CoinGecko top-by-mcap markets list, filtered against an allowlist
//   of Robinhood-tradeable coin IDs, sorted by |24h%|, top 5 with their
//   30-day market_chart series.
//
// User explicitly said hourly refresh is acceptable for this card, so the
// route is cached for an hour at the upstream layer.

export const revalidate = 3600;

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

// Hand-curated universe: large-cap tech, megacaps, money-center banks,
// energy, biotech, semis, EVs, and a slice of high-beta / momentum names so
// the "top movers" list reliably has something interesting on most days.
const STOCK_UNIVERSE: { symbol: string; name: string; stooq?: string }[] = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "AVGO", name: "Broadcom" },
  { symbol: "JPM", name: "JPMorgan Chase" },
  { symbol: "V", name: "Visa" },
  { symbol: "MA", name: "Mastercard" },
  { symbol: "UNH", name: "UnitedHealth" },
  { symbol: "XOM", name: "ExxonMobil" },
  { symbol: "CVX", name: "Chevron" },
  { symbol: "COST", name: "Costco" },
  { symbol: "WMT", name: "Walmart" },
  { symbol: "HD", name: "Home Depot" },
  { symbol: "PG", name: "Procter & Gamble" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "ABBV", name: "AbbVie" },
  { symbol: "LLY", name: "Eli Lilly" },
  { symbol: "PFE", name: "Pfizer" },
  { symbol: "MRK", name: "Merck" },
  { symbol: "BAC", name: "Bank of America" },
  { symbol: "WFC", name: "Wells Fargo" },
  { symbol: "GS", name: "Goldman Sachs" },
  { symbol: "MS", name: "Morgan Stanley" },
  { symbol: "C", name: "Citigroup" },
  { symbol: "DIS", name: "Disney" },
  { symbol: "NFLX", name: "Netflix" },
  { symbol: "CMCSA", name: "Comcast" },
  { symbol: "T", name: "AT&T" },
  { symbol: "VZ", name: "Verizon" },
  { symbol: "INTC", name: "Intel" },
  { symbol: "AMD", name: "AMD" },
  { symbol: "QCOM", name: "Qualcomm" },
  { symbol: "MU", name: "Micron" },
  { symbol: "TXN", name: "Texas Instruments" },
  { symbol: "ORCL", name: "Oracle" },
  { symbol: "CRM", name: "Salesforce" },
  { symbol: "ADBE", name: "Adobe" },
  { symbol: "PYPL", name: "PayPal" },
  { symbol: "SQ", name: "Block" },
  { symbol: "SHOP", name: "Shopify" },
  { symbol: "UBER", name: "Uber" },
  { symbol: "LYFT", name: "Lyft" },
  { symbol: "ABNB", name: "Airbnb" },
  { symbol: "BA", name: "Boeing" },
  { symbol: "GE", name: "GE Aerospace" },
  { symbol: "F", name: "Ford" },
  { symbol: "GM", name: "General Motors" },
  { symbol: "RIVN", name: "Rivian" },
  { symbol: "LCID", name: "Lucid" },
  { symbol: "NIO", name: "NIO" },
  { symbol: "BABA", name: "Alibaba" },
  { symbol: "PDD", name: "PDD Holdings" },
  { symbol: "JD", name: "JD.com" },
  { symbol: "TSM", name: "TSMC" },
  { symbol: "ASML", name: "ASML" },
  { symbol: "ARM", name: "Arm Holdings" },
  { symbol: "PLTR", name: "Palantir" },
  { symbol: "SNOW", name: "Snowflake" },
  { symbol: "CRWD", name: "CrowdStrike" },
  { symbol: "ZS", name: "Zscaler" },
  { symbol: "NET", name: "Cloudflare" },
  { symbol: "DDOG", name: "Datadog" },
  { symbol: "MDB", name: "MongoDB" },
  { symbol: "COIN", name: "Coinbase" },
  { symbol: "MARA", name: "MARA Holdings" },
  { symbol: "RIOT", name: "Riot Platforms" },
  { symbol: "MSTR", name: "MicroStrategy" },
  { symbol: "GME", name: "GameStop" },
  { symbol: "AMC", name: "AMC Entertainment" },
  { symbol: "SOFI", name: "SoFi" },
  { symbol: "HOOD", name: "Robinhood" },
  { symbol: "ROKU", name: "Roku" },
  { symbol: "PINS", name: "Pinterest" },
  { symbol: "SNAP", name: "Snap" },
  { symbol: "MRNA", name: "Moderna" },
  { symbol: "BNTX", name: "BioNTech" },
  { symbol: "NKE", name: "Nike" },
  { symbol: "SBUX", name: "Starbucks" },
  { symbol: "MCD", name: "McDonald's" },
  { symbol: "KO", name: "Coca-Cola" },
  { symbol: "PEP", name: "PepsiCo" },
];

interface StockSnapshot {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  history: number[];
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }

// Stooq returns daily candles as a CSV. Columns are typically:
//   Date,Open,High,Low,Close,Volume
// Sorted ascending; the most recent close is the last row.
function parseStooqCsv(text: string): { date: string; close: number }[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",");
  const dateIdx = header.indexOf("date");
  const closeIdx = header.indexOf("close");
  if (dateIdx < 0 || closeIdx < 0) return [];
  const out: { date: string; close: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length <= Math.max(dateIdx, closeIdx)) continue;
    const close = Number(parts[closeIdx]);
    const date = parts[dateIdx];
    if (!Number.isFinite(close) || !date) continue;
    out.push({ date, close });
  }
  return out;
}

async function fetchStockSnapshot(
  symbol: string,
  name: string,
): Promise<StockSnapshot | null> {
  const today = new Date();
  const start = new Date(today.getTime() - 50 * 86400000);
  const stooqSym = symbol.toLowerCase().replace(/\./g, "-");
  const url = `https://stooq.com/q/d/l/?s=${stooqSym}.us&i=d&d1=${ymd(start)}&d2=${ymd(today)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/csv,*/*" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || /^no data/i.test(text)) return null;
    const rows = parseStooqCsv(text);
    if (rows.length < 2) return null;
    const recent = rows.slice(-30);
    const history = recent.map((r) => r.close);
    const last = rows[rows.length - 1].close;
    const prev = rows[rows.length - 2].close;
    if (prev === 0) return null;
    const changePct = ((last - prev) / prev) * 100;
    if (!Number.isFinite(changePct)) return null;
    return { symbol, name, price: last, changePct, history };
  } catch {
    return null;
  }
}

async function buildStockMovers(): Promise<Mover[]> {
  // 80 small CSV requests, parallel. Stooq is generous with concurrency.
  const snapshots = await Promise.all(
    STOCK_UNIVERSE.map(({ symbol, name }) => fetchStockSnapshot(symbol, name)),
  );
  const valid = snapshots.filter((s): s is StockSnapshot => s !== null);
  valid.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  return valid.slice(0, 5).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    price: s.price,
    changePct: s.changePct,
    history: s.history,
    type: "stock" as const,
  }));
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
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h";
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
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
