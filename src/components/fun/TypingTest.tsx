"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Timer } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";

// Longer evergreen prose so the test isn't over in 6 seconds. Random per
// session; refresh for a new one.
const SAMPLES = [
  "The first hour after waking is the most honest hour of the day. The phone is still off, the inbox hasn't started, and your priorities are not yet downstream of someone else's morning. Whoever guards this hour guards the whole day, because small acts of attention compound exactly the way small acts of money do, only over longer horizons and against louder resistance.",
  "A goal without a calendar is a wish, a wish without a number is a feeling, and a feeling without a daily practice is a slow regret. The trick is to write down the one thing that, if it were the only thing you did today, you would still be proud of, and then to actually do that thing before anything else asks for your attention.",
  "Speed of typing is not the point. The point is that your hands stop being the bottleneck between thought and screen, so the thought gets to land while it is still fresh. The faster fingers do not produce better thinking, but slow fingers absolutely produce worse thinking, because the brain forgets what it was about to say while waiting for the keyboard.",
  "Compounding is the quiet engine of every interesting outcome. The dollar saved at twenty does more than the dollar saved at fifty, and the sentence read on a Tuesday afternoon adds to a paragraph that did not exist before. We overestimate what a single year of effort can produce and underestimate what ten years of small, almost invisible effort can produce, especially when the effort is honest.",
  "Real focus is not pretending the noise is gone. It is choosing the one signal that matters, then routing every other signal into a queue you will visit on your own terms. Notifications are not free; each one is a tiny tax on the most expensive resource you have. Pay the tax intentionally or stop paying it at all, because the worst possible deal is to pay it accidentally, all day, forever.",
];

interface Best { wpm: number; acc: number; at: number }

function pickSample(seed = Date.now()): string { return SAMPLES[seed % SAMPLES.length]; }

const CHAR_W = 12;       // px per character — matches the mono font below
const CONTAINER_H = 56;  // px

export function TypingTest() {
  const [seed, setSeed] = useState(() => Date.now());
  const target = useMemo(() => pickSample(seed), [seed]);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [best, setBest] = usePref<Best | null>("hub.typing.best", null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  // Measure the visible tape width so we can center the cursor character
  // precisely. ResizeObserver keeps it accurate when the card resizes.
  useEffect(() => {
    const el = trackRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setTrackWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // Center the cursor character in the visible tape: shift the whole text
  // left by (cursor index × char width) − (half tape width). Negative offset
  // means typed characters slide off to the left; upcoming ones come from
  // the right, exactly the "ben yazdıkça yazı sağdan gelip sola doğru" feel.
  const cursorIdx = typed.length;
  const offset = trackWidth ? trackWidth / 2 - cursorIdx * CHAR_W - CHAR_W / 2 : 0;

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
        <button onClick={() => reset()} title="New text" aria-label="New text" className="text-muted hover:text-accent transition">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* The "tape" — a single line of characters that scrolls left as you
          type. The cursor character is locked at the centre. Edge gradients
          fade the far-left and far-right characters so they read as
          drifting in/out of focus. */}
      <div
        ref={trackRef}
        onClick={() => inputRef.current?.focus()}
        className="relative overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--rule-soft)] cursor-text select-none"
        style={{
          height: `${CONTAINER_H}px`,
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%)",
        }}
      >
        {/* center indicator line — subtle so it doesn't fight the text */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-[2px] bg-[var(--accent)] opacity-50 z-10" />

        <div
          className="absolute top-1/2 -translate-y-1/2 font-mono whitespace-pre"
          style={{
            transform: `translate(${offset}px, -50%)`,
            transition: "transform .12s cubic-bezier(.22,.61,.36,1)",
            fontSize: "18px",
            letterSpacing: "0",
            lineHeight: 1,
          }}
        >
          {target.split("").map((ch, i) => {
            const t = typed[i];
            const distFromCursor = i - cursorIdx;
            // Already typed → fade out toward the left; upcoming → muted; near cursor → bright.
            let color: string;
            if (t == null) {
              color = "var(--muted-2)";
            } else if (t === ch) {
              color = distFromCursor < -3 ? "var(--ink-soft)" : "var(--ink)";
            } else {
              color = "var(--down)";
            }
            // Opacity falls off the further you are from the cursor in either
            // direction — sells the "drifting" feel.
            const o = Math.max(0.25, 1 - Math.abs(distFromCursor) / 50);
            return (
              <span key={i} style={{ display: "inline-block", width: `${CHAR_W}px`, color, opacity: o }}>
                {ch === " " ? "·" : ch}
              </span>
            );
          })}
        </div>
      </div>

      {/* Hidden input — captures every keystroke; focus follows the tape click. */}
      <input
        ref={inputRef}
        value={typed}
        onChange={onChange}
        disabled={finished}
        placeholder="Click the line above and start typing…"
        autoFocus
        className="rounded-xl bg-[var(--paper)] border border-[var(--rule)] px-3.5 py-2 text-[12.5px] text-muted focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2 disabled:opacity-50"
      />

      {finished && (
        <div className="flex items-center justify-between rounded-xl bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[var(--accent)] px-3 py-2 text-[12.5px]">
          <span>
            Done — <b className="text-ink">{liveWpm} wpm</b> at <b className="text-ink">{liveAcc}%</b> accuracy
            {best && liveWpm >= best.wpm && <span className="ml-2 text-accent font-semibold">new best!</span>}
          </span>
          <button onClick={() => reset()} className="inline-flex items-center gap-1 text-accent hover:underline text-[12px]">
            <RotateCcw className="h-3 w-3" /> Try again
          </button>
        </div>
      )}
    </div>
  );
}
