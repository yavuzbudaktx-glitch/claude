"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  Plus, Trash2, ChevronLeft, ChevronRight, X,
  TrendingUp, TrendingDown, Briefcase,
  Landmark, CreditCard, Repeat, ArrowUpRight, ArrowDownRight, CalendarClock,
  PlayCircle, ExternalLink, Shuffle, Award, Clock, CalendarDays, Check,
  RefreshCw, MessageSquare, ArrowUp, Eye, EyeOff, Target, Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { usePref, usePrefsLoaded } from "@/components/PrefsProvider";
import { localDateKey } from "@/lib/local-date";
import { useFreshAt } from "@/lib/use-fresh";
import { useCountUp } from "@/lib/use-count-up";

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
  title, icon, items, setItems, accentDown, hideAmounts,
}: {
  title: string; icon: ReactNode; items: LineItem[]; setItems: (v: LineItem[]) => void;
  accentDown?: boolean; hideAmounts?: boolean;
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
        <span className="ml-auto font-mono tabular-nums text-[15px] text-ink">{hideAmounts ? "$•••" : money(total)}</span>
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
            {hideAmounts ? (
              <span className="font-mono text-[13px] text-muted px-2">$•••</span>
            ) : (
              <NumberInput
                value={it.amount}
                prefix="$"
                onChange={(n) => setItems(items.map((x) => x.id === it.id ? { ...x, amount: n } : x))}
              />
            )}
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

function NetWorthChart({ data, compact = false, hidden = false, goal = 0 }: { data: Snapshot[]; compact?: boolean; hidden?: boolean; goal?: number }) {
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
            ? <>First month logged at <span className="font-mono text-ink">{hidden ? "$•••" : money(last.net)}</span>.<br />Your trend builds from here — one point each month.</>
            : <>Your net-worth line starts here.<br />Add assets &amp; debts below — each month is plotted automatically.</>}
        </p>
      </div>
    );
  }

  const W = 680, H = compact ? 120 : 180;
  const padT = 12, padB = compact ? 20 : 26, padX = 10;
  const vals = series.map((s) => s.net);
  const dataLo = Math.min(0, ...vals);
  const dataHi = Math.max(0, ...vals);
  const dataSpan = dataHi - dataLo || 1;
  // Old version folded the goal into the y-range — but if the goal was
  // 50× your current net worth, the actual data line collapsed to a
  // flat smear at the bottom. Now: only stretch the range upward if the
  // goal is within 1.5× the data span; otherwise clamp the goal to the
  // top of the chart and add some headroom so it's visibly "off-screen
  // above" rather than crowding the data.
  const hasGoal = goal > 0;
  const goalFits = hasGoal && goal <= dataHi + dataSpan * 1.5;
  const hi = goalFits ? Math.max(dataHi, goal) : dataHi + dataSpan * 0.15;
  const lo = dataLo;
  const span = hi - lo || 1;
  const x = (i: number) => padX + (i / (series.length - 1)) * (W - padX * 2);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (H - padT - padB);
  const zeroY = y(0);
  const goalY = hasGoal ? Math.max(padT - 4, Math.min(H - padB + 4, y(goal))) : 0;
  const goalOffscreen = hasGoal && !goalFits;
  const lastX = x(series.length - 1);
  const lastY = y(series[series.length - 1].net);

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

        {/* goal: a faint target line + a dashed trajectory from where you are
            now up to the goal at the chart's right edge. When the goal is way
            above the data, draw an "above-chart" indicator arrow instead so
            we don't squish the line. */}
        {hasGoal && !goalOffscreen && (
          <>
            <line x1={padX} x2={W - padX} y1={goalY} y2={goalY} stroke="var(--grad-to)" strokeWidth="1.25" strokeDasharray="2 4" opacity="0.6" vectorEffect="non-scaling-stroke" />
            <line x1={lastX} y1={lastY} x2={W - padX} y2={goalY} stroke="var(--grad-to)" strokeWidth="1.25" strokeDasharray="4 4" opacity="0.45" vectorEffect="non-scaling-stroke" />
            <circle cx={W - padX} cy={goalY} r="2.5" fill="var(--grad-to)" opacity="0.8" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {hasGoal && goalOffscreen && (
          <line x1={lastX} y1={lastY} x2={W - padX} y2={padT} stroke="var(--grad-to)" strokeWidth="1.25" strokeDasharray="4 4" opacity="0.5" vectorEffect="non-scaling-stroke" />
        )}

        <path d={area} fill="url(#nwArea)" />
        <path d={line} fill="none" stroke="url(#nwLine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        {/* last-point marker */}
        <circle cx={lastX} cy={lastY} r="3.5" fill="var(--grad-to)" vectorEffect="non-scaling-stroke" />

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

      {/* tooltip — left% clamped to [6, 94] so it can't overflow the card edges */}
      {hv && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--glass-border)] bg-[var(--paper-2)] px-2.5 py-1.5 backdrop-blur-md shadow-[var(--shadow-card)] whitespace-nowrap"
          style={{ left: `${Math.max(6, Math.min(94, (hover! / (series.length - 1)) * 100))}%` }}
        >
          <div className="label !text-[8.5px] !tracking-[0.1em]">{monthLabel(hv.month, true)}</div>
          <div className="font-mono text-[13px] tabular-nums text-ink">{hidden ? "$•••" : money(hv.net)}</div>
          <div className="font-mono text-[10px] text-muted">{hidden ? "$••• · −$•••" : `${money(hv.assets)} · −${money(hv.debt)}`}</div>
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
  // Private mode hides every $ figure so you can show the dashboard on a
  // call / screenshare without baring your finances. Synced across devices.
  const [hidden, setHidden] = usePref<boolean>("hub.netWorth.hidden", false);
  // 12-month net-worth target. 0 = unset (no goal line).
  const [goal, setGoal] = usePref<number>("hub.netWorth.goal", 0);
  const [editingGoal, setEditingGoal] = useState(false);
  const loaded = usePrefsLoaded();
  const dollar = (n: number) => (hidden ? "$•••" : money(n));

  const invTotal = investments.reduce((s, x) => s + x.amount, 0);
  const debtTotal = debts.reduce((s, x) => s + x.amount, 0);
  const netWorth = invTotal - debtTotal;
  const debtRatio = invTotal > 0 ? `${Math.round((debtTotal / invTotal) * 100)}%` : debtTotal > 0 ? "∞" : "0%";
  // Goal math: how far to target, and what monthly gain gets there in a year.
  const goalPct = goal > 0 ? Math.max(0, Math.min(100, Math.round((netWorth / goal) * 100))) : 0;
  const perMonthNeeded = goal > netWorth ? (goal - netWorth) / 12 : 0;

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
  // Count-up the hero number so it ticks into place.
  const animatedNet = useCountUp(netWorth);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <button
          onClick={() => setHidden(!hidden)}
          title={hidden ? "Show your net worth" : "Hide your net worth"}
          className={`group relative font-display text-4xl md:text-5xl tracking-tight transition ${netWorth >= 0 ? "text-ink" : "text-down"} ${hidden ? "tracking-[0.05em]" : ""}`}
        >
          {hidden ? "$•••" : money(Math.round(animatedNet))}
          <span className="absolute -bottom-1 left-0 right-0 mx-auto h-px w-6 bg-[var(--accent)] opacity-0 group-hover:opacity-100 transition" />
        </button>
        {delta != null && !hidden && (
          <div
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${delta >= 0 ? "text-up" : "text-down"}`}
            style={{ background: `color-mix(in srgb, ${delta >= 0 ? "var(--up)" : "var(--down)"} 14%, transparent)` }}
          >
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {money(Math.abs(delta))} vs {monthLabel(prev!.month)}
          </div>
        )}
        <button
          onClick={() => setHidden(!hidden)}
          aria-label={hidden ? "Show amounts" : "Hide amounts"}
          title={hidden ? "Show amounts" : "Hide amounts"}
          className="ml-auto text-muted-2 hover:text-accent transition"
        >
          {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="flex items-center gap-3 text-[11.5px] font-mono">
        <span className="inline-flex items-center gap-1 text-up"><TrendingUp className="h-3.5 w-3.5" />{dollar(invTotal)}</span>
        <span className="text-muted-2">·</span>
        <span className="inline-flex items-center gap-1 text-down"><TrendingDown className="h-3.5 w-3.5" />{dollar(debtTotal)}</span>
        <span className="ml-auto text-[10.5px] text-muted">{hidden ? "—" : debtRatio} D/A</span>
      </div>

      <NetWorthChart data={history} compact hidden={hidden} goal={hidden ? 0 : goal} />

      {/* Goal row — set a 12-month target; the chart draws the line + trajectory. */}
      <div className="flex items-center gap-2 text-[11.5px]">
        <Target className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--grad-to)" }} />
        {goal > 0 && !editingGoal ? (
          <>
            <span className="font-mono text-ink">{hidden ? "$•••" : money(goal)}</span>
            <span className="text-muted">goal</span>
            <div className="flex-1 h-1.5 rounded-full bg-[var(--rule)] overflow-hidden mx-1">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${goalPct}%`, background: "linear-gradient(90deg, var(--grad-from), var(--grad-via), var(--grad-to))" }} />
            </div>
            <span className="font-mono text-muted shrink-0">{goalPct}%</span>
            {perMonthNeeded > 0 && !hidden && (
              <span className="text-muted-2 shrink-0 hidden sm:inline">· {money(perMonthNeeded)}/mo</span>
            )}
            <button onClick={() => setEditingGoal(true)} className="text-muted-2 hover:text-accent transition shrink-0" aria-label="Edit goal">
              <Pencil className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            <span className="text-muted">12-month target</span>
            <NumberInput value={goal} prefix="$" width="w-24" onChange={setGoal} />
            <button onClick={() => setEditingGoal(false)} className="text-[11px] text-accent hover:underline shrink-0">done</button>
            {goal > 0 && (
              <button onClick={() => { setGoal(0); setEditingGoal(false); }} className="text-[11px] text-muted-2 hover:text-down transition shrink-0">clear</button>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t rule pt-4">
        <MoneyList title="Investments & assets" icon={<Landmark className="h-4 w-4" />} items={investments} setItems={setInvestments} hideAmounts={hidden} />
        <MoneyList title="Debt & liabilities" icon={<CreditCard className="h-4 w-4" />} items={debts} setItems={setDebts} accentDown hideAmounts={hidden} />
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
// The stored `nextBill` is the LAST date the user entered; a recurring sub
// bills again every cycle. Roll it forward by whole months (or years) until
// it lands on/after today, so a date that's "41d ago" becomes "in 19 days"
// instead of showing a stale past date.
function nextBillDate(dateStr: string, cycle: "mo" | "yr"): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const date = new Date(y, m - 1, d);
  let guard = 0;
  while (date.getTime() < today.getTime() && guard++ < 240) {
    if (cycle === "yr") date.setFullYear(date.getFullYear() + 1);
    else date.setMonth(date.getMonth() + 1);
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function daysUntilNext(s: { nextBill: string; cycle: "mo" | "yr" }): number {
  return daysUntil(nextBillDate(s.nextBill, s.cycle));
}
function relDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n > 0) return `in ${n} day${n === 1 ? "" : "s"}`;
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
      const da = a.nextBill ? daysUntilNext(a) : Infinity;
      const db = b.nextBill ? daysUntilNext(b) : Infinity;
      return da - db;
    });
  }, [subs]);

  const nextUp = sorted.find((s) => s.nextBill && daysUntilNext(s) >= 0 && daysUntilNext(s) <= 31);

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
          <span className="ml-auto font-mono text-muted">{relDays(daysUntilNext(nextUp))}</span>
        </div>
      )}

      <ul className="space-y-1.5">
        {sorted.map((s) => {
          const d = s.nextBill ? daysUntilNext(s) : null;
          const billDate = s.nextBill ? nextBillDate(s.nextBill, s.cycle) : null;
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
                  {s.nextBill && billDate ? (
                    <>
                      <span>{format(new Date(billDate + "T00:00:00"), "MMM d")}</span>
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
              {/* Capped column height — a long Applied list scrolls inside its
                  own lane instead of stretching the whole card down the page. */}
              <ul className="space-y-2 min-h-[44px] max-h-[340px] overflow-y-auto pr-0.5 [scrollbar-width:thin]">
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
const CPA_PCT: Record<CpaStatus, number> = {
  "Not started": 4, Studying: 45, Scheduled: 72, Passed: 100, Failed: 28,
};
const CPA_NAMES: Record<CpaSection, string> = {
  AUD: "Auditing & Attestation",
  FAR: "Financial Acct. & Reporting",
  REG: "Taxation & Regulation",
  TCP: "Tax Compliance & Planning",
};

function ProgressRing({ value, max, size = 72 }: { value: number; max: number; size?: number }) {
  const sw = 6;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <defs>
        <linearGradient id="cpaRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--grad-from)" />
          <stop offset="50%" stopColor="var(--grad-via)" />
          <stop offset="100%" stopColor="var(--grad-to)" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth={sw} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#cpaRing)" strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .6s ease" }}
      />
    </svg>
  );
}

function CpaSectionCard({ sec, e, update }: {
  sec: CpaSection; e: CpaEntry; update: (sec: CpaSection, patch: Partial<CpaEntry>) => void;
}) {
  const passed = e.status === "Passed";
  const tone = CPA_TONE[e.status];
  const days = e.examDate ? daysUntil(e.examDate) : null;
  const upcoming = !passed && days != null && days >= 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-3.5 pl-4 transition hover:border-[var(--rule)]">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: tone }} aria-hidden />

      <div className="flex items-center gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl font-display text-[13px]"
          style={passed
            ? { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))", color: "#fff", boxShadow: "0 6px 16px -8px var(--glow)" }
            : { background: "var(--rule-soft)", color: "var(--ink)" }}
        >
          {passed ? <Check className="h-5 w-5" strokeWidth={2.5} /> : sec}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] text-ink leading-none">{sec}</div>
          <div className="mt-1 truncate text-[10.5px] text-muted">{CPA_NAMES[sec]}</div>
        </div>
        <div className="relative shrink-0">
          <select
            value={e.status}
            onChange={(ev) => update(sec, { status: ev.target.value as CpaStatus })}
            className="appearance-none cursor-pointer rounded-full border border-transparent bg-[var(--rule-soft)] py-1 pl-2.5 pr-6 text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={{ color: tone }}
            aria-label={`${sec} status`}
          >
            {CPA_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <ChevronDownInline />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="block">
          <span className="flex items-center gap-1 label !text-[8.5px]"><Clock className="h-2.5 w-2.5" />Hours</span>
          <input type="number" value={e.hours === 0 ? "" : e.hours} placeholder="0"
            onChange={(ev) => update(sec, { hours: Number(ev.target.value) || 0 })}
            className="mt-1 w-full bg-[var(--rule-soft)] rounded-lg px-2 py-1.5 font-mono tabular-nums text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
        </label>
        <label className="block">
          <span className="flex items-center gap-1 label !text-[8.5px]"><CalendarDays className="h-2.5 w-2.5" />Exam</span>
          <input type="date" value={e.examDate}
            onChange={(ev) => update(sec, { examDate: ev.target.value })}
            className="mt-1 w-full bg-[var(--rule-soft)] rounded-lg px-2 py-1.5 font-mono text-[11px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        </label>
        <label className="block">
          <span className="flex items-center gap-1 label !text-[8.5px]"><Award className="h-2.5 w-2.5" />Score</span>
          <input value={e.score} placeholder="—" maxLength={3} inputMode="numeric"
            onChange={(ev) => update(sec, { score: ev.target.value.replace(/[^0-9]/g, "") })}
            className="mt-1 w-full bg-[var(--rule-soft)] rounded-lg px-2 py-1.5 font-mono tabular-nums text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-[var(--rule)] overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${CPA_PCT[e.status]}%`, background: passed ? "linear-gradient(90deg, var(--grad-from), var(--grad-via), var(--grad-to))" : tone }} />
        </div>
        {upcoming && (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-accent shrink-0">
            <CalendarClock className="h-3 w-3" />{days === 0 ? "today" : `${days}d`}
          </span>
        )}
        {passed && e.score && (
          <span className="font-mono text-[10px] text-up shrink-0">scored {e.score}</span>
        )}
      </div>
    </div>
  );
}

function ChevronDownInline() {
  return (
    <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

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
  // Single column beside another card; 2-up at full width.
  const gridCls = compact ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-3";

  // Soonest upcoming exam across not-yet-passed sections.
  const nextExam = CPA_SECTIONS
    .map((s) => ({ sec: s, date: cpa[s]?.examDate, status: cpa[s]?.status }))
    .filter((x) => x.date && x.status !== "Passed" && daysUntil(x.date!) >= 0)
    .map((x) => ({ sec: x.sec, days: daysUntil(x.date!) }))
    .sort((a, b) => a.days - b.days)[0];

  return (
    <div className="space-y-4">
      {/* hero: ring + headline + study/next-exam meta */}
      <div className="flex items-center gap-4">
        <div className="relative grid place-items-center">
          <ProgressRing value={passed} max={4} size={72} />
          <div className="absolute inset-0 grid place-items-center">
            <div className="font-display text-xl text-ink leading-none">
              {passed}<span className="text-muted text-sm">/4</span>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink">
            {passed === 4 ? "All four passed 🎉" : `${4 - passed} section${4 - passed > 1 ? "s" : ""} to go`}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{totalHours.toLocaleString()} hrs studied</span>
            {nextExam && (
              <span className="inline-flex items-center gap-1 text-accent">
                <CalendarClock className="h-3 w-3" />{nextExam.sec} {nextExam.days === 0 ? "today" : `in ${nextExam.days}d`}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={gridCls}>
        {CPA_SECTIONS.map((sec) => (
          <CpaSectionCard key={sec} sec={sec} e={cpa[sec]} update={update} />
        ))}
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
  const [hidden] = usePref<boolean>("hub.netWorth.hidden", false);

  const surplus = income.reduce((s, x) => s + x.amount, 0) - expenses.reduce((s, x) => s + x.amount, 0);
  const netWorth = investments.reduce((s, x) => s + x.amount, 0) - debts.reduce((s, x) => s + x.amount, 0);
  const subMonthly = subs.reduce((s, x) => s + (x.cycle === "yr" ? x.amount / 12 : x.amount), 0);
  const $ = (n: number) => (hidden ? "$•••" : money(n));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Kpi label="Net worth" value={$(netWorth)} tone={netWorth >= 0 ? "up" : "down"} />
      <Kpi label="Surplus / mo" value={$(surplus)} tone={surplus >= 0 ? "up" : "down"} />
      <Kpi label="Subs / mo" value={$(subMonthly)} tone={subMonthly > 0 ? "down" : undefined} />
    </div>
  );
}

// =====================  CPA VIDEO  ==========================================
//
// Daily pick from a curated set of YouTube channels (Logan Graf + KPMG US
// Careers). The /api/cpa-video route resolves each handle, pulls uploads,
// interleaves them, and returns a per-day seed index so the pick is stable
// through the day and rotates at midnight.

interface CpaVideo {
  id: string; title: string; published: string; thumb: string;
  channel: string; channelLabel: string; channelUrl: string;
}
interface CpaVideoResp {
  videos?: CpaVideo[];
  seed?: number;
  channels?: Array<{ handle: string; label: string }>;
  error?: string;
}
interface YtComment { author: string; text: string; likes: number; time: string }
interface YtCommentsResp { comments?: YtComment[] }

const CHANNEL_TONE: Record<string, string> = {
  logangrafcpa:  "var(--grad-via)",
  KPMGusCareers: "var(--grad-from)",
};

const jsonFetcher = (url: string) => fetch(url).then((r) => r.json());

const AV_PALETTE = ["var(--grad-from)", "var(--grad-via)", "var(--grad-to)", "var(--accent)", "var(--accent-2)", "var(--up)"];
function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV_PALETTE[h % AV_PALETTE.length];
}

function VideoComments({ videoId }: { videoId: string }) {
  const { data, isLoading } = useSWR<YtCommentsResp>(`/api/yt-comments?v=${videoId}`, jsonFetcher, {
    revalidateOnFocus: false,
  });
  const comments = data?.comments ?? [];
  const [i, setI] = useState(0);
  // New video → reset to the first comment.
  useEffect(() => { setI(0); }, [videoId]);
  const safeI = comments.length ? Math.min(i, comments.length - 1) : 0;
  const c = comments[safeI];

  return (
    // Fixed-height block — one comment at a time, paged with the arrows, so
    // the card can never grow with the number of comments.
    <div className="border-t rule pt-3 mt-1 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="label !text-[9px] !tracking-[0.12em] flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" /> Top comments
        </span>
        {comments.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tabular-nums text-muted-2">{safeI + 1}/{comments.length}</span>
            <button
              onClick={() => setI((n) => (n - 1 + comments.length) % comments.length)}
              disabled={comments.length < 2}
              aria-label="Previous comment"
              className="text-muted hover:text-accent disabled:opacity-30 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setI((n) => (n + 1) % comments.length)}
              disabled={comments.length < 2}
              aria-label="Next comment"
              className="text-muted hover:text-accent disabled:opacity-30 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {isLoading && <p className="text-[12px] text-muted italic h-[88px]">Loading comments…</p>}
      {!isLoading && comments.length === 0 && (
        <p className="text-[12px] text-muted-2 italic h-[88px]">No comments on this video.</p>
      )}
      {c && (
        <div className="flex gap-2.5 h-[88px]">
          <span
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white"
            style={{ background: avatarColor(c.author) }}
          >
            {(c.author || "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12.5px] font-medium text-ink truncate">{c.author || "anon"}</span>
              {c.time && <span className="text-[10px] text-muted-2 shrink-0">{c.time}</span>}
              {c.likes > 0 && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted shrink-0">
                  <ArrowUp className="h-3 w-3" />{c.likes.toLocaleString()}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[12.5px] text-ink-soft leading-snug break-words overflow-y-auto pr-1">
              {c.text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CpaVideoSection() {
  const dateKey = useDailyKey();
  const { data, isLoading } = useSWR<CpaVideoResp>(
    `/api/cpa-video?d=${dateKey}`,
    jsonFetcher,
    { refreshInterval: 1000 * 60 * 60 * 6, keepPreviousData: true },
  );

  const videos = useMemo(() => data?.videos ?? [], [data]);

  // A shuffled choice persists (synced) for the rest of the day, so a page
  // refresh or SWR revalidation keeps the video you picked instead of
  // snapping back to the daily seed. Falls back to the per-day seed when
  // nothing's been picked today.
  const [pick, setPick] = usePref<{ date: string; id: string } | null>("hub.cpaVideo.pick", null);
  const [playing, setPlaying] = useState(false);

  const idx = useMemo(() => {
    if (!videos.length) return 0;
    if (pick && pick.date === dateKey) {
      const i = videos.findIndex((v) => v.id === pick.id);
      if (i >= 0) return i;
    }
    return ((data?.seed ?? 0) % videos.length + videos.length) % videos.length;
  }, [videos, pick, dateKey, data?.seed]);

  const cur = videos[idx];
  const thumb = cur ? cur.thumb || `https://i.ytimg.com/vi/${cur.id}/hqdefault.jpg` : "";

  // Whenever the shown video changes (new day, shuffle), drop back to the
  // poster rather than auto-playing the wrong clip.
  useEffect(() => { setPlaying(false); }, [cur?.id]);

  // Remember the last several picks so shuffle doesn't repeat a video until
  // most of the catalogue has been seen — "random, indefinitely" without
  // the obvious short loops.
  const recentRef = useRef<number[]>([]);
  function shuffle() {
    if (videos.length < 2) return;
    const recent = recentRef.current;
    let pool = videos.map((_, i) => i).filter((i) => i !== idx && !recent.includes(i));
    if (pool.length === 0) pool = videos.map((_, i) => i).filter((i) => i !== idx);
    const n = pool[Math.floor(Math.random() * pool.length)];
    recentRef.current = [...recent, n].slice(-Math.min(videos.length - 1, 12));
    setPick({ date: dateKey, id: videos[n].id });
  }

  const channelUrl = cur?.channelUrl ?? "https://www.youtube.com/@logangrafcpa/videos";
  const channelLabel = cur?.channelLabel ?? "CPA video";
  const channelTone = cur ? (CHANNEL_TONE[cur.channel] ?? "var(--accent)") : "var(--accent)";

  return (
    // h-full + flex column + overflow-hidden bounds the card to the row's
    // stretched height (set by items-stretch from the sibling card). Comments
    // fill what's left and scroll internally — the card itself can never
    // grow taller than the row.
    <div className="flex flex-col gap-3 h-full min-h-0 overflow-hidden">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)] shrink-0">
        {isLoading && !cur && (
          <div className="absolute inset-0 grid place-items-center text-[12px] text-muted">Loading videos…</div>
        )}
        {!isLoading && !cur && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-[12px] text-muted">
            <a href={channelUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
              <PlayCircle className="h-4 w-4" /> Open the channel on YouTube
            </a>
          </div>
        )}
        {!playing && cur && (
          <button onClick={() => setPlaying(true)} aria-label="Play this video" className="absolute inset-0 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt={cur.title} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/10 to-transparent" />
            {/* Channel chip pinned to the corner — tells you whose video it is at a glance. */}
            <span
              className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md"
              style={{ background: `color-mix(in srgb, ${channelTone} 70%, rgba(0,0,0,0.45))` }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white/90" /> {channelLabel}
            </span>
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white/95 text-black shadow-lg transition group-hover:scale-110">
                <PlayCircle className="h-9 w-9" strokeWidth={1.5} />
              </span>
            </span>
          </button>
        )}
        {playing && cur && (
          <iframe
            key={cur.id}
            src={`https://www.youtube.com/embed/${cur.id}?autoplay=1&rel=0&modestbranding=1`}
            title={cur.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        )}
      </div>

      <div className="flex items-start gap-2 shrink-0">
        <div className="min-w-0 flex-1">
          <a
            href={channelUrl}
            target="_blank"
            rel="noreferrer"
            title={cur?.title || channelLabel}
            className="group block text-[13.5px] font-medium text-ink-soft hover:text-accent transition leading-snug line-clamp-2"
          >
            {cur?.title || `${channelLabel} — videos`}
            <span className="ml-1 inline-block align-text-bottom opacity-0 group-hover:opacity-100 transition">
              <ExternalLink className="h-3 w-3 inline" />
            </span>
          </a>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: channelTone }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: channelTone }} />
              {channelLabel}
            </span>
            {videos.length > 0 && <span>· {idx + 1}/{videos.length}</span>}
          </div>
        </div>
        <button
          onClick={shuffle}
          disabled={videos.length < 2}
          title="Show another video"
          aria-label="Show another video"
          className="btn-ghost !h-8 !w-8 shrink-0 disabled:opacity-40"
        >
          <Shuffle className="h-4 w-4" />
        </button>
      </div>

      {cur && <VideoComments videoId={cur.id} />}
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

// =====================  REDDIT COMMUNITY FEED  =============================
//
// r/CPA + r/Accounting "hot", merged and ranked by score. Backed by the
// resilient /api/reddit route. A manual refresh re-pulls on demand.

interface RedditPost {
  id: string; title: string; subreddit: string; permalink: string;
  score: number; ratio: number; comments: number; created: number;
  flair: string | null; author: string; image: string | null;
}
interface RedditResp { posts?: RedditPost[]; subs?: string[] }

const SUB_TONE: Record<string, string> = {
  cpa: "var(--accent)",
  accounting: "var(--grad-to)",
  big4: "var(--grad-from)",
  tax: "var(--grad-via)",
  bookkeeping: "var(--up)",
};
function toneFor(sub: string): string {
  return SUB_TONE[sub.toLowerCase()] ?? "var(--muted)";
}

function compactNum(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}
function sinceMs(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d`;
  return format(new Date(ms), "MMM d");
}

const REDDIT_PAGE = 6; // posts shown per rotation window

// Cache-bust fetcher: the route is now force-dynamic and cache: no-store,
// but the BROWSER may still cache. cache: "reload" + a Date.now() in the URL
// nukes every layer of caching between the button and the upstream Reddit.
const noStoreFetcher = (url: string) =>
  fetch(url, { cache: "reload", headers: { "Cache-Control": "no-cache" } })
    .then((r) => r.json());

export function RedditFeedSection() {
  // A nonce changes the SWR key so it can't dedupe with a previous response,
  // and `n=Date.now()` also defeats any browser/CDN cache between us and the
  // route handler. Set it on click — refresh truly re-fetches.
  const [nonce, setNonce] = useState(0);
  const key = nonce ? `/api/reddit?n=${nonce}` : "/api/reddit";
  const { data, error, isLoading, isValidating, mutate } = useSWR<RedditResp>(
    key,
    noStoreFetcher,
    { refreshInterval: 1000 * 60 * 15, keepPreviousData: true, revalidateOnFocus: false },
  );
  const [sub, setSub] = useState<string>("all");
  // Rotation offset so the refresh button visibly cycles through the deep
  // pool even when the top-of-week data itself hasn't changed.
  const [offset, setOffset] = useState(0);

  function refresh() {
    setNonce(Date.now());             // genuinely re-pull (cache-busted)
    setOffset((o) => o + REDDIT_PAGE); // …and rotate the visible window
    mutate();
  }
  // Reset the rotation whenever you switch subreddits.
  useEffect(() => { setOffset(0); }, [sub]);

  const all = useMemo(() => data?.posts ?? [], [data]);
  const subList = useMemo(
    () => data?.subs ?? Array.from(new Set(all.map((p) => p.subreddit))),
    [data, all],
  );
  const posts = useMemo(() => {
    const pool = sub === "all" ? all : all.filter((p) => p.subreddit.toLowerCase() === sub.toLowerCase());
    if (pool.length === 0) return pool;
    const start = offset % pool.length;
    const rotated = [...pool.slice(start), ...pool.slice(0, start)];
    return rotated.slice(0, REDDIT_PAGE);
  }, [all, sub, offset]);

  // Freshness indicator (matches the Card pill on the dashboard widgets).
  const updatedAt = useFreshAt(data);
  const redditAgo = (() => {
    if (!updatedAt) return isValidating ? "updating" : "";
    const m = Math.floor((Date.now() - updatedAt) / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {["all", ...subList].map((key) => {
          const on = sub === key;
          return (
            <button
              key={key}
              onClick={() => setSub(key)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition ${on ? "border-transparent text-white" : "border-[var(--rule)] text-muted hover:text-ink"}`}
              style={on ? { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" } : undefined}
            >
              {key === "all" ? "All" : `r/${key}`}
            </button>
          );
        })}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-muted-2" title="Last updated">
          {error ? (
            <span className="text-down">failed</span>
          ) : (
            <>
              <span className={`h-1.5 w-1.5 rounded-full ${isValidating ? "bg-accent animate-pulse" : "bg-[var(--up)]"}`} />
              {redditAgo}
            </>
          )}
        </span>
        <button
          onClick={refresh}
          disabled={isValidating}
          className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent transition disabled:opacity-40"
          title="Refresh top posts"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isValidating ? "animate-spin" : ""}`} /> refresh
        </button>
      </div>

      {isLoading && all.length === 0 && (
        <p className="text-muted text-sm italic">Loading the community…</p>
      )}
      {error && all.length === 0 && (
        <p className="text-down text-sm">Couldn&rsquo;t reach Reddit right now.</p>
      )}

      <ul className="divide-rule">
        {posts.map((p) => {
          const tone = toneFor(p.subreddit);
          return (
            <li key={p.id}>
              <a href={p.permalink} target="_blank" rel="noreferrer" className="group flex items-start gap-3 py-3">
                <span className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ background: tone }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] leading-snug text-ink group-hover:text-accent transition line-clamp-2">
                    {p.title}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
                    <span className="font-semibold" style={{ color: tone }}>r/{p.subreddit}</span>
                    {p.flair && (
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: tone, background: "var(--rule-soft)" }}>
                        {p.flair}
                      </span>
                    )}
                    <span>{sinceMs(p.created)}</span>
                    {p.score > 0 && (
                      <span className="inline-flex items-center gap-1"><ArrowUp className="h-3 w-3" />{compactNum(p.score)}{p.ratio > 0 ? ` · ${Math.round(p.ratio * 100)}%` : ""}</span>
                    )}
                    {p.comments > 0 && (
                      <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{compactNum(p.comments)}</span>
                    )}
                  </div>
                </div>
                <ExternalLink className="mt-1 h-3.5 w-3.5 text-muted-2 opacity-0 group-hover:opacity-100 transition shrink-0" />
              </a>
            </li>
          );
        })}
        {!isLoading && posts.length === 0 && !error && (
          <li className="text-muted text-sm italic py-2">Nothing here right now.</li>
        )}
      </ul>

      <div className="pt-1 font-mono text-[9px] uppercase tracking-wider text-muted">
        Top of the week across {subList.length} accounting subs · opens on reddit.com
      </div>
    </div>
  );
}

// Backward-compat icon export so the masthead pill can use it.
export { Briefcase as AccountingIcon, Repeat as SubscriptionsIcon };
