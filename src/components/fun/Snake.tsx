"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

const GRID = 18;
const TICK_MS = 110;

type Dir = "up" | "down" | "left" | "right";
type Cell = { x: number; y: number };
const eq = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const randCell = (avoid: Cell[]): Cell => {
  while (true) {
    const c = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    if (!avoid.some((s) => eq(s, c))) return c;
  }
};

export function Snake() {
  const [snake, setSnake] = useState<Cell[]>([{ x: 9, y: 9 }]);
  const [dir, setDir] = useState<Dir>("right");
  const dirRef = useRef<Dir>("right");
  const [food, setFood] = useState<Cell>({ x: 5, y: 5 });
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [dead, setDead] = useState(false);

  useEffect(() => {
    try { setBest(Number(localStorage.getItem("brief.snake.best") || "0")); } catch { /* noop */ }
  }, []);

  function reset() {
    setSnake([{ x: 9, y: 9 }]);
    setDir("right");
    dirRef.current = "right";
    setFood({ x: 5, y: 5 });
    setScore(0);
    setDead(false);
    setRunning(true);
  }

  // Keyboard
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let next: Dir | null = null;
      if (k === "arrowup" || k === "w") next = "up";
      else if (k === "arrowdown" || k === "s") next = "down";
      else if (k === "arrowleft" || k === "a") next = "left";
      else if (k === "arrowright" || k === "d") next = "right";
      if (!next) return;
      const cur = dirRef.current;
      // Prevent reversing into yourself.
      if ((cur === "up" && next === "down") || (cur === "down" && next === "up") ||
          (cur === "left" && next === "right") || (cur === "right" && next === "left")) return;
      dirRef.current = next;
      setDir(next);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  // Tick loop
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSnake((prev) => {
        const head = prev[prev.length - 1];
        const d = dirRef.current;
        const next: Cell = {
          x: head.x + (d === "left" ? -1 : d === "right" ? 1 : 0),
          y: head.y + (d === "up" ? -1 : d === "down" ? 1 : 0),
        };
        // Wall
        if (next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID) {
          setRunning(false); setDead(true); return prev;
        }
        // Self-bite
        if (prev.some((s) => eq(s, next))) {
          setRunning(false); setDead(true); return prev;
        }
        const ate = eq(next, food);
        const body = ate ? [...prev, next] : [...prev.slice(1), next];
        if (ate) {
          setFood(randCell(body));
          setScore((s) => {
            const n = s + 1;
            if (n > best) {
              setBest(n);
              try { localStorage.setItem("brief.snake.best", String(n)); } catch { /* noop */ }
            }
            return n;
          });
        }
        return body;
      });
    }, TICK_MS);
    return () => clearInterval(t);
  }, [running, food, best]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span>Score <span className="text-ink tabular-nums">{score}</span></span>
        <span>Best <span className="text-accent tabular-nums">{best}</span></span>
      </div>

      <div className="relative flex-1 min-h-0 grid place-items-center">
        <div
          className="relative aspect-square w-full max-w-[420px] rounded-xl border border-[var(--rule)] bg-[var(--rule-soft)] overflow-hidden"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: `${100 / GRID}% ${100 / GRID}%`,
          }}
        >
          {/* food */}
          <span
            className="absolute rounded-sm"
            style={{
              left: `${(food.x / GRID) * 100}%`,
              top: `${(food.y / GRID) * 100}%`,
              width: `${100 / GRID}%`, height: `${100 / GRID}%`,
              background: "var(--down)",
              boxShadow: "0 0 6px var(--down)",
            }}
          />
          {/* snake */}
          {snake.map((c, i) => (
            <span
              key={i}
              className="absolute rounded-sm"
              style={{
                left: `${(c.x / GRID) * 100}%`,
                top: `${(c.y / GRID) * 100}%`,
                width: `${100 / GRID}%`, height: `${100 / GRID}%`,
                background: i === snake.length - 1 ? "var(--accent)" : "var(--accent-2)",
                opacity: i === snake.length - 1 ? 1 : 0.65 + (i / snake.length) * 0.35,
              }}
            />
          ))}

          {!running && (
            <div className="absolute inset-0 grid place-items-center bg-black/30 backdrop-blur-sm">
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
              >
                {dead ? <><RotateCcw className="h-4 w-4" /> Try again</> : <><Play className="h-4 w-4" /> Play</>}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-[10.5px] text-muted-2 shrink-0">
        Arrows or WASD to move
      </div>
    </div>
  );
}
