"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

// 2048 — the original mechanics: slide + merge, spawn a 2 (90%) or 4 (10%)
// after every move that changes the board, win at 2048, lose when no move is
// possible. Arrows / WASD / swipe. Best persisted in localStorage.

const SIZE = 4;
const N = SIZE * SIZE;
type Dir = "left" | "right" | "up" | "down";
const BEST_KEY = "brief.2048.best";

const TILE: Record<number, { bg: string; fg: string; sz: string }> = {
  2:    { bg: "#eee4da", fg: "#6b6258", sz: "text-2xl" },
  4:    { bg: "#ede0c8", fg: "#6b6258", sz: "text-2xl" },
  8:    { bg: "#f2b179", fg: "#fff", sz: "text-2xl" },
  16:   { bg: "#f59563", fg: "#fff", sz: "text-2xl" },
  32:   { bg: "#f67c5f", fg: "#fff", sz: "text-2xl" },
  64:   { bg: "#f65e3b", fg: "#fff", sz: "text-2xl" },
  128:  { bg: "#edcf72", fg: "#fff", sz: "text-xl" },
  256:  { bg: "#edcc61", fg: "#fff", sz: "text-xl" },
  512:  { bg: "#edc850", fg: "#fff", sz: "text-xl" },
  1024: { bg: "#edc53f", fg: "#fff", sz: "text-lg" },
  2048: { bg: "#edc22e", fg: "#fff", sz: "text-lg" },
};
function tileStyle(v: number) {
  return TILE[v] ?? { bg: "#3c3a32", fg: "#fff", sz: "text-base" };
}

function emptyBoard(): number[] { return Array(N).fill(0); }
function spawn(board: number[]): number {
  const empties = board.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  if (empties.length === 0) return -1;
  const idx = empties[Math.floor(Math.random() * empties.length)];
  board[idx] = Math.random() < 0.9 ? 2 : 4;
  return idx;
}

function slideLine(line: number[]): { line: number[]; gained: number; merged: boolean[] } {
  const nums = line.filter((v) => v !== 0);
  const res: number[] = [];
  const merged: boolean[] = [];
  let gained = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const v = nums[i] * 2;
      res.push(v); merged.push(true); gained += v; i++;
    } else { res.push(nums[i]); merged.push(false); }
  }
  while (res.length < SIZE) { res.push(0); merged.push(false); }
  return { line: res, gained, merged };
}

// Returns indices of a row/column in board order for a given direction so we
// can read a line, slide it toward the move direction, and write it back.
function lineIndices(dir: Dir, k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < SIZE; i++) {
    if (dir === "left") out.push(k * SIZE + i);
    else if (dir === "right") out.push(k * SIZE + (SIZE - 1 - i));
    else if (dir === "up") out.push(i * SIZE + k);
    else out.push((SIZE - 1 - i) * SIZE + k);
  }
  return out;
}

function move(board: number[], dir: Dir): { board: number[]; gained: number; moved: boolean; mergedAt: Set<number> } {
  const next = board.slice();
  let gained = 0; let moved = false;
  const mergedAt = new Set<number>();
  for (let k = 0; k < SIZE; k++) {
    const idxs = lineIndices(dir, k);
    const line = idxs.map((i) => board[i]);
    const r = slideLine(line);
    gained += r.gained;
    for (let i = 0; i < SIZE; i++) {
      if (next[idxs[i]] !== r.line[i]) moved = true;
      next[idxs[i]] = r.line[i];
      if (r.merged[i]) mergedAt.add(idxs[i]);
    }
  }
  return { board: next, gained, moved, mergedAt };
}

function canMove(board: number[]): boolean {
  if (board.some((v) => v === 0)) return true;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const v = board[r * SIZE + c];
    if (c + 1 < SIZE && board[r * SIZE + c + 1] === v) return true;
    if (r + 1 < SIZE && board[(r + 1) * SIZE + c] === v) return true;
  }
  return false;
}

export function Game2048() {
  const [board, setBoard] = useState<number[]>(() => {
    const b = emptyBoard(); spawn(b); spawn(b); return b;
  });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const popRef = useRef<Set<number>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setBest(Number(localStorage.getItem(BEST_KEY) || "0")); } catch { /* noop */ }
  }, []);

  const reset = useCallback(() => {
    const b = emptyBoard(); spawn(b); spawn(b);
    popRef.current = new Set();
    setBoard(b); setScore(0); setOver(false); setWon(false);
  }, []);

  const doMove = useCallback((dir: Dir) => {
    setBoard((prev) => {
      if (over) return prev;
      const { board: nb, gained, moved, mergedAt } = move(prev, dir);
      if (!moved) return prev;
      const spawnedIdx = spawn(nb);
      const pops = new Set(mergedAt);
      if (spawnedIdx >= 0) pops.add(spawnedIdx);
      popRef.current = pops;
      if (gained > 0) {
        setScore((s) => {
          const ns = s + gained;
          if (ns > best) { setBest(ns); try { localStorage.setItem(BEST_KEY, String(ns)); } catch { /* noop */ } }
          return ns;
        });
      }
      if (!won && nb.includes(2048)) setWon(true);
      if (!canMove(nb)) setOver(true);
      return nb;
    });
  }, [over, won, best]);

  // Keyboard — guarded so it never hijacks typing elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      let dir: Dir | null = null;
      if (k === "arrowleft" || k === "a") dir = "left";
      else if (k === "arrowright" || k === "d") dir = "right";
      else if (k === "arrowup" || k === "w") dir = "up";
      else if (k === "arrowdown" || k === "s") dir = "down";
      if (!dir) return;
      e.preventDefault();
      doMove(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove]);

  // Swipe.
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    let sx = 0, sy = 0, active = false;
    const start = (e: PointerEvent) => { sx = e.clientX; sy = e.clientY; active = true; };
    const end = (e: PointerEvent) => {
      if (!active) return; active = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? "right" : "left");
      else doMove(dy > 0 ? "down" : "up");
    };
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", end);
    return () => { el.removeEventListener("pointerdown", start); el.removeEventListener("pointerup", end); };
  }, [doMove]);

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 items-center">
      <div className="flex items-center justify-between w-full shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-[15px] font-bold tracking-tight text-ink">2048</span>
        </div>
        <div className="flex items-center gap-2">
          <Stat label="Score" value={score} />
          <Stat label="Best" value={best} accent />
          <button onClick={reset} className="btn-ghost !h-8 !w-8" title="New game" aria-label="New game">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="relative w-full max-w-[340px] aspect-square select-none touch-none">
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 gap-2 rounded-xl p-2"
             style={{ background: "var(--rule)" }}>
          {Array.from({ length: N }).map((_, i) => (
            <div key={i} className="rounded-lg" style={{ background: "color-mix(in srgb, var(--paper-2) 75%, var(--rule))" }} />
          ))}
        </div>
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 gap-2 p-2">
          {board.map((v, i) => {
            if (v === 0) return <div key={i} />;
            const { bg, fg, sz } = tileStyle(v);
            const pop = popRef.current.has(i);
            return (
              <div
                key={i}
                className={`grid place-items-center rounded-lg font-display font-bold ${sz}`}
                style={{
                  background: bg,
                  color: fg,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                  animation: pop ? "pop2048 .18s ease" : undefined,
                }}
              >
                {v}
              </div>
            );
          })}
        </div>

        {(over || won) && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/45 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="font-display text-xl font-bold text-white">
                {won ? "You hit 2048! 🎉" : "No moves left"}
              </div>
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
              >
                <RotateCcw className="h-4 w-4" /> {won ? "Play again" : "Try again"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-[10.5px] text-muted-2 shrink-0">Arrows / WASD — or swipe</div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg px-2.5 py-1 text-center min-w-[52px]" style={{ background: "var(--rule-soft)" }}>
      <div className="text-[8.5px] uppercase tracking-wider text-muted-2 leading-none">{label}</div>
      <div className={`text-[13px] font-bold tabular-nums leading-tight ${accent ? "text-accent" : "text-ink"}`}>{value}</div>
    </div>
  );
}
