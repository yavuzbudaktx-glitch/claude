import { NextResponse } from "next/server";

export const revalidate = 60;

export interface Mover {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number;
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

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchYahooScreener(scrId: string, count = 15): Promise<Mover[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=${count}&scrIds=${scrId}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as YahooScreenerResp;
    const quotes = json.finance?.result?.[0]?.quotes ?? [];
    return quotes
      .filter((q) => q.symbol && typeof q.regularMarketChangePercent === "number")
      .map((q) => ({
        symbol: q.symbol!,
        name: q.shortName || q.longName || q.symbol!,
        price: q.regularMarketPrice ?? null,
        changePct: q.regularMarketChangePercent!,
        type: "stock" as const,
      }));
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

async function fetchCryptoMovers(): Promise<Mover[]> {
  // Pull top 100 by market cap, then sort by 24h % change locally.
  const url =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h";
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as CoinGeckoCoin[];
    return data
      .filter((c): c is CoinGeckoCoin & { symbol: string; name: string } =>
        typeof c.symbol === "string" && typeof c.name === "string" &&
        typeof c.price_change_percentage_24h === "number")
      .map((c) => ({
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        price: c.current_price ?? null,
        changePct: c.price_change_percentage_24h!,
        type: "crypto" as const,
      }));
  } catch {
    return [];
  }
}

export async function GET() {
  const [stockGainers, stockLosers, crypto] = await Promise.all([
    fetchYahooScreener("day_gainers", 15),
    fetchYahooScreener("day_losers", 15),
    fetchCryptoMovers(),
  ]);

  // Pool: all stocks + all crypto. Dedupe by type:symbol. Sort by abs change.
  const seen = new Set<string>();
  const pool = [...stockGainers, ...stockLosers, ...crypto].filter((m) => {
    const k = `${m.type}:${m.symbol}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  pool.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  return NextResponse.json({ movers: pool.slice(0, 10) });
}
