"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Card } from "@/components/Card";
import { localDateKey } from "@/lib/local-date";

// ============================================================================
//   Body — a personal weight tracker (current weight dial + progress graph)
//   plus a daily calorie-goal field and a two-day workout plan. All stored
//   per-device in localStorage.
// ============================================================================

interface WeightEntry { date: string; weight: number }
interface BodyState {
  entries: WeightEntry[];
  calorieGoal: string;
  workoutA: string;
  workoutB: string;
}

const KEY = "morning.body.v1";
const DEFAULT: BodyState = { entries: [], calorieGoal: "", workoutA: "", workoutB: "" };
const STEP = 0.2;
const SEED_WEIGHT = 180;

function load(): BodyState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const o = JSON.parse(raw) as Partial<BodyState>;
    return {
      entries: Array.isArray(o.entries) ? o.entries.filter((e) => e && typeof e.weight === "number" && typeof e.date === "string") : [],
      calorieGoal: typeof o.calorieGoal === "string" ? o.calorieGoal : "",
      workoutA: typeof o.workoutA === "string" ? o.workoutA : "",
      workoutB: typeof o.workoutB === "string" ? o.workoutB : "",
    };
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
  if (entries.length < 2) {
    return (
      <div className="h-[150px] rounded-xl border border-[var(--rule-soft)] flex items-center justify-center text-muted text-xs italic px-4 text-center">
        Log your weight a few days in a row and your progress graph appears here.
      </div>
    );
  }
  const W = 600;
  const H = 150;
  const padX = 6;
  const padTop = 14;
  const padBot = 10;
  const weights = entries.map((e) => e.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const n = entries.length;
  const xAt = (i: number) => padX + (i / (n - 1)) * (W - 2 * padX);
  const yAt = (w: number) => padTop + (1 - (w - min) / range) * (H - padTop - padBot);
  const pts = entries.map((e, i) => [xAt(i), yAt(e.weight)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L ${xAt(n - 1).toFixed(2)},${H - padBot} L ${xAt(0).toFixed(2)},${H - padBot} Z`;

  return (
    <div className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} className="block">
        <defs>
          <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#weightFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted">
        <span>{fmtDate(entries[0].date)}</span>
        <span>{min.toFixed(1)}–{max.toFixed(1)} lbs</span>
        <span>{fmtDate(entries[n - 1].date)}</span>
      </div>
    </div>
  );
}

export function BodyCard() {
  const [state, setState] = useState<BodyState>(DEFAULT);
  const hydrated = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setState(load());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const entries = state.entries;
  const current = entries.length ? entries[entries.length - 1].weight : null;
  const first = entries.length ? entries[0].weight : null;
  const deltaSinceStart = current != null && first != null ? current - first : null;

  // Keep the editable number in sync with the current weight unless the
  // user is actively typing in it.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(current != null ? String(current) : "");
    }
  }, [current]);

  function setToday(w: number) {
    const weight = Math.max(50, Math.min(700, Math.round(w * 10) / 10));
    setState((prev) => {
      const today = localDateKey();
      const others = prev.entries.filter((e) => e.date !== today);
      const entries = [...others, { date: today, weight }].sort((a, b) => a.date.localeCompare(b.date));
      return { ...prev, entries };
    });
  }

  function adjust(delta: number) {
    setToday((current ?? SEED_WEIGHT) + delta);
  }

  function commitDraft() {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) setToday(n);
    else setDraft(current != null ? String(current) : "");
  }

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
        </div>

        <div>
          <div className="label mb-2">Workout · Day A</div>
          <textarea
            value={state.workoutA}
            placeholder={"e.g.\nBench 4×8\nRows 4×10\nOHP 3×10"}
            onChange={(e) => setState((s) => ({ ...s, workoutA: e.target.value }))}
            rows={5}
            className="w-full bg-transparent border border-[var(--rule)] rounded-xl px-3 py-2 text-[13px] leading-relaxed text-ink focus:border-[var(--accent)] focus:outline-none resize-y placeholder:text-muted-2"
          />
        </div>

        <div>
          <div className="label mb-2">Workout · Day B</div>
          <textarea
            value={state.workoutB}
            placeholder={"e.g.\nSquat 4×6\nDeadlift 3×5\nCurls 3×12"}
            onChange={(e) => setState((s) => ({ ...s, workoutB: e.target.value }))}
            rows={5}
            className="w-full bg-transparent border border-[var(--rule)] rounded-xl px-3 py-2 text-[13px] leading-relaxed text-ink focus:border-[var(--accent)] focus:outline-none resize-y placeholder:text-muted-2"
          />
        </div>
      </div>
    </Card>
  );
}
