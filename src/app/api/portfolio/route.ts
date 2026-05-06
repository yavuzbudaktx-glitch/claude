import { NextResponse } from "next/server";

export const revalidate = 10;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

interface YahooChartMeta {
  symbol?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  currency?: string;
  exchangeName?: string;
  regularMarketTime?: number;
}
interface YahooQuoteIndicator { close?: (number | null)[] }
interface YahooAdjCloseIndicator { adjclose?: (number | null)[] }
interface YahooChartResp {
  chart?: {
    result?: {
      meta?: YahooChartMeta;
      timestamp?: number[];
      indicators?: { quote?: YahooQuoteIndicator[]; adjclose?: YahooAdjCloseIndicator[] };
    }[];
    error?: { description?: string };
  };
}

interface YahooV7Quote {
  symbol?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: number;
  regularMarketPreviousClose?: number;
  currency?: string;
}
interface YahooV7Resp {
  quoteResponse?: { result?: YahooV7Quote[]; error?: unknown };
}

export interface PortfolioQuote {
  symbol: string;
  name: string | null;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  currency: string | null;
  asOf: number | null;
  history: number[];
  source: "yahoo-v7" | "yahoo-v8" | "stooq" | "none";
}

async function fetchV7Batch(symbols: string[]): Promise<Map<string, YahooV7Quote>> {
  const out = new Map<string, YahooV7Quote>();
  if (symbols.length === 0) return out;
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols
    .map(encodeURIComponent)
    .join(",")}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 10 },
    });
    if (!res.ok) return out;
    const json = (await res.json()) as YahooV7Resp;
    for (const q of json.quoteResponse?.result ?? []) {
      if (q.symbol) out.set(q.symbol.toUpperCase(), q);
    }
  } catch {}
  return out;
}

async function fetchV8Chart(symbol: string): Promise<{
  meta?: YahooChartMeta;
  history: number[];
} | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=1mo`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 10 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooChartResp;
    const result = json.chart?.result?.[0];
    if (!result?.meta) return null;
    const adj = result.indicators?.adjclose?.[0]?.adjclose ?? [];
    const close = result.indicators?.quote?.[0]?.close ?? [];
    const series = (adj.length ? adj : close).filter(
      (n): n is number => typeof n === "number" && Number.isFinite(n),
    );
    return { meta: result.meta, history: series };
  } catch {
    return null;
  }
}

async function fetchStooq(symbol: string): Promise<{ price: number; prev: number | null } | null> {
  // Stooq uses lowercase + .us suffix for US stocks. Skip crypto/forex/index.
  if (/[-^=]/.test(symbol)) return null;
  const stooqSym = symbol.toLowerCase() + ".us";
  const url = `https://stooq.com/q/l/?s=${stooqSym}&i=d&f=sd2t2ohlcv&h&e=csv`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/csv, text/plain" },
      next: { revalidate: 10 },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const cols = lines[1].split(",");
    // Symbol,Date,Time,Open,High,Low,Close,Volume
    const close = Number(cols[6]);
    const open = Number(cols[3]);
    if (!Number.isFinite(close)) return null;
    return { price: close, prev: Number.isFinite(open) ? open : null };
  } catch {
    return null;
  }
}

async function buildQuote(
  symbol: string,
  v7: YahooV7Quote | undefined,
): Promise<PortfolioQuote> {
  const sym = symbol.toUpperCase();

  // History always comes from v8 chart (Yahoo); cache it the same as price.
  const chart = await fetchV8Chart(symbol);
  const history = chart?.history ?? [];

  // Price priority: Yahoo v7 (real-time) → Yahoo v8 chart meta → Stooq close.
  let price: number | null = null;
  let prev: number | null = null;
  let change: number | null = null;
  let changePct: number | null = null;
  let name: string | null = null;
  let currency: string | null = null;
  let asOf: number | null = null;
  let source: PortfolioQuote["source"] = "none";

  if (v7 && typeof v7.regularMarketPrice === "number") {
    price = v7.regularMarketPrice;
    prev = v7.regularMarketPreviousClose ?? null;
    change = v7.regularMarketChange ?? null;
    changePct = v7.regularMarketChangePercent ?? null;
    name = v7.longName ?? v7.shortName ?? null;
    currency = v7.currency ?? null;
    asOf = v7.regularMarketTime ? v7.regularMarketTime * 1000 : null;
    source = "yahoo-v7";
  } else if (chart?.meta && typeof chart.meta.regularMarketPrice === "number") {
    price = chart.meta.regularMarketPrice;
    prev = chart.meta.previousClose ?? chart.meta.chartPreviousClose ?? null;
    change = price != null && prev != null ? price - prev : null;
    changePct = price != null && prev != null && prev !== 0 ? ((price - prev) / prev) * 100 : null;
    name = chart.meta.longName ?? chart.meta.shortName ?? null;
    currency = chart.meta.currency ?? null;
    asOf = chart.meta.regularMarketTime ? chart.meta.regularMarketTime * 1000 : null;
    source = "yahoo-v8";
  }

  if (price == null) {
    const stooq = await fetchStooq(symbol);
    if (stooq) {
      price = stooq.price;
      prev = stooq.prev;
      change = price != null && prev != null ? price - prev : null;
      changePct = price != null && prev != null && prev !== 0 ? ((price - prev) / prev) * 100 : null;
      asOf = Date.now();
      source = "stooq";
    }
  }

  return {
    symbol: sym,
    name,
    price,
    previousClose: prev,
    change,
    changePct,
    currency,
    asOf,
    history,
    source,
  };
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
    return NextResponse.json({ quotes: [], asOf: Date.now() });
  }

  const v7Map = await fetchV7Batch(symbols);
  const quotes = await Promise.all(
    symbols.map((s) => buildQuote(s, v7Map.get(s))),
  );

  return NextResponse.json({ quotes, asOf: Date.now() });
}
