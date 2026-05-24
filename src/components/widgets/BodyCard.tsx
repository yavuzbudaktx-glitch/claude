"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Plus } from "lucide-react";
import { Card } from "@/components/Card";
import { localDateKey } from "@/lib/local-date";
import { createClient } from "@/lib/supabase/client";
import { usePref } from "@/components/PrefsProvider";

const HABITS = ["Water", "Steps", "Reading"];

function HabitTracker() {
  const [habits, setHabits] = usePref<Record<string, string[]>>("habits", {});
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return localDateKey(d);
  });
  const dayLabel = (key: string) => {
    const [y, m, dd] = key.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: "narrow" });
  };
  function toggle(habit: string, date: string) {
    const cur = habits[habit] ?? [];
    const next = cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date];
    setHabits({ ...habits, [habit]: next });
  }
  return (
    <div className="mt-5 pt-4 border-t rule">
      <div className="label mb-3">Habits · last 7 days</div>
      <div className="flex items-center gap-3 mb-1.5">
        <span className="w-20 shrink-0" />
        <div className="flex items-center gap-2">
          {days.map((d) => (
            <span key={d} className="w-6 text-center text-[9px] text-muted-2 uppercase">{dayLabel(d)}</span>
          ))}
        </div>
      </div>
      {HABITS.map((h) => (
        <div key={h} className="flex items-center gap-3 mb-2">
          <span className="text-[13px] text-ink-soft w-20 shrink-0">{h}</span>
          <div className="flex items-center gap-2">
            {days.map((d) => {
              const on = (habits[h] ?? []).includes(d);
              const isToday = d === days[6];
              return (
                <button
                  key={d}
                  onClick={() => toggle(h, d)}
                  title={d}
                  aria-label={`${h} ${d}`}
                  className={`h-6 w-6 rounded-full border transition ${
                    on ? "border-transparent" : isToday ? "border-[var(--accent)]" : "border-[var(--rule)] hover:border-[var(--ink-soft)]"
                  }`}
                  style={on ? { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" } : undefined}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
//   Body — weight tracker (dial + progress graph), a daily calorie goal with
//   an intake counter, and a two-day workout plan. Persisted per-device in
//   localStorage and synced across devices via Supabase when signed in.
// ============================================================================

interface WeightEntry { date: string; weight: number }
interface BodyState {
  entries: WeightEntry[];
  calorieGoal: string;
  workoutA: string;
  workoutB: string;
  calsDate: string;   // localDateKey the calsTotal applies to
  calsTotal: number;  // calories logged "today"
}

const KEY = "morning.body.v1";
const DEFAULT: BodyState = { entries: [], calorieGoal: "", workoutA: "", workoutB: "", calsDate: "", calsTotal: 0 };
const STEP = 0.2;
const SEED_WEIGHT = 180;

function coerce(raw: unknown): BodyState {
  const o = (raw ?? {}) as Record<string, unknown>;
  const entriesRaw = Array.isArray(o.entries) ? o.entries : [];
  const entries = entriesRaw.filter(
    (e): e is WeightEntry =>
      !!e && typeof (e as WeightEntry).weight === "number" && typeof (e as WeightEntry).date === "string",
  );
  return {
    entries,
    calorieGoal: typeof o.calorieGoal === "string" ? o.calorieGoal : "",
    workoutA: typeof o.workoutA === "string" ? o.workoutA : "",
    workoutB: typeof o.workoutB === "string" ? o.workoutB : "",
    calsDate: typeof o.calsDate === "string" ? o.calsDate : "",
    calsTotal: typeof o.calsTotal === "number" ? o.calsTotal : 0,
  };
}

function loadLocal(): BodyState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? coerce(JSON.parse(raw)) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

// Compact Catmull-Rom → Bézier smooth path (mirrors the Sparkline helper).
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]},${pts[0][1]}` : "";
  let d = `M ${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

function fmtDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function WeightChart({ entries }: { entries: WeightEntry[] }) {
  // Measure the container so the SVG viewBox maps 1:1 to pixels — that keeps
  // the dots perfectly round and the stroke crisp at any width.
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => {
      const cw = es[0]?.contentRect.width;
      if (cw) setW(Math.max(160, Math.round(cw)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 150;
  const padX = 12;
  const padTop = 16;
  const padBot = 14;

  if (entries.length === 0) {
    return (
      <div
        ref={ref}
        className="h-[176px] rounded-xl border border-[var(--rule-soft)] flex items-center justify-center text-muted text-xs italic px-4 text-center"
      >
        Set your weight with the arrows or by typing — your progress graph builds from here.
      </div>
    );
  }

  const weights = entries.map((e) => e.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const n = entries.length;
  const xAt = (i: number) => (n === 1 ? w / 2 : padX + (i / (n - 1)) * (w - 2 * padX));
  const yAt = (val: number) =>
    n === 1 ? padTop + (H - padTop - padBot) / 2 : padTop + (1 - (val - min) / range) * (H - padTop - padBot);
  const pts = entries.map((e, i) => [xAt(i), yAt(e.weight)] as [number, number]);
  const line = smoothPath(pts);
  const area = n >= 2 ? `${line} L ${xAt(n - 1).toFixed(2)},${H - padBot} L ${xAt(0).toFixed(2)},${H - padBot} Z` : "";
  const last = pts[n - 1];

  return (
    <div ref={ref} className="min-w-0">
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} className="block">
        <defs>
          <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {n >= 2 && <path d={area} fill="url(#weightFill)" />}
        {n >= 2 && (
          <path
            d={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {n >= 2 && <circle cx={pts[0][0]} cy={pts[0][1]} r="2.5" fill="var(--accent)" opacity="0.45" />}
        <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--accent)" />
        <circle cx={last[0]} cy={last[1]} r="8" fill="var(--accent)" opacity="0.18" />
      </svg>
      <div className="flex justify-between mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted">
        <span>{fmtDate(entries[0].date)}</span>
        <span>{min.toFixed(1)}{min !== max ? `–${max.toFixed(1)}` : ""} lbs</span>
        <span>{fmtDate(entries[n - 1].date)}</span>
      </div>
    </div>
  );
}

export function BodyCard() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<BodyState>(DEFAULT);
  const [userId, setUserId] = useState<string | null>(null);
  const hydrated = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [calDraft, setCalDraft] = useState("");

  // Load: prefer the signed-in Supabase row (cross-device), else localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data, error } = await supabase
          .from("body_profile")
          .select("data")
          .eq("user_id", uid)
          .maybeSingle();
        if (cancelled) return;
        if (!error && data?.data) setState(coerce(data.data));
        else setState(loadLocal());
      } else {
        setState(loadLocal());
      }
      hydrated.current = true;
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // Persist: mirror to localStorage immediately; debounce the Supabase upsert.
  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    if (!userId) return;
    const t = setTimeout(() => {
      supabase
        .from("body_profile")
        .upsert({ user_id: userId, data: state, updated_at: new Date().toISOString() })
        .then(() => {}, () => {});
    }, 600);
    return () => clearTimeout(t);
  }, [state, userId, supabase]);

  const entries = state.entries;
  const current = entries.length ? entries[entries.length - 1].weight : null;
  const first = entries.length ? entries[0].weight : null;
  const deltaSinceStart = current != null && first != null ? current - first : null;

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(current != null ? String(current) : "");
    }
  }, [current]);

  function setToday(wt: number) {
    const weight = Math.max(50, Math.min(700, Math.round(wt * 10) / 10));
    setState((prev) => {
      const today = localDateKey();
      const others = prev.entries.filter((e) => e.date !== today);
      const next = [...others, { date: today, weight }].sort((a, b) => a.date.localeCompare(b.date));
      return { ...prev, entries: next };
    });
  }
  function adjust(delta: number) { setToday((current ?? SEED_WEIGHT) + delta); }
  function commitDraft() {
    const v = Number(draft);
    if (Number.isFinite(v) && v > 0) setToday(v);
    else setDraft(current != null ? String(current) : "");
  }

  const today = localDateKey();
  const calsToday = state.calsDate === today ? state.calsTotal : 0;
  const goalNum = Number(state.calorieGoal);
  const hasGoal = Number.isFinite(goalNum) && goalNum > 0;
  const calPct = hasGoal ? Math.min(100, (calsToday / goalNum) * 100) : 0;

  function addCals(e: React.FormEvent) {
    e.preventDefault();
    const raw = calDraft.trim();
    if (!raw) return;
    const sign = raw.startsWith("-") ? -1 : 1;
    const num = Math.abs(parseInt(raw.replace(/[^0-9]/g, ""), 10));
    if (Number.isFinite(num) && num !== 0) {
      setState((prev) => {
        const base = prev.calsDate === today ? prev.calsTotal : 0;
        return { ...prev, calsDate: today, calsTotal: Math.max(0, base + sign * num) };
      });
    }
    setCalDraft("");
  }

  const fieldClass =
    "w-full rounded-xl px-3 py-2 text-[13px] leading-relaxed text-ink resize-y transition " +
    "bg-[var(--rule-soft)] border border-transparent opacity-75 placeholder:text-muted-2 " +
    "hover:opacity-100 focus:opacity-100 focus:bg-[var(--paper)] focus:border-[var(--accent)] focus:outline-none";

  return (
    <Card num="09" title="Body · Weight & Training">
      <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-6 items-center">
        {/* Weight dial + arrows */}
        <div className="flex items-center justify-center gap-3">
          <div
            className="relative h-[150px] w-[150px] rounded-full flex flex-col items-center justify-center bg-[var(--paper)] border border-[var(--glass-border)]"
            style={{ boxShadow: "inset 0 0 0 4px var(--accent-soft), 0 0 28px -10px var(--glow)" }}
          >
            <input
              ref={inputRef}
              type="number"
              inputMode="decimal"
              step={STEP}
              value={draft}
              placeholder={String(SEED_WEIGHT)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => { if (e.key === "Enter") inputRef.current?.blur(); }}
              className="w-[120px] bg-transparent text-center font-display text-[38px] leading-none text-ink focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              aria-label="Current weight"
            />
            <span className="label mt-1">lbs</span>
            {deltaSinceStart != null && Math.abs(deltaSinceStart) >= 0.05 && (
              <span className="mt-1 font-mono text-[10px] text-muted">
                {deltaSinceStart > 0 ? "+" : "−"}{Math.abs(deltaSinceStart).toFixed(1)} since start
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => adjust(STEP)} aria-label="Increase weight" className="btn-ghost !h-10 !w-10">
              <ChevronUp className="h-5 w-5" />
            </button>
            <button onClick={() => adjust(-STEP)} aria-label="Decrease weight" className="btn-ghost !h-10 !w-10">
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress graph */}
        <WeightChart entries={entries} />
      </div>

      <div className="mt-5 pt-4 border-t rule grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Calorie goal + today's intake */}
        <div>
          <div className="label mb-2">Daily calorie goal</div>
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={state.calorieGoal}
              placeholder="2200"
              onChange={(e) => setState((s) => ({ ...s, calorieGoal: e.target.value }))}
              className="w-24 bg-transparent border-b border-[var(--rule)] focus:border-[var(--accent)] focus:outline-none font-mono tabular-nums text-2xl text-ink pb-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">kcal / day</span>
          </div>

          <div className="label mb-1.5 mt-4">Today&rsquo;s intake</div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular-nums text-2xl text-ink">{calsToday.toLocaleString()}</span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                {hasGoal ? `${Math.max(0, goalNum - calsToday).toLocaleString()} left` : "kcal"}
              </span>
            </div>
            <form onSubmit={addCals} className="flex items-center gap-1.5 ml-auto">
              <input
                value={calDraft}
                onChange={(e) => setCalDraft(e.target.value)}
                placeholder="+ 250"
                inputMode="numeric"
                className="w-20 bg-[var(--rule-soft)] rounded-lg px-2.5 py-1.5 font-mono tabular-nums text-[13px] text-ink focus:outline-none focus:bg-[var(--paper)] focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2"
                aria-label="Add calories"
              />
              <button type="submit" className="btn-ghost !h-8 !w-8" aria-label="Add to today's intake">
                <Plus className="h-4 w-4" />
              </button>
            </form>
          </div>
          {hasGoal && (
            <div className="h-1.5 w-full rounded-full bg-[var(--rule)] overflow-hidden mt-2.5">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${calPct}%`,
                  background: "linear-gradient(90deg, var(--grad-from), var(--grad-via), var(--grad-to))",
                }}
              />
            </div>
          )}
        </div>

        <div>
          <div className="label mb-2">Workout · Day A</div>
          <textarea
            value={state.workoutA}
            placeholder={"e.g.\nBench 4×8\nRows 4×10\nOHP 3×10"}
            onChange={(e) => setState((s) => ({ ...s, workoutA: e.target.value }))}
            rows={5}
            className={fieldClass}
          />
        </div>

        <div>
          <div className="label mb-2">Workout · Day B</div>
          <textarea
            value={state.workoutB}
            placeholder={"e.g.\nSquat 4×6\nDeadlift 3×5\nCurls 3×12"}
            onChange={(e) => setState((s) => ({ ...s, workoutB: e.target.value }))}
            rows={5}
            className={fieldClass}
          />
        </div>
      </div>

      <HabitTracker />
    </Card>
  );
}
