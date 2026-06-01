"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  Plus, Trash2, ChevronLeft, ChevronRight, X,
  TrendingUp, TrendingDown, Briefcase, GraduationCap,
  Landmark, CreditCard, Repeat, ArrowUpRight, ArrowDownRight, CalendarClock,
  PlayCircle, Newspaper, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { usePref, usePrefsLoaded } from "@/components/PrefsProvider";
import { localDateKey } from "@/lib/local-date";

// =============================================================================
//   Accounting toolkit — focused widgets the user opens on their own
//   "Accounting" page (separate route, not a popup). All state lives in the
//   synced prefs blob so everything follows the user across devices.
//
//   Sections:
//     • Net Worth     — assets − debt, auto-snapshotted monthly into a
//                       12-month trend line.
//     • Cash Flow     — monthly income vs expenses → surplus + savings rate.
//     • Subscriptions — recurring spend, monthly cost + next-bill radar.
//     • CPA           — AUD/FAR/REG/TCP with status, hours, exam date, score.
//     • Applications  — recruiting kanban (Big-4 internships, etc.).
// =============================================================================

const uid = () => Math.random().toString(36).slice(2, 9);
const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

interface LineItem { id: string; label: string; amount: number }
interface Snapshot { month: string; net: number; assets: number; debt: number }
interface Sub { id: string; name: string; amount: number; cycle: "mo" | "yr"; nextBill: string }
type Stage = "Applied" | "OA" | "Interview" | "Offer" | "Rejected";
const STAGES: Stage[] = ["Applied", "OA", "Interview", "Offer", "Rejected"];
interface AppItem { id: string; company: string; role: string; stage: Stage; deadline: string }
type CpaStatus = "Not started" | "Studying" | "Scheduled" | "Passed" | "Failed";
const CPA_STATUSES: CpaStatus[] = ["Not started", "Studying", "Scheduled", "Passed", "Failed"];
const CPA_SECTIONS = ["AUD", "FAR", "REG", "TCP"] as const;
type CpaSection = (typeof CPA_SECTIONS)[number];
interface CpaEntry { status: CpaStatus; hours: number; examDate: string; score: string }

// ---------- shared inputs ---------------------------------------------------

function NumberInput({ value, onChange, placeholder, prefix, width = "w-16" }: {
  value: number; onChange: (n: number) => void; placeholder?: string; prefix?: string; width?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--rule-soft)] px-2 focus-within:ring-1 focus-within:ring-[var(--accent)]">
      {prefix && <span className="text-muted text-[12px]">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        value={value === 0 ? "" : value}
        placeholder={placeholder ?? "0"}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={`${width} bg-transparent py-1.5 font-mono tabular-nums text-[13px] text-ink focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none placeholder:text-muted-2`}
      />
    </span>
  );
}

function TextInput({ value, onChange, placeholder, className = "", onEnter }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onEnter ? (e) => { if (e.key === "Enter") onEnter(); } : undefined}
      className={`bg-[var(--rule-soft)] rounded-lg px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2 ${className}`}
    />
  );
}

function DateInput({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-[var(--rule-soft)] rounded-lg px-2.5 py-1.5 font-mono text-[12px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)] ${className}`}
    />
  );
}

function BigStat({ label, value, sub, tone, size = "lg" }: {
  label: string; value: string; sub?: string; tone?: "up" | "down"; size?: "lg" | "md";
}) {
  return (
    <div className="text-center">
      <div className="label mb-1.5">{label}</div>
      <div className={`font-display tracking-tight ${size === "lg" ? "text-4xl md:text-5xl" : "text-2xl md:text-3xl"} ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="font-mono text-[11px] text-muted mt-1.5">{sub}</div>}
    </div>
  );
}

function MoneyList({
  title, icon, items, setItems, accentDown,
}: {
  title: string; icon: ReactNode; items: LineItem[]; setItems: (v: LineItem[]) => void; accentDown?: boolean;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const total = items.reduce((s, x) => s + x.amount, 0);

  function add() {
    if (!label.trim() || amount === 0) return;
    setItems([...items, { id: uid(), label: label.trim(), amount }]);
    setLabel(""); setAmount(0);
  }

  return (
    <div className="card-bare !p-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className={accentDown ? "text-down" : "text-up"}>{icon}</span>
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <span className="ml-auto font-mono tabular-nums text-[15px] text-ink">{money(total)}</span>
      </div>
      <ul className="space-y-1 mb-2.5">
        {items.map((it) => (
          <li
            key={it.id}
            className="group flex items-center gap-1.5 opacity-60 hover:opacity-100 focus-within:opacity-100 transition"
          >
            <input
              value={it.label}
              onChange={(e) => setItems(items.map((x) => x.id === it.id ? { ...x, label: e.target.value } : x))}
              className="flex-1 min-w-0 bg-transparent text-[13px] text-ink-soft focus:outline-none focus:text-ink truncate"
            />
            <NumberInput
              value={it.amount}
              prefix="$"
              onChange={(n) => setItems(items.map((x) => x.id === it.id ? { ...x, amount: n } : x))}
            />
            <button onClick={() => setItems(items.filter((x) => x.id !== it.id))} className="text-muted-2 opacity-0 group-hover:opacity-100 hover:text-accent transition shrink-0" aria-label="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-muted-2 text-xs italic">Nothing here yet.</li>}
      </ul>
      <div className="flex items-center gap-1.5">
        <TextInput value={label} onChange={setLabel} placeholder={`Add ${title.toLowerCase()}…`} className="flex-1 min-w-0" onEnter={add} />
        <NumberInput value={amount} prefix="$" onChange={setAmount} />
        <button onClick={add} className="btn-ghost !h-8 !w-8 shrink-0" aria-label="Add"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// =====================  NET WORTH  ==========================================

function NetWorthChart({ data, compact = false }: { data: Snapshot[]; compact?: boolean }) {
  const series = useMemo(() => data.slice(-12), [data]);
  const [hover, setHover] = useState<number | null>(null);
  const heightCls = compact ? "h-[120px]" : "h-[180px]";

  // Seed / single-point state — a calm dashed frame with the current value.
  if (series.length < 2) {
    const last = series[series.length - 1];
    return (
      <div className={`relative ${heightCls} rounded-2xl border border-dashed border-[var(--rule)] bg-[var(--rule-soft)] grid place-items-center px-6 text-center`}>
        {last && (
          <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_18px_var(--glow)]" />
        )}
        <p className="relative text-[12.5px] text-muted leading-relaxed max-w-[260px]">
          {last
            ? <>First month logged at <span className="font-mono text-ink">{money(last.net)}</span>.<br />Your trend builds from here — one point each month.</>
            : <>Your net-worth line starts here.<br />Add assets &amp; debts below — each month is plotted automatically.</>}
        </p>
      </div>
    );
  }

  const W = 680, H = compact ? 120 : 180;
  const padT = 12, padB = compact ? 20 : 26, padX = 10;
  const vals = series.map((s) => s.net);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const x = (i: number) => padX + (i / (series.length - 1)) * (W - padX * 2);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (H - padT - padB);
  const zeroY = y(0);

  const line = series.map((s, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(s.net).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(series.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${x(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const hv = hover != null ? series[hover] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(series.length - 1, Math.round(ratio * (series.length - 1)))));
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={`w-full ${heightCls} touch-none`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="nwLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--grad-from)" />
            <stop offset="50%" stopColor="var(--grad-via)" />
            <stop offset="100%" stopColor="var(--grad-to)" />
          </linearGradient>
          <linearGradient id="nwArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--grad-via)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--grad-via)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {lo < 0 && (
          <line x1={padX} x2={W - padX} y1={zeroY} y2={zeroY} stroke="var(--rule)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        )}
        <path d={area} fill="url(#nwArea)" />
        <path d={line} fill="none" stroke="url(#nwLine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        {/* last-point marker */}
        <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].net)} r="3.5" fill="var(--grad-to)" vectorEffect="non-scaling-stroke" />

        {/* hover crosshair + dot */}
        {hv && hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={padT - 6} y2={H - padB + 4} stroke="var(--accent)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover)} cy={y(hv.net)} r="4.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>

      {/* x-axis labels: first / last (and hovered) */}
      <div className="flex justify-between px-1 mt-0.5 font-mono text-[10px] text-muted-2 select-none">
        <span>{monthLabel(series[0].month)}</span>
        <span>{monthLabel(series[series.length - 1].month)}</span>
      </div>

      {/* tooltip */}
      {hv && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--glass-border)] bg-[var(--paper-2)] px-2.5 py-1.5 backdrop-blur-md shadow-[var(--shadow-card)] whitespace-nowrap"
          style={{ left: `${(hover! / (series.length - 1)) * 100}%` }}
        >
          <div className="label !text-[8.5px] !tracking-[0.1em]">{monthLabel(hv.month, true)}</div>
          <div className="font-mono text-[13px] tabular-nums text-ink">{money(hv.net)}</div>
          <div className="font-mono text-[10px] text-muted">{money(hv.assets)} · −{money(hv.debt)}</div>
        </div>
      )}
    </div>
  );
}

function monthLabel(m: string, full = false): string {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return format(new Date(y, mo - 1, 1), full ? "MMMM yyyy" : "MMM");
}

export function NetWorthSection() {
  const [investments, setInvestments] = usePref<LineItem[]>("hub.investments", []);
  const [debts, setDebts] = usePref<LineItem[]>("hub.debts", []);
  const [history, setHistory] = usePref<Snapshot[]>("hub.networth.history", []);
  const loaded = usePrefsLoaded();

  const invTotal = investments.reduce((s, x) => s + x.amount, 0);
  const debtTotal = debts.reduce((s, x) => s + x.amount, 0);
  const netWorth = invTotal - debtTotal;
  const debtRatio = invTotal > 0 ? `${Math.round((debtTotal / invTotal) * 100)}%` : debtTotal > 0 ? "∞" : "0%";

  // Auto-snapshot the current month once prefs have hydrated. Re-runs whenever
  // the totals change and overwrites the in-progress month; the guard makes it
  // idempotent so it never loops.
  useEffect(() => {
    if (!loaded) return;
    if (history.length === 0 && invTotal === 0 && debtTotal === 0) return;
    const month = monthKey(new Date());
    const cur = history.find((s) => s.month === month);
    if (cur && cur.net === netWorth && cur.assets === invTotal && cur.debt === debtTotal) return;
    const next = [...history.filter((s) => s.month !== month), { month, net: netWorth, assets: invTotal, debt: debtTotal }]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-24);
    setHistory(next);
  }, [loaded, netWorth, invTotal, debtTotal, history, setHistory]);

  // Month-over-month delta (vs the latest completed month).
  const curMonth = monthKey(new Date());
  const past = history.filter((s) => s.month !== curMonth);
  const prev = past.length ? past[past.length - 1] : null;
  const delta = prev ? netWorth - prev.net : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className={`font-display text-4xl md:text-5xl tracking-tight ${netWorth >= 0 ? "text-ink" : "text-down"}`}>
          {money(netWorth)}
        </div>
        {delta != null && (
          <div
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${delta >= 0 ? "text-up" : "text-down"}`}
            style={{ background: `color-mix(in srgb, ${delta >= 0 ? "var(--up)" : "var(--down)"} 14%, transparent)` }}
          >
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {money(Math.abs(delta))} vs {monthLabel(prev!.month)}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-[11.5px] font-mono">
        <span className="inline-flex items-center gap-1 text-up"><TrendingUp className="h-3.5 w-3.5" />{money(invTotal)}</span>
        <span className="text-muted-2">·</span>
        <span className="inline-flex items-center gap-1 text-down"><TrendingDown className="h-3.5 w-3.5" />{money(debtTotal)}</span>
        <span className="ml-auto text-[10.5px] text-muted">{debtRatio} D/A</span>
      </div>

      <NetWorthChart data={history} compact />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t rule pt-4">
        <MoneyList title="Investments & assets" icon={<Landmark className="h-4 w-4" />} items={investments} setItems={setInvestments} />
        <MoneyList title="Debt & liabilities" icon={<CreditCard className="h-4 w-4" />} items={debts} setItems={setDebts} accentDown />
      </div>
    </div>
  );
}

// =====================  CASH FLOW  ==========================================

export function CashFlowSection() {
  const [income, setIncome] = usePref<LineItem[]>("hub.income", []);
  const [expenses, setExpenses] = usePref<LineItem[]>("hub.expenses", []);
  const inc = income.reduce((s, x) => s + x.amount, 0);
  const exp = expenses.reduce((s, x) => s + x.amount, 0);
  const surplus = inc - exp;
  const rate = inc > 0 ? Math.round((surplus / inc) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <BigStat label="Monthly surplus" value={money(surplus)} tone={surplus >= 0 ? "up" : "down"} />
        <BigStat label="Savings rate" value={`${rate}%`} sub={`${money(inc)} in · ${money(exp)} out`} />
      </div>
      {/* in vs out bar */}
      <div className="space-y-1.5">
        <div className="h-2 w-full rounded-full bg-[var(--rule)] overflow-hidden flex">
          <div className="h-full bg-[var(--up)] transition-[width] duration-500" style={{ width: `${inc + exp > 0 ? (inc / (inc + exp)) * 100 : 50}%` }} />
          <div className="h-full bg-[var(--down)] transition-[width] duration-500" style={{ width: `${inc + exp > 0 ? (exp / (inc + exp)) * 100 : 50}%` }} />
        </div>
        <div className="flex justify-between font-mono text-[10px] text-muted">
          <span className="text-up">{money(inc)} earned</span>
          <span className="text-down">{money(exp)} spent</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MoneyList title="Monthly income" icon={<TrendingUp className="h-4 w-4" />} items={income} setItems={setIncome} />
        <MoneyList title="Monthly expenses" icon={<TrendingDown className="h-4 w-4" />} items={expenses} setItems={setExpenses} accentDown />
      </div>
    </div>
  );
}

// =====================  SUBSCRIPTIONS  ======================================

const SUB_PALETTE = [
  "var(--grad-from)", "var(--grad-via)", "var(--grad-to)",
  "var(--accent)", "var(--accent-2)", "var(--up)", "#d97706", "#a855f7",
];
function subColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SUB_PALETTE[h % SUB_PALETTE.length];
}
function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
}
function relDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n > 0) return `in ${n} days`;
  return `${-n}d ago`;
}

export function SubscriptionsSection() {
  const [subs, setSubs] = usePref<Sub[]>("hub.subscriptions", []);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [cycle, setCycle] = useState<"mo" | "yr">("mo");
  const [nextBill, setNextBill] = useState("");

  const monthlyOf = (s: Sub) => (s.cycle === "yr" ? s.amount / 12 : s.amount);
  const totalMonthly = subs.reduce((sum, s) => sum + monthlyOf(s), 0);
  const annual = totalMonthly * 12;

  function add() {
    if (!name.trim() || amount === 0) return;
    setSubs([...subs, { id: uid(), name: name.trim(), amount, cycle, nextBill }]);
    setName(""); setAmount(0); setCycle("mo"); setNextBill("");
  }

  const sorted = useMemo(() => {
    return [...subs].sort((a, b) => {
      const da = a.nextBill ? daysUntil(a.nextBill) : Infinity;
      const db = b.nextBill ? daysUntil(b.nextBill) : Infinity;
      const ka = da === Infinity ? 2 : da < 0 ? 1 : 0;
      const kb = db === Infinity ? 2 : db < 0 ? 1 : 0;
      if (ka !== kb) return ka - kb;
      return da - db;
    });
  }, [subs]);

  const nextUp = sorted.find((s) => s.nextBill && daysUntil(s.nextBill) >= 0 && daysUntil(s.nextBill) <= 31);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <BigStat label="Per month" value={money(totalMonthly)} tone={totalMonthly > 0 ? "down" : undefined} />
        <BigStat label="Per year" value={money(annual)} sub={`${subs.length} active`} />
      </div>

      {nextUp && (
        <div className="flex items-center gap-2 rounded-xl bg-[var(--rule-soft)] px-3 py-2 text-[12px]">
          <CalendarClock className="h-4 w-4 text-accent shrink-0" />
          <span className="text-ink-soft">Next up</span>
          <span className="font-medium text-ink">{nextUp.name}</span>
          <span className="ml-auto font-mono text-muted">{relDays(daysUntil(nextUp.nextBill))}</span>
        </div>
      )}

      <ul className="space-y-1.5">
        {sorted.map((s) => {
          const d = s.nextBill ? daysUntil(s.nextBill) : null;
          const soon = d != null && d >= 0 && d <= 7;
          return (
            <li key={s.id} className="group flex items-center gap-3 rounded-xl border border-[var(--rule-soft)] px-3 py-2 hover:border-[var(--rule)] transition">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white"
                style={{ background: subColor(s.name) }}
              >
                {s.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink truncate">{s.name}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted">
                  {s.nextBill ? (
                    <>
                      <span>{format(new Date(s.nextBill + "T00:00:00"), "MMM d")}</span>
                      <span className={soon ? "text-accent font-medium" : ""}>· {relDays(d!)}</span>
                    </>
                  ) : (
                    <span className="italic text-muted-2">no date set</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono tabular-nums text-[13px] text-ink">
                  {money(monthlyOf(s))}<span className="text-muted text-[11px]">/mo</span>
                </div>
                {s.cycle === "yr" && <div className="font-mono text-[10px] text-muted">{money(s.amount)}/yr billed</div>}
              </div>
              <button onClick={() => setSubs(subs.filter((x) => x.id !== s.id))} className="text-muted-2 opacity-0 group-hover:opacity-100 hover:text-accent transition shrink-0" aria-label="Remove">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
        {subs.length === 0 && (
          <li className="rounded-xl border border-dashed border-[var(--rule)] py-4 text-center text-[12px] italic text-muted-2">
            No subscriptions tracked — add Netflix, Spotify, that gym you forgot about…
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-1.5 border-t rule pt-3.5">
        <TextInput value={name} onChange={setName} placeholder="Subscription (e.g. Netflix)" className="flex-1 min-w-[130px]" onEnter={add} />
        <NumberInput value={amount} prefix="$" onChange={setAmount} />
        <div className="inline-flex rounded-lg border border-[var(--rule)] overflow-hidden text-[12px]">
          {(["mo", "yr"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`px-2.5 py-1.5 transition ${cycle === c ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-ink"}`}
            >
              {c === "mo" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        <DateInput value={nextBill} onChange={setNextBill} />
        <button onClick={add} className="btn-ghost !h-8 !w-8 shrink-0" aria-label="Add subscription"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// =====================  APPLICATIONS  =======================================

const STAGE_TONE: Record<Stage, string> = {
  Applied: "var(--muted)",
  OA: "#d97706",
  Interview: "var(--accent)",
  Offer: "var(--up)",
  Rejected: "var(--down)",
};

export function ApplicationsSection() {
  const [apps, setApps] = usePref<AppItem[]>("hub.apps", []);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  function add() {
    if (!company.trim()) return;
    setApps([...apps, { id: uid(), company: company.trim(), role: role.trim(), stage: "Applied", deadline: "" }]);
    setCompany(""); setRole("");
  }
  function move(id: string, dir: -1 | 1) {
    setApps(apps.map((a) => {
      if (a.id !== id) return a;
      const i = STAGES.indexOf(a.stage);
      const ni = Math.max(0, Math.min(STAGES.length - 1, i + dir));
      return { ...a, stage: STAGES[ni] };
    }));
  }
  function setStage(id: string, stage: Stage) {
    setApps(apps.map((a) => a.id === id ? { ...a, stage } : a));
  }
  function drop(stage: Stage, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    if (id) setStage(id, stage);
    setDragId(null);
    setOverStage(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        <TextInput value={company} onChange={setCompany} placeholder="Company (e.g. Deloitte)" className="flex-1 min-w-[140px]" onEnter={add} />
        <TextInput value={role} onChange={setRole} placeholder="Role (e.g. Audit Intern)" className="flex-1 min-w-[140px]" onEnter={add} />
        <button onClick={add} className="btn-ghost !h-8 !w-8" aria-label="Add application"><Plus className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {STAGES.map((stage) => {
          const col = apps.filter((a) => a.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => drop(stage, e)}
              className={`min-w-[180px] flex-1 rounded-xl p-1 transition ${overStage === stage ? "bg-[var(--rule-soft)] ring-1 ring-[var(--accent)]" : ""}`}
            >
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <span className="h-2 w-2 rounded-full" style={{ background: STAGE_TONE[stage] }} />
                <span className="text-[12px] font-semibold text-ink">{stage}</span>
                <span className="ml-auto font-mono text-[11px] text-muted">{col.length}</span>
              </div>
              <ul className="space-y-2 min-h-[44px]">
                {col.map((a) => {
                  const i = STAGES.indexOf(a.stage);
                  return (
                    <li
                      key={a.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); e.dataTransfer.effectAllowed = "move"; setDragId(a.id); }}
                      onDragEnd={() => { setDragId(null); setOverStage(null); }}
                      className={`group card-bare !p-2.5 cursor-grab active:cursor-grabbing ${dragId === a.id ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-ink truncate">{a.company}</div>
                          {a.role && <div className="text-[11px] text-muted truncate">{a.role}</div>}
                        </div>
                        <button onClick={() => setApps(apps.filter((x) => x.id !== a.id))} className="text-muted-2 opacity-0 group-hover:opacity-100 hover:text-accent transition shrink-0" aria-label="Remove">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        type="date"
                        value={a.deadline}
                        onChange={(e) => setApps(apps.map((x) => x.id === a.id ? { ...x, deadline: e.target.value } : x))}
                        className="mt-1.5 w-full bg-transparent font-mono text-[10px] text-muted focus:outline-none focus:text-ink"
                      />
                      <div className="flex items-center justify-between mt-1.5 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => move(a.id, -1)} disabled={i === 0} className="text-muted hover:text-accent disabled:opacity-30" aria-label="Move back">
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button onClick={() => move(a.id, 1)} disabled={i === STAGES.length - 1} className="text-muted hover:text-accent disabled:opacity-30" aria-label="Move forward">
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
                {col.length === 0 && (
                  <li className="rounded-lg border border-dashed border-[var(--rule)] py-3 text-center text-[11px] italic text-muted-2">
                    Drop here
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================  CPA  ================================================

const CPA_TONE: Record<CpaStatus, string> = {
  "Not started": "var(--muted-2)",
  Studying: "#d97706",
  Scheduled: "var(--accent)",
  Passed: "var(--up)",
  Failed: "var(--down)",
};

export function CpaSection({ compact = false }: { compact?: boolean } = {}) {
  const [cpa, setCpa] = usePref<Record<CpaSection, CpaEntry>>("hub.cpa", {
    AUD: { status: "Not started", hours: 0, examDate: "", score: "" },
    FAR: { status: "Not started", hours: 0, examDate: "", score: "" },
    REG: { status: "Not started", hours: 0, examDate: "", score: "" },
    TCP: { status: "Not started", hours: 0, examDate: "", score: "" },
  });
  const passed = CPA_SECTIONS.filter((s) => cpa[s]?.status === "Passed").length;
  const totalHours = CPA_SECTIONS.reduce((s, k) => s + (cpa[k]?.hours ?? 0), 0);
  const update = (sec: CpaSection, patch: Partial<CpaEntry>) =>
    setCpa({ ...cpa, [sec]: { ...cpa[sec], ...patch } });
  // Single column when running beside another card; 2→4 columns at full width.
  const gridCls = compact
    ? "grid grid-cols-1 gap-3"
    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <BigStat label="Sections passed" value={`${passed} / 4`} tone={passed === 4 ? "up" : undefined} size={compact ? "md" : "lg"} />
        <BigStat label="Study hours logged" value={totalHours.toLocaleString()} sub="across all sections" size={compact ? "md" : "lg"} />
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--rule)] overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${(passed / 4) * 100}%`, background: "linear-gradient(90deg, var(--grad-from), var(--grad-via), var(--grad-to))" }} />
      </div>
      <div className={gridCls}>
        {CPA_SECTIONS.map((sec) => {
          const e = cpa[sec];
          return (
            <div key={sec} className="card-bare !p-4">
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap className="h-4 w-4 text-accent" />
                <span className="font-display text-lg text-ink">{sec}</span>
                <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: CPA_TONE[e.status], background: "var(--rule-soft)" }}>
                  {e.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {CPA_STATUSES.map((st) => (
                  <button key={st} onClick={() => update(sec, { status: st })}
                    className={`text-[10px] px-2 py-1 rounded-full border transition ${e.status === st ? "border-transparent text-white" : "border-[var(--rule)] text-muted hover:text-ink"}`}
                    style={e.status === st ? { background: CPA_TONE[st] } : undefined}>
                    {st}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 items-end">
                <label className="block">
                  <span className="label !text-[9px]">Hours</span>
                  <input type="number" value={e.hours === 0 ? "" : e.hours} placeholder="0"
                    onChange={(ev) => update(sec, { hours: Number(ev.target.value) || 0 })}
                    className="mt-1 w-full bg-[var(--rule-soft)] rounded-lg px-2 py-1.5 font-mono tabular-nums text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                </label>
                <label className="block">
                  <span className="label !text-[9px]">Exam</span>
                  <input type="date" value={e.examDate}
                    onChange={(ev) => update(sec, { examDate: ev.target.value })}
                    className="mt-1 w-full bg-[var(--rule-soft)] rounded-lg px-2 py-1.5 font-mono text-[11px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                </label>
                <label className="block">
                  <span className="label !text-[9px]">Score</span>
                  <input value={e.score} placeholder="—" maxLength={3}
                    onChange={(ev) => update(sec, { score: ev.target.value.replace(/[^0-9]/g, "") })}
                    className="mt-1 w-full bg-[var(--rule-soft)] rounded-lg px-2 py-1.5 font-mono tabular-nums text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================  HEADER KPI STRIP  ===================================

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="inline-flex items-baseline gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--paper)] px-3.5 py-1.5 backdrop-blur-md shadow-[var(--shadow-card)]">
      <span className="label !text-[9px] !tracking-[0.12em]">{label}</span>
      <span className={`font-mono text-[13px] tabular-nums ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}>{value}</span>
    </div>
  );
}

export function AccountingHeaderStats() {
  const [income] = usePref<LineItem[]>("hub.income", []);
  const [expenses] = usePref<LineItem[]>("hub.expenses", []);
  const [investments] = usePref<LineItem[]>("hub.investments", []);
  const [debts] = usePref<LineItem[]>("hub.debts", []);
  const [subs] = usePref<Sub[]>("hub.subscriptions", []);

  const surplus = income.reduce((s, x) => s + x.amount, 0) - expenses.reduce((s, x) => s + x.amount, 0);
  const netWorth = investments.reduce((s, x) => s + x.amount, 0) - debts.reduce((s, x) => s + x.amount, 0);
  const subMonthly = subs.reduce((s, x) => s + (x.cycle === "yr" ? x.amount / 12 : x.amount), 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Kpi label="Net worth" value={money(netWorth)} tone={netWorth >= 0 ? "up" : "down"} />
      <Kpi label="Surplus / mo" value={money(surplus)} tone={surplus >= 0 ? "up" : "down"} />
      <Kpi label="Subs / mo" value={money(subMonthly)} tone={subMonthly > 0 ? "down" : undefined} />
    </div>
  );
}

// =====================  CPA VIDEO (Logan Graf)  =============================
//
// A single daily pick from https://www.youtube.com/@logangrafcpa/videos.
// The /api/cpa-video route picks deterministically per local date, so the
// pick is stable through the day and rotates at midnight.

interface CpaVideoResp {
  videoId?: string;
  title?: string;
  channelUrl?: string;
  thumb?: string;
  published?: string;
  error?: string;
}

const jsonFetcher = (url: string) => fetch(url).then((r) => r.json());

export function CpaVideoSection() {
  const dateKey = useDailyKey();
  const { data, isLoading } = useSWR<CpaVideoResp>(
    `/api/cpa-video?d=${dateKey}`,
    jsonFetcher,
    { refreshInterval: 1000 * 60 * 60 * 6, keepPreviousData: true },
  );
  const [playing, setPlaying] = useState(false);
  // New date → reset to the poster preview rather than a stale playing state.
  useEffect(() => { setPlaying(false); }, [dateKey]);

  const channelUrl = data?.channelUrl ?? "https://www.youtube.com/@logangrafcpa/videos";
  const videoId = data?.videoId;
  const title = data?.title ?? "";
  const thumb = data?.thumb || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)]">
        {isLoading && (
          <div className="absolute inset-0 grid place-items-center text-[12px] text-muted">Finding today’s video…</div>
        )}
        {!isLoading && !videoId && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-[12px] text-muted">
            <a href={channelUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
              <PlayCircle className="h-4 w-4" /> Open Logan Graf on YouTube
            </a>
          </div>
        )}
        {!playing && videoId && (
          <button
            onClick={() => setPlaying(true)}
            aria-label="Play today's video"
            className="absolute inset-0 group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt={title} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white/95 text-black shadow-lg transition group-hover:scale-110">
                <PlayCircle className="h-9 w-9" strokeWidth={1.5} />
              </span>
            </span>
          </button>
        )}
        {playing && videoId && (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        )}
      </div>
      <div className="min-w-0">
        <a
          href={channelUrl}
          target="_blank"
          rel="noreferrer"
          title={title || "Logan Graf CPA"}
          className="group block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug"
        >
          {title || "Logan Graf CPA — daily pick"}
          <span className="ml-1.5 inline-block align-text-bottom opacity-0 group-hover:opacity-100 transition">
            <ExternalLink className="h-3 w-3 inline" />
          </span>
        </a>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
          <span className="label !text-[9px] !tracking-[0.1em]">Daily CPA</span>
          <span>· rotates at midnight</span>
        </div>
      </div>
    </div>
  );
}

// Today's local-date as a stable string; recomputed at midnight so SWR's
// cache key flips and the next day's pick comes in automatically.
function useDailyKey(): string {
  const [k, setK] = useState<string>(() => localDateKey());
  useEffect(() => {
    const tick = () => setK(localDateKey());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return k;
}

// =====================  ACCOUNTING NEWS  ====================================
//
// Three trade publications: Journal of Accountancy, The CPA Journal,
// Accounting Today. The /api/accounting-news route deduplicates and ranks
// by recency.

interface AccountingNewsResp {
  items?: Array<{ title: string; link: string; source: string; pubDate: string }>;
  sources?: Array<{ name: string; site: string }>;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return format(d, "MMM d");
}

const SOURCE_TONE: Record<string, string> = {
  "Journal of Accountancy": "var(--grad-from)",
  "The CPA Journal": "var(--grad-via)",
  "Accounting Today": "var(--grad-to)",
};

export function AccountingNewsSection() {
  const { data, error, isLoading } = useSWR<AccountingNewsResp>(
    "/api/accounting-news",
    jsonFetcher,
    { refreshInterval: 1000 * 60 * 30, keepPreviousData: true },
  );

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
        {(data?.sources ?? [
          { name: "Journal of Accountancy", site: "https://www.journalofaccountancy.com/" },
          { name: "The CPA Journal", site: "https://www.cpajournal.com/" },
          { name: "Accounting Today", site: "https://www.accountingtoday.com/" },
        ]).map((s) => (
          <a
            key={s.name}
            href={s.site}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--rule)] px-2 py-0.5 text-muted hover:text-ink hover:border-[var(--accent)] transition"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_TONE[s.name] ?? "var(--muted)" }} />
            {s.name}
          </a>
        ))}
      </div>

      {isLoading && items.length === 0 && (
        <p className="text-muted text-sm italic">Loading the trades…</p>
      )}
      {error && items.length === 0 && (
        <p className="text-down text-sm">Couldn’t reach the feeds right now.</p>
      )}

      <ul className="divide-rule">
        {items.map((it, i) => (
          <li key={`${it.link}-${i}`}>
            <a
              href={it.link}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-3 py-2.5"
            >
              <span
                aria-hidden
                className="mt-[7px] h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: SOURCE_TONE[it.source] ?? "var(--muted)" }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] leading-snug text-ink-soft group-hover:text-accent transition">
                  {it.title}
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                  <span>{it.source}</span>
                  <span className="text-muted-2">·</span>
                  <span>{timeAgo(it.pubDate)}</span>
                </div>
              </div>
            </a>
          </li>
        ))}
        {!isLoading && items.length === 0 && !error && (
          <li className="text-muted text-sm italic py-2">No headlines yet.</li>
        )}
      </ul>

      <div className="pt-1 font-mono text-[9px] uppercase tracking-wider text-muted">
        <Newspaper className="inline h-3 w-3 mr-1 -mt-0.5" />
        Sourced direct from each publication&rsquo;s RSS
      </div>
    </div>
  );
}

// Backward-compat icon export so the masthead pill can use it.
export { Briefcase as AccountingIcon, Repeat as SubscriptionsIcon };
