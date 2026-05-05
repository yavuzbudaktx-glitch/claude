import { NextResponse } from "next/server";

export const revalidate = 60;

interface YahooChartMeta {
  symbol?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  currency?: string;
  exchangeName?: string;
}
interface YahooChartResp {
  chart?: {
    result?: { meta?: YahooChartMeta }[];
    error?: { description?: string };
  };
}

export interface PortfolioQuote {
  symbol: string;
  name: string | null;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  currency: string | null;
}

async function fetchOne(symbol: string): Promise<PortfolioQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`yahoo ${res.status}`);
    const json = (await res.json()) as YahooChartResp;
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta) throw new Error("no meta");
    const price = meta.regularMarketPrice ?? null;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const change = price != null && prev != null ? price - prev : null;
    const changePct = price != null && prev != null && prev !== 0
      ? ((price - prev) / prev) * 100
      : null;
    return {
      symbol: meta.symbol ?? symbol.toUpperCase(),
      name: meta.longName ?? meta.shortName ?? null,
      price,
      previousClose: prev,
      change,
      changePct,
      currency: meta.currency ?? null,
    };
  } catch {
    return {
      symbol: symbol.toUpperCase(),
      name: null,
      price: null,
      previousClose: null,
      change: null,
      changePct: null,
      currency: null,
    };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const param = url.searchParams.get("symbols") ?? "";
  const symbols = param
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 30);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  const quotes = await Promise.all(symbols.map((s) => fetchOne(s)));
  return NextResponse.json({ quotes });
}
