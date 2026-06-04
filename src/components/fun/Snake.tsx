"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

const GRID = 18;
const TICK_BASE_MS = 130;
const TICK_MIN_MS = 75;

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
  const dirRef = useRef<Dir>("right");
  // The next direction queued by the user — applied at the start of the
  // next tick. Prevents two same-tick presses from reversing into the body.
  const queuedRef = useRef<Dir>("right");
  const [food, setFood] = useState<Cell>({ x: 5, y: 5 });
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [dead, setDead] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setBest(Number(localStorage.getItem("brief.snake.best") || "0")); } catch { /* noop */ }
  }, []);

  function reset() {
    setSnake([{ x: 9, y: 9 }]);
    dirRef.current = "right";
    queuedRef.current = "right";
    setFood({ x: 5, y: 5 });
    setScore(0);
    setDead(false);
    setRunning(true);
  }

  // Keyboard. We queue the direction and only apply at the next tick — that
  // way pressing Up then Left in the same frame doesn't let you backtrack.
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
      e.preventDefault();
      const cur = dirRef.current;
      // Disallow immediate reversal — has to be a perpendicular turn.
      if ((cur === "up" && next === "down") || (cur === "down" && next === "up") ||
          (cur === "left" && next === "right") || (cur === "right" && next === "left")) return;
      queuedRef.current = next;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  // Pointer / touch swipes for mobile.
  useEffect(() => {
    if (!running) return;
    const el = wrapRef.current;
    if (!el) return;
    let sx = 0, sy = 0, active = false;
    const start = (e: PointerEvent) => { sx = e.clientX; sy = e.clientY; active = true; };
    const end = (e: PointerEvent) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;
      const cur = dirRef.current;
      let next: Dir;
      if (Math.abs(dx) > Math.abs(dy)) next = dx > 0 ? "right" : "left";
      else next = dy > 0 ? "down" : "up";
      if ((cur === "up" && next === "down") || (cur === "down" && next === "up") ||
          (cur === "left" && next === "right") || (cur === "right" && next === "left")) return;
      queuedRef.current = next;
    };
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", end);
    return () => { el.removeEventListener("pointerdown", start); el.removeEventListener("pointerup", end); };
  }, [running]);

  // Tick — speeds up gradually as the snake grows.
  useEffect(() => {
    if (!running) return;
    const speed = Math.max(TICK_MIN_MS, TICK_BASE_MS - score * 2);
    const t = setInterval(() => {
      setSnake((prev) => {
        // Apply the queued direction at the START of the tick — guarantees
        // exactly one rotation per cell of forward motion, no matter how
        // fast you hammer the keys.
        const d = queuedRef.current;
        dirRef.current = d;
        const head = prev[prev.length - 1];
        const next: Cell = {
          x: head.x + (d === "left" ? -1 : d === "right" ? 1 : 0),
          y: head.y + (d === "up" ? -1 : d === "down" ? 1 : 0),
        };
        // Wall
        if (next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID) {
          setRunning(false); setDead(true); return prev;
        }
        const ate = eq(next, food);
        // Self-bite check — but ONLY against the segments that will still
        // be there after the move. When we're not eating, the tail moves
        // off the same tick, so chasing your own tail is legal (this was
        // the "kills me even though I didn't hit anything" bug).
        const willCheck = ate ? prev : prev.slice(1);
        if (willCheck.some((s) => eq(s, next))) {
          setRunning(false); setDead(true); return prev;
        }
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
    }, speed);
    return () => clearInterval(t);
  }, [running, food, best, score]);

  // Render the snake head with eyes oriented to its direction.
  const dir = dirRef.current;
  const head = snake[snake.length - 1];
  const eyeOffset = (axis: "x" | "y") => {
    if (axis === "x") return dir === "left" ? -22 : dir === "right" ? 22 : 0;
    return dir === "up" ? -22 : dir === "down" ? 22 : 0;
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span>Score <span className="text-ink tabular-nums">{score}</span></span>
        <span>Best <span className="text-accent tabular-nums">{best}</span></span>
      </div>

      <div ref={wrapRef} className="relative flex-1 min-h-0 grid place-items-center select-none touch-none" style={{ containerType: "size" }}>
        <div
          className="relative rounded-2xl border border-[var(--rule)] overflow-hidden"
          style={{
            width: "100cqmin", height: "100cqmin",
            background: `
              radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%),
              var(--rule-soft)
            `,
          }}
        >
          {/* subtle grid */}
          <div
            className="absolute inset-0 pointer-events-none opacity-50"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)
              `,
              backgroundSize: `${100 / GRID}% ${100 / GRID}%`,
            }}
          />

          {/* food — pulsing orb */}
          <span
            className="absolute rounded-full animate-pulse"
            style={{
              left: `${(food.x / GRID) * 100}%`,
              top: `${(food.y / GRID) * 100}%`,
              width: `${100 / GRID}%`, height: `${100 / GRID}%`,
              background: "radial-gradient(circle at 30% 30%, #ffd0a0, var(--down))",
              boxShadow: "0 0 12px var(--down), 0 0 22px color-mix(in srgb, var(--down) 60%, transparent)",
              transition: "left .12s linear, top .12s linear",
            }}
          />

          {/* snake — segments are rounded squares, gradient brighter toward the head */}
          {snake.map((c, i) => {
            const isHead = i === snake.length - 1;
            const t = snake.length > 1 ? i / (snake.length - 1) : 1;
            return (
              <span
                key={i}
                className="absolute"
                style={{
                  left: `${(c.x / GRID) * 100}%`,
                  top: `${(c.y / GRID) * 100}%`,
                  width: `${100 / GRID}%`, height: `${100 / GRID}%`,
                  padding: "1px",
                  transition: "left .08s linear, top .08s linear",
                }}
              >
                <span
                  className="block h-full w-full"
                  style={{
                    borderRadius: isHead ? "32%" : "26%",
                    background: isHead
                      ? "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)"
                      : `color-mix(in srgb, var(--accent) ${30 + t * 55}%, transparent)`,
                    boxShadow: isHead ? "0 0 10px var(--glow)" : "none",
                    position: "relative",
                  }}
                >
                  {isHead && (
                    <>
                      {/* eyes */}
                      <span className="absolute h-[18%] w-[18%] rounded-full bg-white"
                        style={{ left: `${30 + eyeOffset("x") * 0.2}%`, top: `${30 + eyeOffset("y") * 0.2}%` }} />
                      <span className="absolute h-[18%] w-[18%] rounded-full bg-white"
                        style={{ right: `${30 - eyeOffset("x") * 0.2}%`, top: `${30 + eyeOffset("y") * 0.2}%` }} />
                    </>
                  )}
                </span>
              </span>
            );
          })}

          {!running && (
            <div className="absolute inset-0 grid place-items-center bg-black/35 backdrop-blur-sm">
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
              >
                {dead
                  ? <><RotateCcw className="h-4 w-4" /> {score > 0 ? "Try again" : "Play"}</>
                  : <><Play className="h-4 w-4" /> Play</>}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-[10.5px] text-muted-2 shrink-0">
        Arrows / WASD — or swipe
      </div>
    </div>
  );
}
