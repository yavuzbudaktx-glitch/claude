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

// Accounting-flavoured prompts: a lot of numbers, tab/decimal-heavy phrasing,
// the language of financial statements. They're designed to push the right
// hand onto the numeric row and the symbol cluster ($ , . / % ( )) the way
// real ledger work does.
const ACCOUNTING_SAMPLES = [
  "Cash and cash equivalents at January 1 were $1,248,310, comprised of operating checking accounts of $412,650, money market funds of $620,400, and certificates of deposit of $215,260. By December 31 the balance had grown to $1,612,985, a year-over-year increase of 29.2%, driven primarily by $384,000 in operating cash flow and partially offset by $20,325 of capital expenditures and $19,000 of debt principal repayments.",
  "Accounts receivable aging at quarter-end stood at $362,450, with 78.4% current, 14.2% in the 31-60 day bucket, 5.1% in the 61-90 day bucket, and 2.3% over 90 days. We recorded an allowance for doubtful accounts of $11,420, equal to 3.15% of the gross receivable, consistent with the prior six quarters and slightly below the industry benchmark of 3.40%.",
  "The straight-line depreciation schedule for the $84,000 asset, placed in service on 03/15/2024 with a salvage value of $4,000 and a useful life of 5 years, produces an annual depreciation expense of $16,000 and a monthly charge of $1,333.33. Year-one expense, prorated for 9.5 months of service, is $12,666.67, leaving an end-of-year carrying amount of $71,333.33.",
  "The federal tax provision for the year is $48,720, calculated on taxable income of $232,000 at an effective rate of 21.0%, with a state add-on of $9,280 at 4.0% and zero remaining R&D credit after applying $12,500 of carryforward. Deferred tax assets are $18,610, deferred tax liabilities are $7,940, and the net deferred position of $10,670 is presented as non-current per ASC 740-10-45-4.",
  "Revenue for Q3 was $4,827,140, up 11.6% from $4,326,800 in Q3 of the prior year, with the SaaS segment contributing $3,180,420 (65.9%) and the services segment contributing $1,646,720 (34.1%). Gross margin was 71.4%, operating margin was 18.2%, and net margin was 13.9%, producing diluted earnings per share of $0.42 on a weighted-average share count of 16,028,500.",
  "The 36-month operating lease, signed 11/01/2025, has a base rent of $4,250.00 per month, escalating 3.0% annually on each anniversary. Total undiscounted payments over the lease are $158,196.45. Discounted at the company's incremental borrowing rate of 6.25%, the present value of $145,308.21 is recorded as a right-of-use asset and an offsetting lease liability under ASC 842-20-30-1.",
  "Inventory at FIFO of $612,400 was tested for net realizable value at 12/31; on hand were 4,820 units of SKU A at an average cost of $48.50 (total $233,770), 6,140 units of SKU B at $32.10 (total $197,094), and 9,070 units of SKU C at $19.50 (total $176,865). A write-down of $7,290 was recorded for 184 SKU C units at $39.62 below carrying cost, reducing inventory to $605,110.",
  "The bank reconciliation at month-end starts with a book balance of $84,612.45 and a bank balance of $89,178.20. Outstanding checks total $5,840.75, deposits in transit are $1,250.00, NSF returns are $420.00, the monthly service charge is $35.00, and interest credited is $40.00. Adjusted balances on both sides reconcile to $84,587.45.",
  "Net working capital improved from $612,450 to $784,310, a $171,860 increase. Days sales outstanding fell from 58.2 to 49.7, days payable outstanding extended from 41.0 to 47.6, and days inventory on hand was steady at 32.4, shortening the cash conversion cycle by 15.1 days. Free cash flow conversion (FCF / Net Income) rose to 92.4%, the strongest reading since 2021.",
  "Bond payable: $500,000 face, 5.000% coupon paid semi-annually 06/30 and 12/31, issued 01/01/2026 to yield 4.250%. Issue price is $522,182, producing an initial premium of $22,182 amortised on the effective-interest method. The 06/30/2026 interest expense is $11,096.37 (= $522,182 × 4.250% / 2), cash paid is $12,500.00, and premium amortised is $1,403.63.",
  "Variance analysis on the Plant A volume of 18,400 units produced the following: materials usage variance $2,840 U, materials price variance $1,620 F, labor efficiency variance $4,210 U, labor rate variance $980 U, variable overhead spending variance $1,150 F, and variable overhead efficiency variance $2,360 U. Total flexible-budget variance was $7,640 U against a standard cost of $612,540.",
  "Goodwill of $1,248,000 from the 2023 acquisition was tested for impairment at 09/30. The reporting unit's carrying amount was $4,820,000 versus an estimated fair value of $4,690,000, indicating impairment. The implied fair value of goodwill was $1,118,000, requiring an impairment charge of $130,000 to write goodwill down to its recoverable amount under ASC 350-20-35.",
];

const PROMPT_SETS: Record<"evergreen" | "accounting", string[]> = {
  evergreen: SAMPLES,
  accounting: ACCOUNTING_SAMPLES,
};
type PromptSet = keyof typeof PROMPT_SETS;

function pickSample(set: PromptSet, seed = Date.now()): string {
  const pool = PROMPT_SETS[set];
  return pool[seed % pool.length];
}

const CHAR_W = 12;       // px per character — matches the mono font below
const CONTAINER_H = 56;  // px

export function TypingTest() {
  // Which prompt pool the user is on — saved across devices.
  const [promptSet, setPromptSet] = usePref<PromptSet>("hub.typing.set", "evergreen");
  const [seed, setSeed] = useState(() => Date.now());
  const target = useMemo(() => pickSample(promptSet, seed), [promptSet, seed]);
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

  function switchSet(s: PromptSet) {
    setPromptSet(s);
    // Roll a fresh prompt from the new pool so you don't see your last
    // half-typed evergreen prompt under the new "accounting" tab.
    setTyped(""); setMiss(0); setStartedAt(null); setFinishedAt(null);
    setSeed(Date.now());
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Prompt-pool tabs */}
      <div className="flex items-center gap-1.5">
        {(["evergreen", "accounting"] as PromptSet[]).map((s) => (
          <button
            key={s}
            onClick={() => switchSet(s)}
            className={`chip normal-case !px-2.5 !py-0.5 !text-[11px] ${promptSet === s ? "chip-active" : ""}`}
          >
            {s === "evergreen" ? "Evergreen" : "Accounting · numbers"}
          </button>
        ))}
      </div>

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
