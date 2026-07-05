"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Card } from "@/components/Card";
import { localDateKey, localDateKeyAt } from "@/lib/local-date";
import { createClient } from "@/lib/supabase/client";
import { usePref } from "@/components/PrefsProvider";

// Monday→Sunday keys for the current week, all in local time. Re-computed
// from the supplied `today` key so a tab left open across midnight still
// shows the right column highlighted.
function weekDaysFor(todayKey: string): string[] {
  const [y, m, d] = todayKey.split("-").map(Number);
  const today = new Date(y, m - 1, d);
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(y, m - 1, d - dow + i);
    return localDateKey(dd);
  });
}

function HabitTracker() {
  const [list, setList] = usePref<string[]>("habitList", ["Water", "Steps", "Reading"]);
  const [done, setDone] = usePref<Record<string, string[]>>("habits", {});
  const [adding, setAdding] = useState("");
  // weekOffset: 0 = this week (Mon-Sun), -1 = last week, +1 = next week, etc.
  // The arrows let you flip back to compare; +1 is disabled when you're
  // already on the current week.
  const [weekOffset, setWeekOffset] = useState(0);
  // Today is reactive: re-checked every 15s, when the tab regains focus,
  // when the window is shown, and when the page is first loaded. (Was
  // every 60s — that left a window in which the tracker showed yesterday
  // for up to a minute after midnight, and a saved click during that
  // window would land on the wrong day. The auto-prune below also strips
  // any future-dated marks defensively so stale data can't paint either.)
  const [todayKey, setTodayKey] = useState<string>(() => localDateKey());
  useEffect(() => {
    const tick = () => {
      const k = localDateKey();
      setTodayKey((cur) => (cur === k ? cur : k));
    };
    tick();
    const id = setInterval(tick, 15_000);
    const onVis = () => { if (!document.hidden) tick(); };
    const onFocus = () => tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  // Defensive prune — strip any future-dated marks from `done` on mount.
  // Old versions of this file allowed clicking a future cell, and a stale
  // entry like "2026-06-09" sitting in `done["Water"]` is what caused the
  // first row to occasionally show tomorrow as "done" and refuse a click
  // on today.
  useEffect(() => {
    setDone((cur) => {
      let dirty = false;
      const next: Record<string, string[]> = {};
      for (const [h, arr] of Object.entries(cur)) {
        const filtered = arr.filter((d) => d <= todayKey);
        if (filtered.length !== arr.length) dirty = true;
        next[h] = filtered;
      }
      return dirty ? next : cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);
  // The "anchor" date for the visible week — todayKey shifted by `weekOffset`
  // weeks. weekDaysFor() builds Monday..Sunday around it.
  const anchor = useMemo(() => {
    const [y, m, d] = todayKey.split("-").map(Number);
    const dd = new Date(y, m - 1, d + weekOffset * 7);
    return localDateKey(dd);
  }, [todayKey, weekOffset]);
  const days = useMemo(() => weekDaysFor(anchor), [anchor]);
  const weekSet = useMemo(() => new Set(days), [days]);
  const onCurrentWeek = weekOffset === 0;
  const weekLabel = useMemo(() => {
    if (onCurrentWeek) return "This week";
    if (weekOffset === -1) return "Last week";
    // Otherwise show "May 12 – May 18" so multiple weeks back is unambiguous.
    const fmt = (key: string) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    };
    return `${fmt(days[0])} – ${fmt(days[6])}`;
  }, [weekOffset, onCurrentWeek, days]);
  const dayLabel = (key: string) => {
    const [y, m, dd] = key.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: "narrow" });
  };

  function toggle(h: string, d: string) {
    // Only past + present days are toggleable.
    if (d > todayKey) return;
    // FUNCTIONAL update — `done` from the closure is stale within the same
    // render if you toggle two days in a row.
    setDone((cur) => {
      // PRESERVE history: only touch the toggled date — never prune older
      // weeks (we need them so the previous-week view stays accurate).
      const prev = cur[h] ?? [];
      const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
      return { ...cur, [h]: next };
    });
  }
  function addHabit(e: React.FormEvent) {
    e.preventDefault();
    const name = adding.trim();
    if (!name) return;
    setList((cur) => (cur.includes(name) ? cur : [...cur, name]));
    setAdding("");
  }
  function removeHabit(h: string) {
    setList((cur) => cur.filter((x) => x !== h));
    setDone((cur) => {
      const rest = { ...cur };
      delete rest[h];
      return rest;
    });
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="label">Habits · <span className={onCurrentWeek ? "" : "text-accent"}>{weekLabel}</span></div>
        <div className="ml-auto flex items-center gap-0.5 text-muted hover:text-ink transition">
          <button
            type="button"
            onClick={() => setWeekOffset((n) => n - 1)}
            className="h-6 w-6 grid place-items-center rounded hover:bg-[var(--rule-soft)]"
            aria-label="Previous week"
            title="Previous week"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {!onCurrentWeek && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="px-1.5 h-6 text-[10px] uppercase tracking-wider rounded hover:bg-[var(--rule-soft)]"
              title="Back to this week"
            >
              today
            </button>
          )}
          <button
            type="button"
            onClick={() => setWeekOffset((n) => Math.min(0, n + 1))}
            disabled={onCurrentWeek}
            className="h-6 w-6 grid place-items-center rounded hover:bg-[var(--rule-soft)] disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next week"
            title="Next week"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 mb-1 pl-[68px]">
        {days.map((d) => (
          <span key={d} className={`w-[18px] text-center text-[9px] uppercase ${d === todayKey ? "text-accent" : "text-muted-2"}`}>
            {dayLabel(d)}
          </span>
        ))}
      </div>
      <div className="space-y-1.5">
        {list.map((h) => {
          const hdone = done[h] ?? [];
          return (
            <div key={h} className="group/h flex items-center gap-1">
              <span className="w-16 shrink-0 truncate text-[12px] text-ink-soft" title={h}>{h}</span>
              {days.map((d) => {
                // Only credit dates that are part of the current week AND
                // are not in the future — a stale entry for tomorrow (left
                // over from a previous version of this code) would
                // otherwise paint tomorrow's circle green.
                const on = hdone.includes(d) && weekSet.has(d) && d <= todayKey;
                const isToday = d === todayKey;
                const isFuture = d > todayKey;
                return (
                  <button
                    key={d}
                    onClick={() => toggle(h, d)}
                    aria-label={`${h} ${d}`}
                    disabled={isFuture}
                    className={`h-[18px] w-[18px] rounded-full border transition shrink-0 ${
                      on
                        ? "border-transparent"
                        : isToday
                          ? "border-[var(--accent)]"
                          : isFuture
                            ? "border-[var(--rule-soft)] cursor-not-allowed"
                            : "border-[var(--rule)] hover:border-[var(--ink-soft)]"
                    }`}
                    style={on ? { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" } : undefined}
                  />
                );
              })}
              <button
                onClick={() => removeHabit(h)}
                aria-label={`Remove ${h}`}
                className="ml-0.5 text-muted-2 opacity-0 group-hover/h:opacity-100 hover:text-accent transition shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        {list.length === 0 && <p className="text-muted text-xs italic">No habits yet.</p>}
      </div>
      <form onSubmit={addHabit} className="mt-2.5 flex items-center gap-1.5">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="+ Add habit"
          maxLength={18}
          className="w-28 bg-[var(--rule-soft)] rounded-lg px-2.5 py-1 text-[12px] text-ink focus:outline-none focus:bg-[var(--paper)] focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2"
        />
        <button type="submit" className="text-muted hover:text-accent transition" aria-label="Add habit">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </form>
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
  proteinGoal: string;       // grams / day
  workoutA: string;
  workoutB: string;
  calsDate: string;          // localDateKey the calsTotal + proteinTotal apply to
  calsTotal: number;         // calories logged "today"
  proteinTotal: number;      // protein (g) logged "today"
}

const KEY = "morning.body.v1";
const DEFAULT: BodyState = { entries: [], calorieGoal: "", proteinGoal: "", workoutA: "", workoutB: "", calsDate: "", calsTotal: 0, proteinTotal: 0 };
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
    proteinGoal: typeof o.proteinGoal === "string" ? o.proteinGoal : "",
    workoutA: typeof o.workoutA === "string" ? o.workoutA : "",
    workoutB: typeof o.workoutB === "string" ? o.workoutB : "",
    calsDate: typeof o.calsDate === "string" ? o.calsDate : "",
    calsTotal: typeof o.calsTotal === "number" ? o.calsTotal : 0,
    proteinTotal: typeof o.proteinTotal === "number" ? o.proteinTotal : 0,
  };
}

// Merge a remote body blob with our local one so a stale device can't wipe
// weight history: weight ENTRIES are unioned by date (keeping the most recent
// reading per day from whichever side has it), while the scalar fields take
// the LOCAL value because the editing device is the source of truth for the
// thing it just changed.
function mergeBody(remote: BodyState, local: BodyState): BodyState {
  const byDate = new Map<string, number>();
  for (const e of remote.entries) byDate.set(e.date, e.weight);
  for (const e of local.entries) byDate.set(e.date, e.weight); // local overrides same-day
  const entries = Array.from(byDate.entries())
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { ...local, entries };
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

// A textarea that grows with its content instead of scrolling.
function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };
  useEffect(() => { resize(); }, [props.value]);
  return <textarea ref={ref} onInput={resize} {...props} />;
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
  const [hover, setHover] = useState<number | null>(null);
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

  // Map a pointer position to the nearest data point index.
  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * w;
    if (n === 1) { setHover(0); return; }
    const i = Math.round(((px - padX) / (w - 2 * padX)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const active = hover ?? n - 1;
  const ae = entries[active];
  const ap = pts[active];
  // Tooltip horizontal placement, clamped inside the chart.
  const tipLeftPct = Math.max(6, Math.min(94, (ap[0] / w) * 100));

  return (
    <div
      ref={ref}
      className="min-w-0 relative touch-none cursor-crosshair select-none"
      onPointerMove={handleMove}
      onPointerDown={handleMove}
      onPointerLeave={() => setHover(null)}
    >
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
        {/* Crosshair + highlighted point under the cursor */}
        {hover !== null && (
          <line x1={ap[0]} y1={padTop - 6} x2={ap[0]} y2={H - padBot} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        )}
        <circle cx={ap[0]} cy={ap[1]} r="8" fill="var(--accent)" opacity="0.18" />
        <circle cx={ap[0]} cy={ap[1]} r="4.5" fill="var(--accent)" />
        {hover === null && n >= 2 && <circle cx={last[0]} cy={last[1]} r="2" fill="var(--paper)" />}
      </svg>

      {/* Tooltip */}
      <div
        className="pointer-events-none absolute -top-1 -translate-x-1/2 rounded-lg border border-[var(--glass-border)] bg-[var(--paper-2)] px-2 py-1 backdrop-blur-md shadow-[var(--shadow-card)] text-center transition-opacity"
        style={{ left: `${tipLeftPct}%`, opacity: hover === null ? 0 : 1 }}
      >
        <div className="font-mono tabular-nums text-[13px] text-ink leading-none">{ae.weight.toFixed(1)}<span className="text-muted text-[9px]"> lbs</span></div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-muted mt-0.5">{fmtDate(ae.date)}</div>
      </div>

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
  const stateRef = useRef(state); stateRef.current = state;
  // Last `updated_at` value that came back from one of OUR writes — used to
  // ignore the realtime echo so the row we just wrote doesn't loop-feed.
  const lastOwnUpdate = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [calDraft, setCalDraft] = useState("");
  const [proteinDraft, setProteinDraft] = useState("");

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
          .select("data,updated_at")
          .eq("user_id", uid)
          .maybeSingle();
        if (cancelled) return;
        if (error) console.warn("BodyCard: initial load failed:", error.message);
        if (!error && data?.data) {
          setState(coerce(data.data));
          if (data.updated_at) lastOwnUpdate.current = data.updated_at;
        } else {
          setState(loadLocal());
        }
      } else {
        setState(loadLocal());
      }
      hydrated.current = true;
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // Realtime: when Device A writes, B picks it up here without a refresh.
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`body_profile:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "body_profile", filter: `user_id=eq.${userId}` },
        (payload: { new?: { data?: unknown; updated_at?: string } }) => {
          const incoming = payload.new;
          if (!incoming?.data) return;
          // Echo of our own write — skip.
          if (incoming.updated_at && incoming.updated_at === lastOwnUpdate.current) return;
          setState(coerce(incoming.data));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, userId]);

  // Persist: localStorage immediately; debounced READ-MERGE-WRITE upsert so a
  // stale device can never wipe weight history saved on another device.
  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    if (!userId) return;
    const t = setTimeout(async () => {
      // Re-read remote and union weight entries before writing.
      let merged = stateRef.current;
      try {
        const { data } = await supabase
          .from("body_profile").select("data").eq("user_id", userId).maybeSingle();
        if (data?.data) merged = mergeBody(coerce(data.data), stateRef.current);
      } catch { /* fall back to local */ }
      const stamp = new Date().toISOString();
      lastOwnUpdate.current = stamp;
      const { error } = await supabase
        .from("body_profile")
        .upsert({ user_id: userId, data: merged, updated_at: stamp });
      if (error) console.warn("BodyCard: sync failed:", error.message);
    }, 250);
    return () => clearTimeout(t);
  }, [state, userId, supabase]);

  // Flush on tab hide so a fast navigation can't drop the last write.
  useEffect(() => {
    const flush = () => {
      if (!hydrated.current || !userId) return;
      const stamp = new Date().toISOString();
      lastOwnUpdate.current = stamp;
      supabase
        .from("body_profile")
        .upsert({ user_id: userId, data: stateRef.current, updated_at: stamp })
        .then(() => {}, () => {});
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [supabase, userId]);

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

  // Nutrition day rolls over at 5 AM, not midnight — a 1 AM snack still
  // counts toward "yesterday".
  const today = localDateKeyAt(5);
  const calsToday = state.calsDate === today ? state.calsTotal : 0;
  const proteinToday = state.calsDate === today ? state.proteinTotal : 0;
  const goalNum = Number(state.calorieGoal);
  const hasGoal = Number.isFinite(goalNum) && goalNum > 0;
  const calPct = hasGoal ? Math.min(100, (calsToday / goalNum) * 100) : 0;
  const proteinGoalNum = Number(state.proteinGoal);
  const hasProteinGoal = Number.isFinite(proteinGoalNum) && proteinGoalNum > 0;
  const proteinPct = hasProteinGoal ? Math.min(100, (proteinToday / proteinGoalNum) * 100) : 0;

  function addCals(e: React.FormEvent) {
    e.preventDefault();
    const raw = calDraft.trim();
    if (!raw) return;
    const sign = raw.startsWith("-") ? -1 : 1;
    const num = Math.abs(parseInt(raw.replace(/[^0-9]/g, ""), 10));
    if (Number.isFinite(num) && num !== 0) {
      setState((prev) => {
        const base = prev.calsDate === today ? prev.calsTotal : 0;
        // Carry today's protein forward when we roll the date; reset on roll-over.
        const baseP = prev.calsDate === today ? prev.proteinTotal : 0;
        return { ...prev, calsDate: today, calsTotal: Math.max(0, base + sign * num), proteinTotal: baseP };
      });
    }
    setCalDraft("");
  }
  function addProtein(e: React.FormEvent) {
    e.preventDefault();
    const raw = proteinDraft.trim();
    if (!raw) return;
    const sign = raw.startsWith("-") ? -1 : 1;
    const num = Math.abs(parseInt(raw.replace(/[^0-9]/g, ""), 10));
    if (Number.isFinite(num) && num !== 0) {
      setState((prev) => {
        const baseC = prev.calsDate === today ? prev.calsTotal : 0;
        const baseP = prev.calsDate === today ? prev.proteinTotal : 0;
        return { ...prev, calsDate: today, calsTotal: baseC, proteinTotal: Math.max(0, baseP + sign * num) };
      });
    }
    setProteinDraft("");
  }

  const fieldClass =
    "w-full rounded-xl px-3 py-2 text-[13px] leading-relaxed text-ink resize-none overflow-hidden transition " +
    "bg-[var(--rule-soft)] border border-transparent opacity-75 placeholder:text-muted-2 " +
    "hover:opacity-100 focus:opacity-100 focus:bg-[var(--paper)] focus:border-[var(--accent)] focus:outline-none";

  return (
    <Card num="09" title="Body · Weight & Training">
      <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr_auto] gap-6 items-center">
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

        {/* Habits */}
        <HabitTracker />
      </div>

      {/* Bottom strip — compact intake pair on the left (+ inputs hugging the
          counts), the two workout textareas share the remaining width. */}
      <div className="mt-5 pt-4 border-t rule grid grid-cols-1 md:grid-cols-[235px_235px_minmax(0,1fr)] gap-x-6 gap-y-4">
        {/* Calories — goal, today's count, +input, progress bar */}
        <div>
          <div className="label mb-2">Calorie goal</div>
          <div className="group/cal flex items-baseline gap-2 opacity-60 hover:opacity-100 focus-within:opacity-100 transition">
            <input
              type="number"
              inputMode="numeric"
              value={state.calorieGoal}
              placeholder="2200"
              onChange={(e) => setState((s) => ({ ...s, calorieGoal: e.target.value }))}
              className="w-20 bg-transparent border-b border-[var(--rule)] focus:border-[var(--accent)] focus:outline-none font-mono tabular-nums text-lg text-ink pb-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">kcal / day</span>
          </div>
          <div className="label mb-1.5 mt-4">Today&rsquo;s intake</div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular-nums text-lg text-ink">{calsToday.toLocaleString()}</span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                {hasGoal ? `${Math.max(0, goalNum - calsToday).toLocaleString()} left` : "kcal"}
              </span>
            </div>
            <form onSubmit={addCals} className="flex items-center gap-1.5">
              <input
                value={calDraft}
                onChange={(e) => setCalDraft(e.target.value)}
                placeholder="+ 250"
                inputMode="numeric"
                className="w-16 bg-[var(--rule-soft)] rounded-lg px-2 py-1.5 font-mono tabular-nums text-[12.5px] text-ink focus:outline-none focus:bg-[var(--paper)] focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2"
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

        {/* Protein — same shape as calories so the eye reads them as a pair */}
        <div>
          <div className="label mb-2">Protein goal</div>
          <div className="group/p flex items-baseline gap-2 opacity-60 hover:opacity-100 focus-within:opacity-100 transition">
            <input
              type="number"
              inputMode="numeric"
              value={state.proteinGoal}
              placeholder="160"
              onChange={(e) => setState((s) => ({ ...s, proteinGoal: e.target.value }))}
              className="w-20 bg-transparent border-b border-[var(--rule)] focus:border-[var(--accent)] focus:outline-none font-mono tabular-nums text-lg text-ink pb-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">g / day</span>
          </div>
          <div className="label mb-1.5 mt-4">Today&rsquo;s protein</div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular-nums text-lg text-ink">{proteinToday}</span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                {hasProteinGoal ? `${Math.max(0, proteinGoalNum - proteinToday)} g left` : "grams"}
              </span>
            </div>
            <form onSubmit={addProtein} className="flex items-center gap-1.5">
              <input
                value={proteinDraft}
                onChange={(e) => setProteinDraft(e.target.value)}
                placeholder="+ 30"
                inputMode="numeric"
                className="w-14 bg-[var(--rule-soft)] rounded-lg px-2 py-1.5 font-mono tabular-nums text-[12.5px] text-ink focus:outline-none focus:bg-[var(--paper)] focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2"
                aria-label="Add protein"
              />
              <button type="submit" className="btn-ghost !h-8 !w-8" aria-label="Add to today's protein">
                <Plus className="h-4 w-4" />
              </button>
            </form>
          </div>
          {hasProteinGoal && (
            <div className="h-1.5 w-full rounded-full bg-[var(--rule)] overflow-hidden mt-2.5">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${proteinPct}%`, background: "linear-gradient(90deg, var(--up), var(--accent), var(--accent-2))" }}
              />
            </div>
          )}
        </div>

        {/* Workouts — A and B side-by-side with real breathing room (they take
            all the width the compact intake columns free up). */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="label mb-1.5">Workout · A</div>
            <AutoTextarea
              value={state.workoutA}
              placeholder={"e.g.\nBench 4×8\nRows 4×10\nOHP 3×10"}
              onChange={(e) => setState((s) => ({ ...s, workoutA: e.target.value }))}
              rows={4}
              className={fieldClass + " !text-[13px]"}
            />
          </div>
          <div>
            <div className="label mb-1.5">Workout · B</div>
            <AutoTextarea
              value={state.workoutB}
              placeholder={"e.g.\nSquat 4×6\nDeadlift 3×5\nCurls 3×12"}
              onChange={(e) => setState((s) => ({ ...s, workoutB: e.target.value }))}
              rows={4}
              className={fieldClass + " !text-[13px]"}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
