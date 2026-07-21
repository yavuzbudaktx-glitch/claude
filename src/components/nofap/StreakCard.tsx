"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Flame } from "lucide-react";
import { usePref, usePrefsLoaded } from "@/components/PrefsProvider";
import {
  NOFAP_DEFAULT,
  sanitizeState,
  splitDuration,
  formatDurationShort,
  type NofapState,
} from "@/lib/nofap";
import { PanicMode } from "./PanicMode";

function Unit({ value, label, big = false }: { value: number; label: string; big?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`font-display tabular-nums leading-none text-ink ${
          big ? "text-7xl md:text-9xl" : "text-3xl md:text-5xl"
        }`}
      >
        {big ? value : String(value).padStart(2, "0")}
      </span>
      <span className="label mt-1.5">{label}</span>
    </div>
  );
}

export function StreakCard() {
  const loaded = usePrefsLoaded();
  const [raw, setState] = usePref<NofapState>("nofap.state", NOFAP_DEFAULT);
  const state = sanitizeState(raw);

  // Mount-gate all Date.now()-derived output to avoid hydration mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [confirming, setConfirming] = useState(false);

  if (!loaded || now === null) {
    return <div className="h-[220px] grid place-items-center text-muted text-sm">…</div>;
  }

  if (state.startedAt === null) {
    return (
      <div className="py-12 flex flex-col items-center gap-5 text-center">
        <p className="font-display text-2xl md:text-3xl text-ink max-w-md">
          No streak. No excuses queued up. Start the clock and don&apos;t touch it again.
        </p>
        <button
          onClick={() => setState((p) => ({ ...sanitizeState(p), startedAt: Date.now() }))}
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-white font-semibold text-lg shadow-[var(--shadow-card)] hover:opacity-90 active:scale-95 transition"
          style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))" }}
        >
          <Flame className="h-5 w-5" /> Start the streak
        </button>
      </div>
    );
  }

  const elapsed = now - state.startedAt;
  const { days, hours, mins, secs } = splitDuration(elapsed);
  const liveBest = Math.max(state.bestMs, elapsed);
  const isRecord = state.bestMs > 0 && elapsed > state.bestMs;

  const relapse = () => {
    setState((p) => {
      const s = sanitizeState(p);
      if (s.startedAt === null) return s;
      const nowMs = Date.now();
      const streakMs = nowMs - s.startedAt;
      return {
        ...s,
        startedAt: nowMs, // the next streak starts immediately — no wallowing
        bestMs: Math.max(s.bestMs, streakMs),
        relapses: [{ at: nowMs, streakMs }, ...s.relapses].slice(0, 200),
      };
    });
    setConfirming(false);
  };

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="flex items-end gap-5 md:gap-8">
        <Unit value={days} label={days === 1 ? "day" : "days"} big />
        <Unit value={hours} label="hrs" />
        <Unit value={mins} label="min" />
        <Unit value={secs} label="sec" />
      </div>

      <div className="flex items-center gap-4 text-[12.5px] text-muted flex-wrap justify-center">
        <span>
          Since <span className="text-ink-soft font-medium">{format(state.startedAt, "MMM d, HH:mm")}</span>
        </span>
        <span className="h-1 w-1 rounded-full bg-[var(--rule)]" aria-hidden />
        <span>
          Best:{" "}
          <span className={`font-medium ${isRecord ? "text-up" : "text-ink-soft"}`}>
            {formatDurationShort(liveBest)}
            {isRecord && " — record, right now"}
          </span>
        </span>
      </div>

      <PanicMode />

      {confirming ? (
        <div className="flex flex-col items-center gap-2.5 text-center animate-fadeIn">
          <p className="text-[13px] text-ink-soft max-w-sm">
            You&apos;re about to erase <span className="text-down font-semibold">{formatDurationShort(elapsed)}</span> of
            work. If you actually broke, confirm it and own it. If not, get out of here.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={relapse}
              className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 transition"
              style={{ background: "var(--down)" }}
            >
              I relapsed. Reset it.
            </button>
            <button onClick={() => setConfirming(false)} className="btn-ghost text-[12.5px]">
              No — back to the fight
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-[11.5px] text-muted-2 hover:text-down underline underline-offset-4 transition"
        >
          I relapsed
        </button>
      )}
    </div>
  );
}
