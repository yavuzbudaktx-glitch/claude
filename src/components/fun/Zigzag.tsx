"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, RotateCcw } from "lucide-react";

// Zigzag — a replica of the Ketchapp classic. A ball auto-runs UP a winding
// diagonal path; it always travels at 45°, either up-right or up-left. Tap
// (click / space / arrow) to flip its direction. The path randomly turns —
// flip at the corners to stay on it. Roll off the edge and you fall. Speed
// ramps with distance.

interface Cell { x: number; y: number }
const key = (c: Cell) => `${c.x},${c.y}`;

// Build a long winding staircase: every step goes one tile "up" (y-1) and one
// tile sideways (x±1). Occasional direction flips create the corners you have
// to react to. The first few steps are straight so you can get oriented.
function buildPath(len: number): Cell[] {
  const path: Cell[] = [{ x: 0, y: 0 }];
  let dir = 1; // start up-right
  let run = 0;
  for (let i = 1; i < len; i++) {
    const last = path[i - 1];
    // Keep an easy straight runway at the very start.
    const minRun = 2;
    const turnChance = i < 6 ? 0 : 0.34;
    if (run >= minRun && Math.random() < turnChance) { dir = -dir; run = 0; }
    else run++;
    path.push({ x: last.x + dir, y: last.y - 1 });
  }
  return path;
}

const TILE = 11;        // tile size as % of the board
const CENTER_X = 50;
const CENTER_Y = 64;    // ball sits lower-centre so you can see the path ahead

export function Zigzag() {
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  // A tick counter purely to drive re-renders from the rAF loop.
  const [, setFrame] = useState(0);

  const pathRef = useRef<Cell[]>(buildPath(400));
  const setRef = useRef<Set<string>>(new Set(pathRef.current.map(key)));
  const idxRef = useRef(0);                 // committed path index the ball is on
  const moveDirRef = useRef(1);             // direction of the in-progress hop
  const desiredDirRef = useRef(1);          // player's queued direction
  const progressRef = useRef(0);            // 0..1 along the current hop
  const lastTsRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setBest(Number(localStorage.getItem("brief.zigzag.best") || "0")); } catch { /* noop */ }
  }, []);

  const reset = useCallback(() => {
    pathRef.current = buildPath(400);
    setRef.current = new Set(pathRef.current.map(key));
    idxRef.current = 0;
    // First hop matches the path so the player starts cleanly.
    const first = pathRef.current[1].x - pathRef.current[0].x;
    moveDirRef.current = first;
    desiredDirRef.current = first;
    progressRef.current = 0;
    lastTsRef.current = 0;
    setScore(0);
    setDead(false);
    setRunning(true);
  }, []);

  const flip = useCallback(() => {
    if (!running) return;
    desiredDirRef.current = -desiredDirRef.current;
  }, [running]);

  // Input — pointer, space, up-arrow all flip direction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        if (running) flip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, flip]);

  // Game loop.
  useEffect(() => {
    if (!running) return;
    const step = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min(50, ts - lastTsRef.current);
      lastTsRef.current = ts;

      const dur = Math.max(120, 250 - score * 1.4); // ms per hop, ramps faster
      progressRef.current += dt / dur;

      while (progressRef.current >= 1) {
        progressRef.current -= 1;
        // Commit the hop we just finished.
        const path = pathRef.current;
        const i = idxRef.current;
        const expected = path[i + 1] ? path[i + 1].x - path[i].x : moveDirRef.current;
        if (moveDirRef.current !== expected) {
          // Rolled off the path.
          setRunning(false);
          setDead(true);
          setScore((s) => {
            if (s > best) { setBest(s); try { localStorage.setItem("brief.zigzag.best", String(s)); } catch { /* noop */ } }
            return s;
          });
          return;
        }
        idxRef.current = i + 1;
        setScore((s) => s + 1);
        // Extend the path well ahead of the ball so it never runs out.
        if (idxRef.current > path.length - 60) {
          const extra = buildPath(200);
          const offsetX = path[path.length - 1].x - extra[0].x;
          const offsetY = path[path.length - 1].y - extra[0].y;
          for (let k = 1; k < extra.length; k++) {
            const c = { x: extra[k].x + offsetX, y: extra[k].y + offsetY };
            path.push(c);
            setRef.current.add(key(c));
          }
        }
        // Begin the next hop in the player's chosen direction.
        moveDirRef.current = desiredDirRef.current;
      }

      setFrame((f) => (f + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [running, score, best]);

  // ---- render ----
  const path = pathRef.current;
  const i = idxRef.current;
  const base = path[i];
  const p = progressRef.current;
  // Interpolated ball world position.
  const ballX = base.x + moveDirRef.current * p;
  const ballY = base.y - p;

  const toScreen = (wx: number, wy: number) => ({
    left: `${CENTER_X + (wx - ballX) * TILE}%`,
    top: `${CENTER_Y + (wy - ballY) * TILE}%`,
  });

  // Visible window of tiles around the ball.
  const from = Math.max(0, i - 4);
  const to = Math.min(path.length - 1, i + 16);
  const tiles: Array<{ c: Cell; idx: number }> = [];
  for (let k = from; k <= to; k++) tiles.push({ c: path[k], idx: k });

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span>Score <span className="text-ink tabular-nums">{score}</span></span>
        <span>Best <span className="text-accent tabular-nums">{best}</span></span>
      </div>

      <div ref={wrapRef} className="relative flex-1 min-h-0 grid place-items-center select-none touch-none" style={{ containerType: "size" }}>
        <div
          onPointerDown={(e) => { e.preventDefault(); if (running) flip(); }}
          className="relative rounded-2xl border border-[var(--rule)] overflow-hidden cursor-pointer"
          style={{
            width: "100cqmin", height: "100cqmin",
            background: `
              radial-gradient(130% 80% at 50% 110%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 55%),
              linear-gradient(180deg, color-mix(in srgb, var(--bg) 92%, #000) 0%, var(--rule-soft) 100%)
            `,
          }}
        >
          {/* path tiles */}
          {tiles.map(({ c, idx }) => {
            const { left, top } = toScreen(c.x, c.y);
            // Tiles fade in toward the far end so the path reads like it's
            // emerging from the dark.
            const dist = idx - i;
            const opacity = dist > 11 ? Math.max(0, 1 - (dist - 11) / 5) : 1;
            return (
              <span
                key={idx}
                className="absolute"
                style={{
                  left, top,
                  width: `${TILE}%`, height: `${TILE}%`,
                  transform: "translate(-50%, -50%)",
                  opacity,
                }}
              >
                <span
                  className="block h-full w-full"
                  style={{
                    borderRadius: "18%",
                    background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 30%, var(--paper)) 0%, color-mix(in srgb, var(--accent-2) 22%, var(--paper)) 100%)",
                    boxShadow: "0 6px 14px -6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
                    border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                  }}
                />
              </span>
            );
          })}

          {/* the ball */}
          {(() => {
            const { left, top } = toScreen(ballX, ballY);
            return (
              <span
                className="absolute rounded-full"
                style={{
                  left, top,
                  width: `${TILE * 0.62}%`, height: `${TILE * 0.62}%`,
                  transform: "translate(-50%, -50%)",
                  background: "radial-gradient(circle at 32% 30%, #fff, var(--accent) 60%, var(--accent-2))",
                  boxShadow: "0 0 14px var(--glow), 0 0 26px color-mix(in srgb, var(--accent) 55%, transparent)",
                  zIndex: 5,
                }}
              />
            );
          })()}

          {!running && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                {dead && <div className="text-[13px] font-semibold text-ink">You fell · {score}</div>}
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
                >
                  {dead
                    ? <><RotateCcw className="h-4 w-4" /> Try again</>
                    : <><Play className="h-4 w-4" /> Play</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-[10.5px] text-muted-2 shrink-0">
        Tap / click / space to turn — stay on the path
      </div>
    </div>
  );
}
