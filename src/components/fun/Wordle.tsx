"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X, RotateCcw, Delete, CornerDownLeft } from "lucide-react";
import { localDateKey } from "@/lib/local-date";
import { usePref } from "@/components/PrefsProvider";
import useSWR from "swr";

interface WordleResp { date: string; refresh: string | null; answer: string }
type Letter = { ch: string; state: "right" | "present" | "wrong" | "empty" };
const ROWS = 6;
const COLS = 5;

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface SavedState { date: string; refresh: string; guesses: string[]; won: boolean }

function scoreGuess(guess: string, answer: string): Letter[] {
  const out: Letter[] = Array.from({ length: COLS }, () => ({ ch: "", state: "wrong" }));
  const remaining = answer.split("");
  for (let i = 0; i < COLS; i++) {
    out[i].ch = guess[i] ?? "";
    if (guess[i] === answer[i]) { out[i].state = "right"; remaining[i] = "_"; }
  }
  for (let i = 0; i < COLS; i++) {
    if (out[i].state === "right") continue;
    const idx = remaining.indexOf(guess[i] ?? "");
    if (idx >= 0) { out[i].state = "present"; remaining[idx] = "_"; }
  }
  return out;
}

const KEYS = [
  "Q W E R T Y U I O P".split(" "),
  "A S D F G H J K L".split(" "),
  ["ENTER", ..."Z X C V B N M".split(" "), "BACK"],
];

const RIGHT = "var(--up)";
const PRESENT = "#d4a017";

function tileColors(s: Letter["state"] | undefined, filled: boolean) {
  if (s === "right") return { bg: RIGHT, fg: "#fff", border: RIGHT };
  if (s === "present") return { bg: PRESENT, fg: "#fff", border: PRESENT };
  if (s === "wrong") return { bg: "var(--muted)", fg: "#fff", border: "var(--muted)" };
  return { bg: "transparent", fg: "var(--ink)", border: filled ? "var(--ink-soft)" : "var(--rule)" };
}

export function Wordle() {
  const dateKey = useMemo(() => localDateKey(), []);
  const [refreshN, setRefreshN] = useState(0);
  const { data, mutate } = useSWR<WordleResp>(
    `/api/wordle?d=${dateKey}&r=${refreshN}`,
    fetcher,
    { keepPreviousData: true },
  );
  const refreshKey = String(refreshN);

  const [state, setState] = usePref<SavedState>("hub.wordle.daily", { date: dateKey, refresh: "0", guesses: [], won: false });
  useEffect(() => {
    if (state.date !== dateKey || state.refresh !== refreshKey) {
      setState({ date: dateKey, refresh: refreshKey, guesses: [], won: false });
    }
  }, [dateKey, refreshKey, state.date, state.refresh, setState]);

  const [current, setCurrent] = useState("");
  const [shake, setShake] = useState(false);
  const guesses = state.date === dateKey && state.refresh === refreshKey ? state.guesses : [];
  const won = state.date === dateKey && state.refresh === refreshKey && state.won;
  const exhausted = guesses.length >= ROWS;
  const answer = (data?.answer ?? "").toUpperCase();
  const done = won || exhausted;

  function press(k: string) {
    if (!answer || done) return;
    if (k === "ENTER") {
      if (current.length !== COLS) { setShake(true); setTimeout(() => setShake(false), 380); return; }
      const next = [...guesses, current];
      const isWin = current === answer;
      setState({ date: dateKey, refresh: refreshKey, guesses: next, won: isWin });
      setCurrent("");
    } else if (k === "BACK") {
      setCurrent((c) => c.slice(0, -1));
    } else if (/^[A-Z]$/.test(k)) {
      setCurrent((c) => (c.length >= COLS ? c : c + k));
    }
  }

  // Physical keyboard — guarded so it never steals keystrokes meant for a
  // text input / textarea / contenteditable elsewhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); press("ENTER"); return; }
      if (e.key === "Backspace") { e.preventDefault(); press("BACK"); return; }
      const k = e.key.toUpperCase();
      if (/^[A-Z]$/.test(k)) { e.preventDefault(); press(k); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, guesses, won, exhausted, answer]);

  const letterStatus = useMemo(() => {
    type Scored = "right" | "present" | "wrong";
    const m: Record<string, Scored> = {};
    const rank: Record<Scored, number> = { wrong: 0, present: 1, right: 2 };
    for (const g of guesses) {
      const scored = scoreGuess(g, answer);
      for (const s of scored) {
        if (s.state === "empty") continue;
        const prev = m[s.ch];
        const cur = s.state as Scored;
        if (!prev || rank[cur] > rank[prev]) m[s.ch] = cur;
      }
    }
    return m;
  }, [guesses, answer]);

  function newGame() {
    setRefreshN((n) => n + 1);
    setCurrent("");
    mutate();
  }

  if (!data) return <p className="text-muted text-sm">Loading…</p>;

  return (
    <div className="flex flex-col items-center gap-3 h-full">
      <div className="flex items-center justify-between w-full shrink-0">
        <span className="font-display text-[15px] font-bold tracking-[0.18em] text-ink">WORDLE</span>
        <div className="flex items-center gap-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-2">
          <span>{dateKey}</span>
          <button onClick={newGame} className="inline-flex items-center gap-1 hover:text-accent transition" title="New game">
            <RotateCcw className="h-3 w-3" /> new
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-1.5 shrink-0" style={{ perspective: "900px" }}>
        {Array.from({ length: ROWS }).map((_, r) => {
          const isSubmitted = !!guesses[r];
          const isCurrent = r === guesses.length && !done;
          const g = guesses[r] ?? (isCurrent ? current : "");
          const scored = isSubmitted ? scoreGuess(g, answer) : null;
          const rowShake = isCurrent && shake;
          const rowWin = isSubmitted && won && r === guesses.length - 1;
          return (
            <div
              key={r}
              className="grid grid-cols-5 gap-1.5"
              style={rowShake ? { animation: "wordleShake .38s" } : undefined}
            >
              {Array.from({ length: COLS }).map((_, c) => {
                const ch = g[c] ?? "";
                const s = scored?.[c]?.state;
                const filled = !!ch;
                const { bg, fg, border } = tileColors(s, filled);
                const anim = isSubmitted
                  ? `wordleReveal .5s ease ${c * 0.18}s both`
                  : undefined;
                return (
                  <span
                    key={`${r}-${c}-${ch}`}
                    className="w-[44px] h-[44px] sm:w-[48px] sm:h-[48px] grid place-items-center font-display text-2xl font-bold rounded-lg"
                    style={{
                      background: bg,
                      color: fg,
                      border: `2px solid ${border}`,
                      animation: rowWin ? `wordleBounce .6s ease ${c * 0.08}s both` : anim,
                      transformStyle: "preserve-3d",
                      transition: "border-color .12s",
                    }}
                  >
                    {ch}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Keyboard */}
      <div className="flex flex-col gap-1.5 mt-auto shrink-0 w-full max-w-[380px]">
        {KEYS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1.5">
            {row.map((k) => {
              const st = letterStatus[k];
              const wide = k === "ENTER" || k === "BACK";
              const bg = st === "right" ? RIGHT
                : st === "present" ? PRESENT
                : st === "wrong" ? "var(--muted)" : "var(--rule-soft)";
              const fg = st ? "#fff" : "var(--ink)";
              return (
                <button
                  key={k}
                  onClick={() => press(k)}
                  className={`grid place-items-center rounded-md font-semibold text-[12px] h-11 transition active:scale-95 hover:brightness-110 ${wide ? "px-2.5" : "flex-1 min-w-0"}`}
                  style={{ background: bg, color: fg }}
                  aria-label={k}
                >
                  {k === "BACK" ? <Delete className="h-4 w-4" /> : k === "ENTER" ? <CornerDownLeft className="h-4 w-4" /> : k}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {done && (
        <div
          className={`text-center text-[12.5px] px-3.5 py-1.5 rounded-full shrink-0 ${won ? "text-up" : "text-down"}`}
          style={{ background: won ? "color-mix(in srgb, var(--up) 14%, transparent)" : "color-mix(in srgb, var(--down) 14%, transparent)" }}
        >
          {won
            ? <><Check className="inline h-3.5 w-3.5" /> Solved in {guesses.length}!</>
            : <><X className="inline h-3.5 w-3.5" /> Answer: <b>{answer}</b></>}
        </div>
      )}
    </div>
  );
}
