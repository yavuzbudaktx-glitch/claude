"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Play, Pause, RotateCcw, Coffee, Timer } from "lucide-react";
import { useCommand } from "@/lib/commands";
import { usePref } from "@/components/PrefsProvider";
import { localDateKey } from "@/lib/local-date";

// Full-screen blur with two modes:
//   • Free count-up — a stopwatch you start and stop yourself.
//   • Pomodoro      — 25 min focus → 5 min break, looping; auto-counts cycles.
// Every second of *focus* time (not breaks) is logged against today's key in
// hub.focus.daily and the lifetime total — so the dashboard can show
// "today's focus" without anything ever resetting mid-day. The day key
// rolls over at local midnight automatically.

const FOCUS_LEN = 25 * 60;
const BREAK_LEN = 5 * 60;

interface FocusDaily {
  date: string;        // local date key for the bucket
  seconds: number;     // focused seconds banked today
  sessions: number;    // completed pomodoros today
}

export function FocusMode() {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<"count-up" | "pomodoro">("pomodoro");
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [running, setRunning] = useState(false);
  const [secs, setSecs] = useState(0); // count-up: total; pomodoro: elapsed within phase

  const [daily, setDaily] = usePref<FocusDaily>("hub.focus.daily", { date: localDateKey(), seconds: 0, sessions: 0 });
  const [lifetimeSec, setLifetimeSec] = usePref<number>("hub.focus.lifetimeSeconds", 0);

  useCommand((c) => {
    if (c.kind === "focus") {
      setActive(true);
      setSecs(0);
      setPhase("focus");
      setRunning(false);
    }
  });

  // Rollover & seconds banking. Every clock-tick on focus phase adds 1s to
  // today's bucket; rollover swaps the bucket date and zeros the count.
  // Refs hold the always-current values so the interval can compute
  // new totals without stale closures.
  const dailyRef = useRef(daily); dailyRef.current = daily;
  const lifetimeRef = useRef(lifetimeSec); lifetimeRef.current = lifetimeSec;

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActive(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  useEffect(() => {
    if (!active || !running) return;
    const t = setInterval(() => {
      setSecs((s) => s + 1);
      const isFocus = mode === "count-up" || phase === "focus";
      if (isFocus) {
        const today = localDateKey();
        const d = dailyRef.current;
        const next = d.date !== today
          ? { date: today, seconds: 1, sessions: 0 }
          : { ...d, seconds: d.seconds + 1 };
        dailyRef.current = next;
        setDaily(next);
        const nextLife = lifetimeRef.current + 1;
        lifetimeRef.current = nextLife;
        setLifetimeSec(nextLife);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [active, running, mode, phase, setDaily, setLifetimeSec]);

  // Pomodoro phase transitions.
  useEffect(() => {
    if (mode !== "pomodoro" || !running) return;
    const cap = phase === "focus" ? FOCUS_LEN : BREAK_LEN;
    if (secs >= cap) {
      if (phase === "focus") {
        const today = localDateKey();
        const d = dailyRef.current;
        const next = d.date !== today
          ? { date: today, seconds: 0, sessions: 1 }
          : { ...d, sessions: d.sessions + 1 };
        dailyRef.current = next;
        setDaily(next);
        setPhase("break");
      } else {
        setPhase("focus");
      }
      setSecs(0);
    }
  }, [secs, phase, mode, running, setDaily]);

  // Bring today's bucket up to date if it crossed midnight while idle.
  useEffect(() => {
    const today = localDateKey();
    if (daily.date !== today) {
      setDaily({ date: today, seconds: 0, sessions: 0 });
    }
  }, [daily.date, setDaily]);

  const total = mode === "pomodoro" ? (phase === "focus" ? FOCUS_LEN : BREAK_LEN) : 0;
  const remaining = Math.max(0, total - secs);
  const showSecs = mode === "pomodoro" ? remaining : secs;
  const mm = String(Math.floor(showSecs / 60)).padStart(2, "0");
  const ss = String(showSecs % 60).padStart(2, "0");
  const pct = mode === "pomodoro" ? (secs / total) * 100 : 0;

  const todaySecs = daily.date === localDateKey() ? daily.seconds : 0;
  const todayLabel = useMemo(() => {
    const h = Math.floor(todaySecs / 3600);
    const m = Math.floor((todaySecs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${todaySecs}s`;
  }, [todaySecs]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-2xl animate-fadeIn">
      <div
        className="relative flex flex-col items-center gap-5 px-10 py-9 rounded-3xl border border-white/10 bg-white/[0.06]"
        style={{ boxShadow: "0 0 90px -12px var(--glow), inset 0 1px 0 rgba(255,255,255,0.10)" }}
      >
        {/* Mode segmented control */}
        <div className="inline-flex rounded-full border border-white/15 p-0.5 text-[11px]">
          {(["pomodoro", "count-up"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setSecs(0); setPhase("focus"); setRunning(false); }}
              className={`px-3 py-1 rounded-full transition ${mode === m ? "bg-white/15 text-white" : "text-white/55 hover:text-white"}`}
            >
              {m === "pomodoro" ? "Pomodoro" : "Stopwatch"}
            </button>
          ))}
        </div>

        <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-white/55 inline-flex items-center gap-2">
          {mode === "pomodoro" && (phase === "focus" ? <Timer className="h-3 w-3" /> : <Coffee className="h-3 w-3" />)}
          {mode === "pomodoro" ? (phase === "focus" ? "Focus" : "Break") : "Focus"}
        </div>

        <div className="font-display tabular-nums text-white/95 leading-none text-6xl md:text-7xl">
          {mm}:{ss}
        </div>

        {/* Progress ring for pomodoro */}
        {mode === "pomodoro" && (
          <div className="h-1 w-56 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full transition-[width] duration-700"
              style={{ width: `${Math.min(100, pct)}%`, background: phase === "focus" ? "var(--accent)" : "var(--up)" }}
            />
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRunning((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/15 text-white hover:bg-white/25 transition text-[13px] font-medium"
          >
            {running ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> {secs > 0 ? "Resume" : "Start"}</>}
          </button>
          <button
            onClick={() => { setSecs(0); setPhase("focus"); setRunning(false); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:bg-white/10 hover:text-white transition text-[13px]"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>

        {/* Today's banked focus */}
        <div className="text-[11px] text-white/55 flex items-center gap-3 pt-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-white/40" />
            Today &middot; <span className="font-mono text-white/75 tabular-nums">{todayLabel}</span>
          </span>
          {daily.sessions > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-white/40" />
              <span className="font-mono text-white/75 tabular-nums">{daily.sessions}</span> session{daily.sessions === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <button
          onClick={() => { setActive(false); setRunning(false); }}
          className="absolute top-3 right-3 inline-flex items-center justify-center h-7 w-7 rounded-full border border-white/15 text-white/55 hover:bg-white/10 hover:text-white transition"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="text-[10px] uppercase tracking-[0.3em] text-white/30">
          Lifetime · <span className="font-mono">{Math.floor(lifetimeSec / 3600).toLocaleString()}h</span>
        </div>
      </div>
    </div>
  );
}
