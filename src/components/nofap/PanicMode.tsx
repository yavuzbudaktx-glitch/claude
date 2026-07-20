"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";
import { NOFAP_DEFAULT, PANIC_LINES, sanitizeState, type NofapState } from "@/lib/nofap";

const PHASES = [
  { label: "Inhale", secs: 4 },
  { label: "Hold", secs: 7 },
  { label: "Exhale", secs: 8 },
] as const;
const TARGET_CYCLES = 6;

// Full-screen urge intervention: brutal rotating lines, the user's own
// reasons, and a 4-7-8 breathing guide. Sits at z-[110] — above FocusMode
// (100) and CommandPalette (90), below only the inert ScrollProgress bar.
function PanicOverlay({ onClose }: { onClose: (survived: boolean) => void }) {
  const [reasons] = usePref<string[]>("nofap.reasons", []);

  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLineIdx((i) => (i + 1) % PANIC_LINES.length), 8000);
    return () => clearInterval(t);
  }, []);

  // Breathing state machine: count down the current phase, advance, count cycles.
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [left, setLeft] = useState<number>(PHASES[0].secs);
  const [cycle, setCycle] = useState(1);
  useEffect(() => {
    const t = setInterval(() => {
      setLeft((l) => {
        if (l > 1) return l - 1;
        setPhaseIdx((p) => {
          const next = (p + 1) % PHASES.length;
          if (next === 0) setCycle((c) => c + 1);
          return next;
        });
        return 0; // replaced immediately by the phase-change effect below
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setLeft(PHASES[phaseIdx].secs), [phaseIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const phase = PHASES[phaseIdx];
  const scale = phase.label === "Exhale" ? 1 : phase.label === "Inhale" ? 1.55 : 1.55;

  return (
    <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-2xl animate-fadeIn flex flex-col items-center justify-center px-6 py-10 overflow-y-auto">
      <button
        onClick={() => onClose(false)}
        aria-label="Exit panic mode"
        className="absolute top-4 right-4 text-white/40 hover:text-white transition"
      >
        <X className="h-6 w-6" />
      </button>

      <p
        key={lineIdx}
        className="font-display text-2xl md:text-4xl text-white text-center max-w-2xl leading-snug animate-fadeIn"
      >
        {PANIC_LINES[lineIdx]}
      </p>

      <div className="mt-10 flex flex-col items-center gap-3">
        <div className="relative h-40 w-40 grid place-items-center">
          <div
            className="absolute inset-0 m-auto h-24 w-24 rounded-full bg-white/10 border border-white/30 motion-safe:transition-transform motion-safe:ease-in-out"
            style={{ transform: `scale(${scale})`, transitionDuration: `${phase.secs}s` }}
            aria-hidden
          />
          <span className="relative text-white font-display text-3xl tabular-nums">{left}</span>
        </div>
        <div className="text-white/80 text-sm tracking-widest uppercase">{phase.label}</div>
        <div className="text-white/40 text-xs">
          breathe 4·7·8 — cycle {Math.min(cycle, TARGET_CYCLES)} / {TARGET_CYCLES}
        </div>
      </div>

      <div className="mt-10 max-w-md w-full text-center">
        <div className="text-white/50 text-[11px] tracking-[0.2em] uppercase mb-2">Why you quit</div>
        {reasons.length > 0 ? (
          <ul className="space-y-1.5">
            {reasons.map((r, i) => (
              <li key={i} className="text-white/90 text-[15px]">— {r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-white/60 text-[14px] italic">
            You never wrote your reasons down. That&apos;s half the reason you&apos;re on this screen. Fix it after this
            wave passes.
          </p>
        )}
      </div>

      <div className="mt-10 flex items-center gap-3">
        <button
          onClick={() => onClose(true)}
          className="rounded-full px-6 py-2.5 text-[14px] font-semibold text-white hover:opacity-90 active:scale-95 transition"
          style={{ background: "var(--up)" }}
        >
          The urge passed. I&apos;m still standing.
        </button>
      </div>
    </div>
  );
}

export function PanicMode() {
  const [open, setOpen] = useState(false);
  const [state, setState] = usePref<NofapState>("nofap.state", NOFAP_DEFAULT);
  const panics = sanitizeState(state).panics;
  const survived = panics.filter((p) => p.survived).length;

  const close = useCallback(
    (didSurvive: boolean) => {
      setOpen(false);
      setState((p) => {
        const s = sanitizeState(p);
        return { ...s, panics: [{ at: Date.now(), survived: didSurvive }, ...s.panics].slice(0, 200) };
      });
    },
    [setState],
  );

  return (
    <div className="w-full max-w-md flex flex-col items-center gap-2">
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl py-4 text-white font-semibold text-lg inline-flex items-center justify-center gap-2.5 shadow-[var(--shadow-card)] hover:opacity-90 active:scale-[0.98] transition"
        style={{ background: "var(--down)" }}
      >
        <ShieldAlert className="h-5 w-5 animate-pulse" /> URGE HITTING — PANIC BUTTON
      </button>
      {panics.length > 0 && (
        <span className="text-[11px] text-muted-2">
          Urges fought: {panics.length} · beaten: <span className="text-up">{survived}</span>
        </span>
      )}
      {open && <PanicOverlay onClose={close} />}
    </div>
  );
}
