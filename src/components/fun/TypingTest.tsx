"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Timer } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";

// A varied pool of prose — productivity essays, science, history, fiction,
// philosophy, sports, travel, finance, food, music. Long enough that the test
// isn't over in six seconds; varied enough that you don't see the same lines
// every refresh. Random per session; refresh button rolls a new one.
const SAMPLES = [
  "The first hour after waking is the most honest hour of the day. The phone is still off, the inbox hasn't started, and your priorities are not yet downstream of someone else's morning. Whoever guards this hour guards the whole day, because small acts of attention compound exactly the way small acts of money do, only over longer horizons and against louder resistance.",
  "A goal without a calendar is a wish, a wish without a number is a feeling, and a feeling without a daily practice is a slow regret. The trick is to write down the one thing that, if it were the only thing you did today, you would still be proud of, and then to actually do that thing before anything else asks for your attention.",
  "Speed of typing is not the point. The point is that your hands stop being the bottleneck between thought and screen, so the thought gets to land while it is still fresh. The faster fingers do not produce better thinking, but slow fingers absolutely produce worse thinking, because the brain forgets what it was about to say while waiting for the keyboard.",
  "Compounding is the quiet engine of every interesting outcome. The dollar saved at twenty does more than the dollar saved at fifty, and the sentence read on a Tuesday afternoon adds to a paragraph that did not exist before. We overestimate what a single year of effort can produce and underestimate what ten years of small, almost invisible effort can produce, especially when the effort is honest.",
  "Real focus is not pretending the noise is gone. It is choosing the one signal that matters, then routing every other signal into a queue you will visit on your own terms. Notifications are not free; each one is a tiny tax on the most expensive resource you have. Pay the tax intentionally or stop paying it at all, because the worst possible deal is to pay it accidentally, all day, forever.",
  "The Voyager probes were never meant to last this long. They were a tour of the outer planets, packed with film cameras and tape decks that should have rusted out decades ago. Instead they slipped past the heliopause, past everything the sun's wind can touch, and they are still talking. The signals come back so faint that the receivers on Earth treat them as a single photon at a time.",
  "Bread is a conversation between flour, water, and time. You can rush it with commercial yeast and get something edible by afternoon, or you can stir a pinch of yesterday's dough into today's bowl and wait. The slow loaf tastes of the room it sat in, of the bakery air, of the season; the fast loaf tastes only of itself. Patience is the only ingredient you cannot buy.",
  "When the lights go down in the concert hall, every cough sounds enormous and every shoe scuff feels like trespass. Then the first violin lifts a bow, and the room remembers what it came for. Music is not a thing you listen to from outside; it is a place you walk into, and the four hundred people sitting near you walked in too, and for the next ninety minutes you all live in the same building.",
  "The Mediterranean keeps a slower clock than the Atlantic. The waves come in lazy, the salt sits heavy on your skin, the towns close for lunch and stay closed until the sun has stopped trying. You eat tomatoes that taste of dirt and sunlight at the same time, and you wonder how you ever thought a refrigerator-pale supermarket version was the same fruit. You learn that the most important meal of the day is the long one.",
  "Markets do not reward intelligence. They reward stamina. The smartest analyst on the desk will still be wrong half the time, because nobody knows what tomorrow's headline will be, and the headline is what sets the price. The trader who lasts thirty years is rarely the one with the highest IQ in the room; she is the one who can lose three times in a row and still place the next trade with a steady hand.",
  "A garden is a slow argument with the place you live in. The soil wants weeds, the deer want hostas, the slugs want everything else, and you want tomatoes by July. Every year you negotiate a slightly different settlement. The summer you finally get the basil right is the summer the squash dies of mildew. Gardening teaches the most useful lesson there is, which is that nothing important is ever truly finished.",
  "Sleep is not a power-down; it is a second job your brain does while you are not looking. The day's experiences are sorted, the irrelevant ones discarded, and the small revelations that you were too busy to notice are quietly filed where you will find them next week. People who skimp on sleep do not gain those hours back. They simply pay for them later, with interest, in worse decisions and shorter tempers.",
  "Mountains do not care about your schedule. The cloud comes in when the cloud is ready, the wind picks up when the air decides, and the trail does not get easier because you have a flight to catch. The mountain teaches a hard kind of honesty: it asks what you can actually do, not what you would like to be able to do, and it is unmoved by the answer. The reward is the view, and a small permanent rearrangement of your sense of size.",
  "Cities are written in the language of small accidents. A coffee shop opens because a lease came up; a neighbourhood becomes the music district because three musicians moved into the same block; a corner becomes a meeting place because the bus stop happens to be there. We narrate the result as if a planner intended it, but most of what makes a city worth walking through is the residue of a thousand local choices nobody coordinated.",
  "A good question is more valuable than a good answer, because a good answer closes a door and a good question opens one. Most of what stops people thinking clearly is that they were given the wrong question first, and spent years inside it. Reframing what you are actually asking is the cheapest, fastest improvement available, and it costs nothing except the willingness to admit you might have been pointed in the wrong direction.",
  "The point of running is not the running. It is the version of yourself you become at mile four, when the body has stopped complaining and the mind has gone quiet, and there is just road and breath and the morning. You came out to lose weight, or to clear your head, or to train for a race, but you keep going for none of those reasons. You go because nothing else gives you that exact stillness so cheaply.",
  "Most books are too long. The author had a good chapter in them and a publisher who needed three hundred pages. The trick to reading well is not finishing every book you start; it is finding the right thirty pages inside each one and giving yourself permission to put the rest down. A library full of half-read books is the sign of a curious reader, not a lazy one.",
  "The kitchen knife is the one tool you should buy good. Everything else can be improvised, replaced, borrowed. A dull knife is dangerous because it makes you push, and the push slips; a sharp knife is honest, it goes where you point it and stops where you stop pushing. Once you have used a properly sharp blade for a week you will not understand how you ever thought cooking was tedious.",
  "Nothing in the universe is as fast as light, and nothing is as slow as a glacier, and we use both to keep time. The glacier remembers in centuries, the laser in femtoseconds. The remarkable thing about being alive right now is that the same species which used to track years by the position of the stars has built clocks accurate enough to measure how time itself slows down on the top floor of a tall building.",
  "Saving money is not about deprivation; it is about deciding, on purpose, which version of the future you want to be possible. Every dollar you keep is an option you have not yet spent. You can spend it later on something you care about, or you can spend it now on something you will not remember by Friday. The whole game is noticing the difference between the two, and then doing the boring thing nine times out of ten.",
  "A long letter is one of the kindest things one person can give another, because it is the one form of communication that nobody has to send. Email is functional, text is fast, calls are present, but a long letter is somebody choosing to spend an hour of their finite life thinking only about you. It does not matter whether the prose is any good. The fact of it is the point.",
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
  // v2 key intentionally resets the stored best from scratch.
  const [best, setBest] = usePref<Best | null>("hub.typing.best.v2", null);
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

  // Wrong keys are REJECTED rather than committed — the cursor refuses to
  // advance until you type the right character. We also flash a quick "miss"
  // pulse so the rejection is visible, and count misses for accuracy.
  const [miss, setMiss] = useState(0);
  const [missPulse, setMissPulse] = useState(0);
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (finished) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Backspace just steps back one — useful if you want to start over from
    // an earlier point without resetting the whole test.
    if (e.key === "Backspace") {
      e.preventDefault();
      setTyped((t) => t.slice(0, -1));
      return;
    }
    if (e.key.length !== 1) return; // ignore modifier-only / arrow / etc.
    e.preventDefault();
    if (!startedAt) setStartedAt(Date.now());
    const expected = target[typed.length];
    if (e.key === expected) {
      const next = typed + e.key;
      setTyped(next);
      if (next.length >= target.length) {
        const finishedTs = Date.now();
        setFinishedAt(finishedTs);
        const elapsed = (finishedTs - (startedAt ?? finishedTs)) / 1000 / 60;
        const wordsRaw = target.length / 5;
        const wpm = elapsed > 0 ? Math.round(wordsRaw / elapsed) : 0;
        const acc = Math.round((target.length / (target.length + miss)) * 100);
        if (!best || wpm > best.wpm) setBest({ wpm, acc, at: finishedTs });
      }
    } else {
      // Wrong key — block, flash, count.
      setMiss((m) => m + 1);
      setMissPulse((n) => n + 1);
    }
  }

  function reset(newSeed?: number) {
    setTyped("");
    setMiss(0);
    setStartedAt(null);
    setFinishedAt(null);
    setSeed(newSeed ?? Date.now());
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  const elapsedSec = startedAt ? ((finishedAt ?? now) - startedAt) / 1000 : 0;
  // typed is guaranteed correct (mistakes never commit), so wpm is just
  // typed-chars / 5 over elapsed minutes, and accuracy is correct / total
  // keystrokes (correct + missed).
  const liveWpm = elapsedSec > 0 ? Math.round((typed.length / 5) / (elapsedSec / 60)) : 0;
  const totalKeystrokes = typed.length + miss;
  const liveAcc = totalKeystrokes > 0 ? Math.round((typed.length / totalKeystrokes) * 100) : 100;
  const finished = !!finishedAt;

  // Put the cursor LINE exactly to the LEFT of the next character to type:
  // the char at `cursorIdx` starts at the centre, so the centre indicator
  // sits just before it. Typed text drifts off to the left (and is faded);
  // upcoming text waits to the right at full opacity.
  const cursorIdx = typed.length;
  const offset = trackWidth ? trackWidth / 2 - cursorIdx * CHAR_W : 0;

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
        {/* caret — sits at the centre, just left of the next character; flashes
            red briefly on a missed keystroke so the rejection is unmistakable */}
        <div
          key={missPulse}
          className={`pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-[2.5px] rounded-full z-10 ${missPulse ? "bg-[var(--down)] animate-[shake_.18s]" : "bg-[var(--accent)] animate-pulse"}`}
          style={{ boxShadow: missPulse ? "0 0 10px var(--down)" : "0 0 8px var(--glow)" }}
        />

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
            // typed[] is always correct-only now (wrong keys never commit),
            // so we just split on cursorIdx: left = already-typed (faded),
            // right = upcoming (full opacity, bright ink).
            const typedAlready = i < cursorIdx;
            const color = typedAlready ? "var(--ink-soft)" : "var(--ink)";
            const o = typedAlready ? 0.3 : 1;
            return (
              <span key={i} style={{ display: "inline-block", width: `${CHAR_W}px`, color, opacity: o }}>
                {ch}
              </span>
            );
          })}
        </div>
      </div>

      {/* Hidden input — captures every keystroke; focus follows the tape click.
          Wrong keys never reach `typed`; they're swallowed in onKeyDown so the
          cursor parks on the missed letter until you get it right. */}
      <input
        ref={inputRef}
        value={typed}
        onChange={() => { /* noop — onKeyDown is the source of truth */ }}
        onKeyDown={onKeyDown}
        disabled={finished}
        placeholder="Click the line above and start typing…"
        autoFocus
        className={`rounded-xl bg-[var(--paper)] border px-3.5 py-2 text-[12.5px] text-muted focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2 disabled:opacity-50 transition ${missPulse % 2 ? "border-[var(--down)] animate-[shake_.18s]" : "border-[var(--rule)]"}`}
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
