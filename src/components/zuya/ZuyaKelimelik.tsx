"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Delete, CornerDownLeft } from "lucide-react";
import { zuyaToday } from "@/lib/zuya/day";

// Kelimelik — a Turkish 5-letter word game (Wordle-style) for the daily couple
// race. Same word for both players (shared /api/kelimelik seed + zuyaToday),
// ONE attempt per day, a timer from the first keypress, and an onComplete
// callback with the result. Full Turkish keyboard; Turkish-locale casing so
// İ/I and the accented letters behave correctly. In-progress state survives
// reloads via localStorage.

const ROWS = 6;
const COLS = 5;

export type TileState = "right" | "present" | "wrong";
export type BoardRow = { ch: string; state: TileState }[];

export interface KelimelikOutcome {
  won: boolean;
  guesses: number; // 0 when failed
  timeMs: number;
  board: BoardRow[];
}

interface Resp {
  answer: string;
}

interface Saved {
  day: string;
  guesses: string[];
  startedAt: number | null;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// Turkish letters are all single code points; split on them safely.
const letters = (s: string) => [...s];

export function scoreGuess(guess: string, answer: string): BoardRow {
  const g = letters(guess);
  const a = letters(answer);
  const out: BoardRow = Array.from({ length: COLS }, (_, i) => ({
    ch: g[i] ?? "",
    state: "wrong" as TileState,
  }));
  const remaining = [...a];
  for (let i = 0; i < COLS; i++) {
    if (g[i] === a[i]) {
      out[i].state = "right";
      remaining[i] = "_";
    }
  }
  for (let i = 0; i < COLS; i++) {
    if (out[i].state === "right") continue;
    const idx = remaining.indexOf(g[i] ?? "");
    if (idx >= 0) {
      out[i].state = "present";
      remaining[idx] = "_";
    }
  }
  return out;
}

// Full Turkish alphabet keyboard (29 letters, no Q/W/X).
const KEYS = [
  "E R T Y U I O P Ğ Ü".split(" "),
  "A S D F G H J K L Ş İ".split(" "),
  ["ENTER", ..."Z C V B N M Ö Ç".split(" "), "BACK"],
];

const RIGHT = "var(--up)";
const PRESENT = "#d4a017";

function tileColors(s: TileState | undefined, filled: boolean) {
  if (s === "right") return { bg: RIGHT, fg: "#fff", border: RIGHT };
  if (s === "present") return { bg: PRESENT, fg: "#fff", border: PRESENT };
  if (s === "wrong") return { bg: "var(--muted)", fg: "#fff", border: "var(--muted)" };
  return { bg: "transparent", fg: "var(--ink)", border: filled ? "var(--ink-soft)" : "var(--rule)" };
}

const TR_LETTERS = new Set("ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split(""));

export function ZuyaKelimelik({ onComplete }: { onComplete: (o: KelimelikOutcome) => void }) {
  const day = useMemo(() => zuyaToday(), []);
  const storageKey = `zuya.kelimelik.${day}`;
  const { data } = useSWR<Resp>(`/api/kelimelik?d=${day}`, fetcher, { revalidateOnFocus: false });

  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [shake, setShake] = useState(false);
  const startedAt = useRef<number | null>(null);
  const completed = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        if (saved.day === day) {
          setGuesses(saved.guesses);
          startedAt.current = saved.startedAt;
        }
      }
    } catch {}
  }, [storageKey, day]);

  function persist(gs: string[]) {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ day, guesses: gs, startedAt: startedAt.current } satisfies Saved),
      );
    } catch {}
  }

  const answer = data?.answer ?? "";

  function finish(gs: string[], won: boolean) {
    if (completed.current) return;
    completed.current = true;
    const timeMs = startedAt.current ? Date.now() - startedAt.current : 0;
    onComplete({
      won,
      guesses: won ? gs.length : 0,
      timeMs,
      board: gs.map((g) => scoreGuess(g, answer)),
    });
  }

  function press(k: string) {
    if (!answer || completed.current) return;
    if (startedAt.current === null && TR_LETTERS.has(k)) {
      startedAt.current = Date.now();
    }
    if (k === "ENTER") {
      if (letters(current).length !== COLS) {
        setShake(true);
        setTimeout(() => setShake(false), 380);
        return;
      }
      const next = [...guesses, current];
      setGuesses(next);
      persist(next);
      setCurrent("");
      if (current === answer) finish(next, true);
      else if (next.length >= ROWS) finish(next, false);
    } else if (k === "BACK") {
      setCurrent((c) => letters(c).slice(0, -1).join(""));
    } else if (TR_LETTERS.has(k)) {
      setCurrent((c) => (letters(c).length >= COLS ? c : c + k));
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); press("ENTER"); return; }
      if (e.key === "Backspace") { e.preventDefault(); press("BACK"); return; }
      // Turkish-locale uppercase so i→İ and ı→I map correctly.
      const k = e.key.toLocaleUpperCase("tr");
      if (TR_LETTERS.has(k)) { e.preventDefault(); press(k); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, guesses, answer]);

  const letterStatus = useMemo(() => {
    const m: Record<string, TileState> = {};
    const rank: Record<TileState, number> = { wrong: 0, present: 1, right: 2 };
    for (const g of guesses) {
      for (const s of scoreGuess(g, answer)) {
        if (!s.ch) continue;
        const prev = m[s.ch];
        if (!prev || rank[s.state] > rank[prev]) m[s.ch] = s.state;
      }
    }
    return m;
  }, [guesses, answer]);

  if (!data) return <p className="text-muted text-sm">Yükleniyor…</p>;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid gap-1" style={{ perspective: "900px" }}>
        {Array.from({ length: ROWS }).map((_, r) => {
          const isSubmitted = !!guesses[r];
          const isCurrent = r === guesses.length && !completed.current;
          const g = guesses[r] ?? (isCurrent ? current : "");
          const gl = letters(g);
          const scored = isSubmitted ? scoreGuess(g, answer) : null;
          return (
            <div
              key={r}
              className="grid grid-cols-5 gap-1"
              style={isCurrent && shake ? { animation: "wordleShake .38s" } : undefined}
            >
              {Array.from({ length: COLS }).map((_, c) => {
                const ch = gl[c] ?? "";
                const s = scored?.[c]?.state;
                const { bg, fg, border } = tileColors(s, !!ch);
                return (
                  <span
                    key={`${r}-${c}-${ch}`}
                    className="w-[38px] h-[38px] grid place-items-center font-display text-lg font-bold rounded-md"
                    style={{
                      background: bg,
                      color: fg,
                      border: `2px solid ${border}`,
                      animation: isSubmitted ? `wordleReveal .5s ease ${c * 0.15}s both` : undefined,
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

      <div className="flex flex-col gap-1.5 w-full max-w-[360px]">
        {KEYS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1">
            {row.map((k) => {
              const st = letterStatus[k];
              const wide = k === "ENTER" || k === "BACK";
              const bg =
                st === "right" ? RIGHT : st === "present" ? PRESENT : st === "wrong" ? "var(--muted)" : "var(--rule-soft)";
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => press(k)}
                  className={`grid place-items-center rounded-md font-semibold text-[11px] h-10 transition active:scale-95 hover:brightness-110 ${
                    wide ? "px-1.5" : "flex-1 min-w-0"
                  }`}
                  style={{ background: bg, color: st ? "#fff" : "var(--ink)" }}
                  aria-label={k}
                >
                  {k === "BACK" ? (
                    <Delete className="h-3.5 w-3.5" />
                  ) : k === "ENTER" ? (
                    <CornerDownLeft className="h-3.5 w-3.5" />
                  ) : (
                    k
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
