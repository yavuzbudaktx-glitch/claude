"use client";

import useSWR from "swr";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/components/Card";
import { Sparkline, ValueChart } from "@/components/Sparkline";
import { MoversStrip } from "./MoversStrip";
import { createClient } from "@/lib/supabase/client";

interface Holding {
  symbol: string;
  shares: number;
  cost_basis: number | null;
}

interface Snapshot {
  date: string;
  value: number;
}

interface Quote {
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

interface PortfolioResp {
  quotes: Quote[];
  asOf: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<PortfolioResp>);

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function fmt(n: number | null, opts: Intl.NumberFormatOptions = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2, ...opts });
}

function fmtTime(ms: number | null | undefined) {
  if (!ms) return null;
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function PortfolioCard({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sym, setSym] = useState("");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");

  const loadAll = useCallback(async () => {
    const [hRes, sRes] = await Promise.all([
      supabase.from("portfolio_holdings").select("symbol, shares, cost_basis").order("symbol"),
      supabase
        .from("portfolio_snapshots")
        .select("date, value")
        .order("date", { ascending: true })
        .limit(120),
    ]);
    setHoldings((hRes.data ?? []) as Holding[]);
    setSnapshots(((sRes.data ?? []) as { date: string; value: number }[]).map((s) => ({
      date: s.date,
      value: Number(s.value),
    })));
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("portfolio_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "portfolio_holdings", filter: `user_id=eq.${userId}` },
        () => loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "portfolio_snapshots", filter: `user_id=eq.${userId}` },
        () => loadAll(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, userId, loadAll]);

  const symbolsParam = useMemo(() => holdings.map((h) => h.symbol).join(","), [holdings]);
  const { data, isLoading } = useSWR<PortfolioResp>(
    loaded && symbolsParam ? `/api/portfolio?symbols=${symbolsParam}` : null,
    fetcher,
    {
      refreshInterval: 10_000,
      keepPreviousData: true,
      errorRetryCount: 4,
      errorRetryInterval: 5_000,
      revalidateOnFocus: true,
    },
  );

  const rows = useMemo(() => {
    const map = new Map((data?.quotes ?? []).map((q) => [q.symbol, q] as const));
    return holdings.map((h) => {
      const q = map.get(h.symbol);
      const price = q?.price ?? null;
      const prevClose = q?.previousClose ?? null;
      const value = price != null ? price * h.shares : null;
      const dayPL = price != null && prevClose != null ? (price - prevClose) * h.shares : null;
      const totalPL = price != null && h.cost_basis != null ? (price - h.cost_basis) * h.shares : null;
      return { holding: h, quote: q, value, dayPL, totalPL };
    });
  }, [holdings, data]);

  const totals = useMemo(() => {
    let value = 0, dayPL = 0, hasValue = false, hasDay = false;
    for (const r of rows) {
      if (r.value != null) { value += r.value; hasValue = true; }
      if (r.dayPL != null) { dayPL += r.dayPL; hasDay = true; }
    }
    return {
      value: hasValue ? value : null,
      dayPL: hasDay ? dayPL : null,
      dayPct: hasValue && hasDay && value - dayPL !== 0 ? (dayPL / (value - dayPL)) * 100 : null,
    };
  }, [rows]);

  const latestAsOf = useMemo(() => {
    const times = (data?.quotes ?? [])
      .map((q) => q.asOf)
      .filter((t): t is number => typeof t === "number" && t > 0);
    return times.length ? Math.max(...times) : null;
  }, [data]);

  // Persist a daily snapshot once per day. Server-side store, syncs everywhere.
  useEffect(() => {
    if (!loaded || totals.value == null) return;
    const today = todayKey();
    const last = snapshots[snapshots.length - 1];
    if (last && last.date === today) return;
    (async () => {
      const { error } = await supabase
        .from("portfolio_snapshots")
        .upsert(
          { user_id: userId, date: today, value: totals.value },
          { onConflict: "user_id,date" },
        );
      if (!error) {
        setSnapshots((prev) => {
          const filtered = prev.filter((s) => s.date !== today);
          return [...filtered, { date: today, value: totals.value as number }];
        });
      }
    })();
  }, [loaded, totals.value, snapshots, supabase, userId]);

  async function addHolding(e: React.FormEvent) {
    e.preventDefault();
    const symbol = sym.trim().toUpperCase();
    const sh = Number(shares);
    if (!symbol || !Number.isFinite(sh) || sh <= 0) return;
    const cb = cost ? Number(cost) : null;

    // Optimistic update
    setHoldings((prev) => {
      const without = prev.filter((h) => h.symbol !== symbol);
      return [...without, { symbol, shares: sh, cost_basis: cb }].sort((a, b) =>
        a.symbol.localeCompare(b.symbol),
      );
    });
    setSym(""); setShares(""); setCost(""); setAdding(false);

    await supabase
      .from("portfolio_holdings")
      .upsert(
        { user_id: userId, symbol, shares: sh, cost_basis: cb },
        { onConflict: "user_id,symbol" },
      );
  }

  async function remove(symbol: string) {
    setHoldings((prev) => prev.filter((h) => h.symbol !== symbol));
    await supabase
      .from("portfolio_holdings")
      .delete()
      .eq("user_id", userId)
      .eq("symbol", symbol);
  }

  return (
    <Card
      num="05"
      title="Portfolio"
      action={
        <>
          {latestAsOf && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              as of {fmtTime(latestAsOf)}
            </span>
          )}
          <button
            onClick={() => setAdding((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-accent inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> add
          </button>
        </>
      }
    >
      {loaded && holdings.length === 0 && !adding && (
        <p className="text-muted text-sm italic">
          No holdings yet. Click <span className="font-mono">add</span> to enter your tickers and shares.
          Synced across all your devices.
        </p>
      )}

      {adding && (
        <form onSubmit={addHolding} className="flex flex-wrap items-end gap-2 mb-4 pb-3 border-b rule-soft">
          <div>
            <div className="label mb-1">Ticker</div>
            <input
              autoFocus
              value={sym}
              onChange={(e) => setSym(e.target.value)}
              placeholder="AAPL"
              className="bg-transparent border-b rule px-0 py-1 font-mono text-sm w-20 focus:outline-none focus:border-[var(--ink)]"
            />
          </div>
          <div>
            <div className="label mb-1">Shares</div>
            <input
              type="number"
              step="any"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="10"
              className="bg-transparent border-b rule px-0 py-1 font-mono text-sm w-20 focus:outline-none focus:border-[var(--ink)]"
            />
          </div>
          <div>
            <div className="label mb-1">Cost basis (opt.)</div>
            <input
              type="number"
              step="any"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="150.00"
              className="bg-transparent border-b rule px-0 py-1 font-mono text-sm w-24 focus:outline-none focus:border-[var(--ink)]"
            />
          </div>
          <button
            type="submit"
            className="ml-auto font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border rule hover:bg-[var(--ink)] hover:text-[var(--bg)] hover:border-[var(--ink)] transition"
          >
            save
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink"
          >
            cancel
          </button>
        </form>
      )}

      {loaded && holdings.length > 0 && (
        <>
          <div className="flex items-baseline gap-6 mb-3">
            <div>
              <div className="label">Total value</div>
              <div className="font-serif text-3xl font-light tabular-nums leading-none mt-1">
                ${fmt(totals.value)}
              </div>
            </div>
            <div>
              <div className="label">Today</div>
              <div
                className={`font-serif text-xl font-light tabular-nums leading-none mt-1 inline-flex items-center gap-1 ${
                  totals.dayPL == null ? "text-muted" : totals.dayPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-accent"
                }`}
              >
                {totals.dayPL != null && (totals.dayPL >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />)}
                {totals.dayPL == null ? "—" : `${totals.dayPL >= 0 ? "+" : ""}$${fmt(Math.abs(totals.dayPL))}`}
                {totals.dayPct != null && (
                  <span className="text-xs opacity-70">
                    ({totals.dayPct >= 0 ? "+" : ""}{totals.dayPct.toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4 pb-3 border-b rule-soft">
            <ValueChart data={snapshots} height={110} />
          </div>

          <div className="overflow-hidden">
            <div className="grid grid-cols-[1fr_72px_auto_auto_auto_auto] gap-x-4 label pb-1 border-b rule-soft items-center">
              <span>Holding</span>
              <span className="text-right">30d</span>
              <span className="text-right">Price</span>
              <span className="text-right">Day</span>
              <span className="text-right">Value</span>
              <span></span>
            </div>
            <ul className="divide-rule">
              {isLoading && holdings.length > 0 && !data && (
                <li className="text-muted text-xs italic py-2">Fetching quotes…</li>
              )}
              {rows.map(({ holding, quote, value, dayPL }) => {
                const dayPct = quote?.changePct ?? null;
                const up = (dayPL ?? 0) >= 0;
                return (
                  <li
                    key={holding.symbol}
                    className="group grid grid-cols-[1fr_72px_auto_auto_auto_auto] gap-x-4 items-center py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[12px] tabular-nums">{holding.symbol}</div>
                      <div className="text-[10px] text-muted truncate">
                        {quote?.name ?? "—"} · {fmt(holding.shares, { minimumFractionDigits: 0 })} sh
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Sparkline data={quote?.history ?? []} width={72} height={24} />
                    </div>
                    <div className="font-mono text-right tabular-nums text-[12px]">
                      ${fmt(quote?.price ?? null)}
                    </div>
                    <div
                      className={`font-mono text-right tabular-nums text-[12px] ${
                        dayPL == null ? "text-muted" : up ? "text-emerald-600 dark:text-emerald-400" : "text-accent"
                      }`}
                    >
                      {dayPct == null ? "—" : `${dayPct >= 0 ? "+" : ""}${dayPct.toFixed(2)}%`}
                    </div>
                    <div className="font-mono text-right tabular-nums text-[12px]">
                      ${fmt(value)}
                    </div>
                    <button
                      onClick={() => remove(holding.symbol)}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent transition"
                      aria-label={`Remove ${holding.symbol}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      <MoversStrip />
    </Card>
  );
}
