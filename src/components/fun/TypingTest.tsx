"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Timer } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";

// Twenty-ish lines of evergreen-feeling sentences. Random per session so it
// doesn't get muscle-memorized; you can press refresh for a new one.
const SAMPLES = [
  "the quiet hum of the city in the early hours has a way of making the world feel briefly yours",
  "a small habit done daily will outpace a grand effort attempted rarely every single time",
  "you do not need to be loud to be remembered just consistent and a little bit kind",
  "real focus is not pretending the noise is gone it is choosing the one signal that matters",
  "the work that lasts is the work you do when nobody is keeping score and no one is watching",
  "ambition without rest is a fast road to a place you did not actually want to go",
  "you cannot proofread your way into clarity you have to think your way into it first",
  "a goal without a calendar is a wish and a wish without a deadline becomes a slow regret",
  "compounding is mostly patience dressed up in math waiting for time to do its quiet work",
  "the friend who tells you the hard truth gently is worth ten who tell you nothing at all",
  "your future self will thank you for every minute you spend learning to type without looking",
  "a clean inbox is not the same as a clear mind one is a system the other is a practice",
  "when you finally ship the thing you have been polishing nobody notices the cracks you obsessed over",
  "the best decisions feel obvious in hindsight which is why hindsight is so much cheaper than foresight",
  "you are never going to feel ready and that is exactly why ready is not the right bar",
  "small bets give you information big bets give you outcomes the trick is to know which one you are placing",
];

interface Best { wpm: number; acc: number; at: number }

function pickSample(seed = Date.now()): string {
  return SAMPLES[seed % SAMPLES.length];
}

export function TypingTest() {
  const [seed, setSeed] = useState(() => Date.now());
  const target = useMemo(() => pickSample(seed), [seed]);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [best, setBest] = usePref<Best | null>("hub.typing.best", null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (startedAt && !finishedAt) {
      const t = setInterval(() => setNow(Date.now()), 250);
      return () => clearInterval(t);
    }
  }, [startedAt, finishedAt]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (!startedAt) setStartedAt(Date.now());
    setTyped(v);
    if (v.length >= target.length) {
      const finishedTs = Date.now();
      setFinishedAt(finishedTs);
      const elapsed = (finishedTs - (startedAt ?? finishedTs)) / 1000 / 60;
      const wordsRaw = target.length / 5;
      const correctChars = v.split("").reduce((acc, c, i) => acc + (c === target[i] ? 1 : 0), 0);
      const acc = Math.round((correctChars / target.length) * 100);
      const wpm = elapsed > 0 ? Math.round(wordsRaw / elapsed) : 0;
      if (!best || wpm > best.wpm) setBest({ wpm, acc, at: finishedTs });
    }
  }

  function reset(newSeed?: number) {
    setTyped("");
    setStartedAt(null);
    setFinishedAt(null);
    setSeed(newSeed ?? Date.now());
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  const elapsedSec = startedAt ? ((finishedAt ?? now) - startedAt) / 1000 : 0;
  const correctChars = typed.split("").reduce((acc, c, i) => acc + (c === target[i] ? 1 : 0), 0);
  const liveWpm = elapsedSec > 0 ? Math.round((correctChars / 5) / (elapsedSec / 60)) : 0;
  const liveAcc = typed.length > 0 ? Math.round((correctChars / typed.length) * 100) : 100;
  const finished = !!finishedAt;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-[11px] uppercase tracking-wider text-muted">
        <div className="inline-flex items-center gap-1.5">
          <Timer className="h-3 w-3" />
          <span className="font-mono tabular-nums text-ink">{elapsedSec.toFixed(1)}s</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="font-mono tabular-nums text-ink">{liveWpm}</span> wpm
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="font-mono tabular-nums text-ink">{liveAcc}%</span> accuracy
        </div>
        {best && (
          <div className="ml-auto inline-flex items-center gap-1.5">
            Best <span className="font-mono tabular-nums text-accent">{best.wpm}</span> wpm
          </div>
        )}
        <button
          onClick={() => reset()}
          title="New text"
          aria-label="New text"
          className="text-muted hover:text-accent transition"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        onClick={() => inputRef.current?.focus()}
        className="rounded-xl border border-[var(--rule)] bg-[var(--rule-soft)] px-4 py-3.5 leading-relaxed font-mono text-[15px] tracking-[0.01em] cursor-text select-none break-words"
      >
        {target.split("").map((ch, i) => {
          const t = typed[i];
          const isCursor = i === typed.length && !finished;
          const cls = t == null
            ? "text-muted-2"
            : t === ch
              ? "text-ink"
              : ch === " "
                ? "text-down underline decoration-down"
                : "text-down";
          return (
            <span key={i} className={`${cls} ${isCursor ? "border-l-2 border-accent -ml-px" : ""}`}>
              {ch}
            </span>
          );
        })}
      </div>

      <input
        ref={inputRef}
        value={typed}
        onChange={onChange}
        disabled={finished}
        placeholder="Click the text above and start typing…"
        autoFocus
        className="rounded-xl bg-[var(--paper)] border border-[var(--rule)] px-3.5 py-2.5 text-[13.5px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2 disabled:opacity-50"
      />

      {finished && (
        <div className="flex items-center justify-between rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[var(--accent)] px-3 py-2 text-[12.5px]">
          <span>
            Done — <b className="text-ink">{liveWpm} wpm</b> at <b className="text-ink">{liveAcc}%</b> accuracy
            {best && liveWpm >= best.wpm && <span className="ml-2 text-accent font-semibold">new best!</span>}
          </span>
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-1 text-accent hover:underline text-[12px]"
          >
            <RotateCcw className="h-3 w-3" /> Try again
          </button>
        </div>
      )}
    </div>
  );
}
