"use client";

import { useState, type ReactNode } from "react";
import {
  Plus, Trash2, ChevronLeft, ChevronRight, X,
  TrendingUp, TrendingDown, Briefcase, GraduationCap,
  Landmark, CreditCard,
} from "lucide-react";
import { usePref } from "@/components/PrefsProvider";

// =============================================================================
//   Accounting toolkit — three focused widgets the user opens on their own
//   "Accounting" page (separate route, not a popup). All state lives in the
//   synced prefs blob so everything follows the user across devices.
//
//   Sections:
//     • Cash Flow   — monthly income/expenses → surplus + savings rate
//     • Applications — recruiting kanban (Big-4 internships, etc.)
//     • CPA         — AUD/FAR/REG/TCP with status, hours, exam date, score
// =============================================================================

const uid = () => Math.random().toString(36).slice(2, 9);
const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

interface LineItem { id: string; label: string; amount: number }
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

function TextInput({ value, onChange, placeholder, className = "" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-[var(--rule-soft)] rounded-lg px-2.5 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2 ${className}`}
    />
  );
}

function BigStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="text-center">
      <div className="label mb-1.5">{label}</div>
      <div className={`font-display text-4xl md:text-5xl tracking-tight ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}>
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
        <TextInput value={label} onChange={setLabel} placeholder={`Add ${title.toLowerCase()}…`} className="flex-1 min-w-0" />
        <NumberInput value={amount} prefix="$" onChange={setAmount} />
        <button onClick={add} className="btn-ghost !h-8 !w-8 shrink-0" aria-label="Add"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// ---------- exported sections (consumed by /accounting page) ----------------

export function CashFlowSection() {
  const [income, setIncome] = usePref<LineItem[]>("hub.income", []);
  const [expenses, setExpenses] = usePref<LineItem[]>("hub.expenses", []);
  const [investments, setInvestments] = usePref<LineItem[]>("hub.investments", []);
  const [debts, setDebts] = usePref<LineItem[]>("hub.debts", []);
  const inc = income.reduce((s, x) => s + x.amount, 0);
  const exp = expenses.reduce((s, x) => s + x.amount, 0);
  const surplus = inc - exp;
  const rate = inc > 0 ? Math.round((surplus / inc) * 100) : 0;
  const invTotal = investments.reduce((s, x) => s + x.amount, 0);
  const debtTotal = debts.reduce((s, x) => s + x.amount, 0);
  const netWorth = invTotal - debtTotal;
  const debtRatio = invTotal > 0 ? `${Math.round((debtTotal / invTotal) * 100)}%` : debtTotal > 0 ? "∞" : "0%";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <BigStat label="Monthly surplus" value={money(surplus)} tone={surplus >= 0 ? "up" : "down"} />
        <BigStat label="Savings rate" value={`${rate}%`} sub={`${money(inc)} in · ${money(exp)} out`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MoneyList title="Monthly income" icon={<TrendingUp className="h-4 w-4" />} items={income} setItems={setIncome} />
        <MoneyList title="Monthly expenses" icon={<TrendingDown className="h-4 w-4" />} items={expenses} setItems={setExpenses} accentDown />
      </div>

      <div className="border-t rule pt-5 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <BigStat
            label="Net worth"
            value={money(netWorth)}
            tone={netWorth >= 0 ? "up" : "down"}
            sub={`${money(invTotal)} assets · ${money(debtTotal)} debt`}
          />
          <BigStat label="Debt-to-asset" value={debtRatio} sub={debtTotal === 0 ? "debt-free" : invTotal === 0 ? "no assets yet" : "of total assets"} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MoneyList title="Investments & assets" icon={<Landmark className="h-4 w-4" />} items={investments} setItems={setInvestments} />
          <MoneyList title="Debt & liabilities" icon={<CreditCard className="h-4 w-4" />} items={debts} setItems={setDebts} accentDown />
        </div>
      </div>
    </div>
  );
}

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
        <TextInput value={company} onChange={setCompany} placeholder="Company (e.g. Deloitte)" className="flex-1 min-w-[140px]" />
        <TextInput value={role} onChange={setRole} placeholder="Role (e.g. Audit Intern)" className="flex-1 min-w-[140px]" />
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

const CPA_TONE: Record<CpaStatus, string> = {
  "Not started": "var(--muted-2)",
  Studying: "#d97706",
  Scheduled: "var(--accent)",
  Passed: "var(--up)",
  Failed: "var(--down)",
};

export function CpaSection() {
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <BigStat label="Sections passed" value={`${passed} / 4`} tone={passed === 4 ? "up" : undefined} />
        <BigStat label="Study hours logged" value={totalHours.toLocaleString()} sub="across all sections" />
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--rule)] overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${(passed / 4) * 100}%`, background: "linear-gradient(90deg, var(--grad-from), var(--grad-via), var(--grad-to))" }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

// Backward-compat icon export so the masthead pill can use it.
export { Briefcase as AccountingIcon };
