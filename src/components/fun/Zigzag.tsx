"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

// Zigzag — a replica of the Ketchapp classic. A ball auto-runs along a narrow
// 3D-isometric path that rises out of a dark void. It always moves at 45°,
// either up-right or up-left. Tap (click / space / arrow) to flip its
// direction. The path randomly turns; stay on it. The whole scene is rendered
// with CSS 3D transforms — a rotated/tilted "world" plane that the camera
// slides along as the ball climbs.

interface Cell { x: number; y: number }
const key = (c: Cell) => `${c.x},${c.y}`;

function buildPath(len: number, startDir = 1): Cell[] {
  const path: Cell[] = [{ x: 0, y: 0 }];
  let dir = startDir;
  let run = 0;
  for (let i = 1; i < len; i++) {
    const last = path[i - 1];
    const minRun = 2;
    // Slightly higher turn chance than my first attempt — the real game turns
    // every 3-4 tiles on average, which is what makes it tense.
    const turnChance = i < 4 ? 0 : 0.42;
    if (run >= minRun && Math.random() < turnChance) { dir = -dir; run = 0; }
    else run++;
    path.push({ x: last.x + dir, y: last.y - 1 });
  }
  return path;
}

// One world unit = TILE pixels (pre-transform). The 3D wrapper rotates the
// world plane so it reads isometric.
const TILE = 56;             // tile size in world px before the 3D transform
const HOP_BASE_MS = 240;     // ms to traverse one tile at score 0
const HOP_MIN_MS  = 110;
// Diamonds appear every ~4-5 tiles along the path. Worth +5 score each.
const DIAMOND_GAP = 4;

export function Zigzag() {
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [, setFrame] = useState(0);

  const pathRef = useRef<Cell[]>(buildPath(500));
  const setRef = useRef<Set<string>>(new Set(pathRef.current.map(key)));
  // Indices along the path where a diamond sits, that haven't been collected.
  const diamondsRef = useRef<Set<number>>(new Set());
  const idxRef = useRef(0);
  const moveDirRef = useRef(1);
  const desiredDirRef = useRef(1);
  const progressRef = useRef(0);
  const lastTsRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setBest(Number(localStorage.getItem("brief.zigzag.best") || "0")); } catch { /* noop */ }
  }, []);

  const seedDiamonds = useCallback(() => {
    diamondsRef.current.clear();
    const path = pathRef.current;
    for (let i = DIAMOND_GAP; i < path.length; i += DIAMOND_GAP + Math.floor(Math.random() * 3)) {
      diamondsRef.current.add(i);
    }
  }, []);

  const reset = useCallback(() => {
    pathRef.current = buildPath(500);
    setRef.current = new Set(pathRef.current.map(key));
    seedDiamonds();
    idxRef.current = 0;
    const first = pathRef.current[1].x - pathRef.current[0].x;
    moveDirRef.current = first;
    desiredDirRef.current = first;
    progressRef.current = 0;
    lastTsRef.current = 0;
    setScore(0);
    setDead(false);
    setRunning(true);
  }, [seedDiamonds]);

  const flip = useCallback(() => {
    if (!running) return;
    desiredDirRef.current = -desiredDirRef.current;
  }, [running]);

  // Input — pointer (click/tap), space, and arrow keys flip direction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        if (running) flip();
        else if (!dead && e.key === " ") reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, flip, dead, reset]);

  // Game loop.
  useEffect(() => {
    if (!running) return;
    const step = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min(50, ts - lastTsRef.current);
      lastTsRef.current = ts;

      const dur = Math.max(HOP_MIN_MS, HOP_BASE_MS - score * 1.2);
      progressRef.current += dt / dur;

      while (progressRef.current >= 1) {
        progressRef.current -= 1;
        const path = pathRef.current;
        const i = idxRef.current;
        const expected = path[i + 1] ? path[i + 1].x - path[i].x : moveDirRef.current;
        if (moveDirRef.current !== expected) {
          // Off the path — fall.
          setRunning(false);
          setDead(true);
          setScore((s) => {
            if (s > best) { setBest(s); try { localStorage.setItem("brief.zigzag.best", String(s)); } catch { /* noop */ } }
            return s;
          });
          return;
        }
        idxRef.current = i + 1;
        // Pick up the diamond if one's on the cell we just landed on.
        if (diamondsRef.current.has(i + 1)) {
          diamondsRef.current.delete(i + 1);
          setScore((s) => s + 6);  // +5 diamond +1 for the tile
        } else {
          setScore((s) => s + 1);
        }
        // Extend the path so the ball never runs out.
        if (idxRef.current > path.length - 80) {
          const lastDir = path[path.length - 1].x - path[path.length - 2].x;
          const extra = buildPath(300, lastDir);
          const offsetX = path[path.length - 1].x - extra[0].x;
          const offsetY = path[path.length - 1].y - extra[0].y;
          const base = path.length;
          for (let k = 1; k < extra.length; k++) {
            const c = { x: extra[k].x + offsetX, y: extra[k].y + offsetY };
            path.push(c);
            setRef.current.add(key(c));
            if ((base + k - 1) % (DIAMOND_GAP + Math.floor(Math.random() * 3)) === 0) {
              diamondsRef.current.add(base + k - 1);
            }
          }
        }
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
  const ballX = base.x + moveDirRef.current * p;
  const ballY = base.y - p;

  // Camera follows the ball — we translate the WORLD plane by -ball position,
  // so the ball sits at a fixed screen position while everything else slides
  // past underneath it.
  const cameraTx = -ballX * TILE;
  const cameraTy = -ballY * TILE;

  // Tile window — render only a band around the ball.
  const from = Math.max(0, i - 3);
  const to = Math.min(path.length - 1, i + 22);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span>Score <span className="text-ink tabular-nums">{score}</span></span>
        <span>Best <span className="text-accent tabular-nums">{best}</span></span>
      </div>

      {/* PERSPECTIVE: 3D camera. The world inside is rotated so the path reads
          isometric, like the real Ketchapp game. */}
      <div
        ref={wrapRef}
        onPointerDown={(e) => { e.preventDefault(); if (running) flip(); else if (dead) reset(); }}
        className="relative flex-1 min-h-0 rounded-2xl border border-[var(--rule)] overflow-hidden cursor-pointer select-none touch-none"
        style={{
          perspective: "900px",
          background: "linear-gradient(180deg, color-mix(in srgb, var(--bg) 96%, #000) 0%, #000 100%)",
        }}
      >
        {/* Subtle stars behind the void */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(1px 1px at 12% 22%, rgba(255,255,255,0.55), transparent 60%)," +
              "radial-gradient(1px 1px at 78% 14%, rgba(255,255,255,0.45), transparent 60%)," +
              "radial-gradient(1.5px 1.5px at 42% 70%, rgba(255,255,255,0.5), transparent 60%)," +
              "radial-gradient(1px 1px at 88% 60%, rgba(255,255,255,0.4), transparent 60%)," +
              "radial-gradient(1px 1px at 30% 88%, rgba(255,255,255,0.45), transparent 60%)",
          }}
        />

        {/* WORLD PLANE — rotated 55° on X (tilted forward), and we translate by
            the camera. The plane itself is large; only the windowed tiles get
            rendered into it. */}
        <div
          className="absolute"
          style={{
            left: "50%", top: "78%",
            width: 1, height: 1,
            transformStyle: "preserve-3d",
            transform: `rotateX(55deg) rotateZ(0deg) translate3d(${cameraTx}px, ${cameraTy}px, 0)`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {/* path tiles — each a flat square sitting on the world plane,
              raised slightly with a faux side face for depth. */}
          {Array.from({ length: to - from + 1 }, (_, n) => {
            const idx = from + n;
            const c = path[idx];
            const wx = c.x * TILE;
            const wy = c.y * TILE;
            // Fade tiles in toward the far end.
            const dist = idx - i;
            const opacity = dist > 16 ? Math.max(0, 1 - (dist - 16) / 5) : 1;
            const hasDiamond = diamondsRef.current.has(idx);
            return (
              <div key={idx} style={{ position: "absolute", left: wx, top: wy, opacity }}>
                {/* top face */}
                <div
                  style={{
                    position: "absolute",
                    left: -TILE / 2, top: -TILE / 2,
                    width: TILE, height: TILE,
                    background:
                      "linear-gradient(135deg, color-mix(in srgb, var(--accent) 65%, white) 0%, color-mix(in srgb, var(--accent-2) 55%, white) 100%)",
                    border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                    boxShadow:
                      "inset 0 0 0 2px rgba(255,255,255,0.18), inset 0 -4px 8px rgba(0,0,0,0.35)",
                  }}
                />
                {/* side face — faked with a translateZ-negative slab */}
                <div
                  style={{
                    position: "absolute",
                    left: -TILE / 2, top: -TILE / 2,
                    width: TILE, height: TILE,
                    background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 30%, #000) 0%, #000 100%)",
                    transform: "translateZ(-14px)",
                  }}
                />
                {hasDiamond && (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: -8, top: -22,
                      width: 16, height: 22,
                      transform: "rotateX(-55deg)",  // counter-rotate so the
                                                    // diamond stands UP relative
                                                    // to the screen.
                      background:
                        "linear-gradient(180deg, #b5f1ff 0%, var(--accent) 50%, color-mix(in srgb, var(--accent) 50%, #000) 100%)",
                      clipPath:
                        "polygon(50% 0%, 100% 35%, 80% 100%, 20% 100%, 0% 35%)",
                      filter: "drop-shadow(0 0 8px var(--glow))",
                      animation: "zz-spin 2.6s linear infinite",
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* the BALL — same world coords as ballX/ballY, raised above tile top */}
          <div
            style={{
              position: "absolute",
              left: ballX * TILE,
              top: ballY * TILE,
              transform: "translate(-50%, -50%) rotateX(-55deg)",
              zIndex: 50,
            }}
          >
            <div
              style={{
                width: TILE * 0.55,
                height: TILE * 0.55,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 32% 28%, #ffffff, var(--accent) 55%, var(--accent-2))",
                boxShadow:
                  "0 0 16px var(--glow), 0 0 32px color-mix(in srgb, var(--accent) 50%, transparent), 0 8px 14px rgba(0,0,0,0.45)",
              }}
            />
          </div>
        </div>

        {!running && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-sm z-[60]">
            <div className="flex flex-col items-center gap-2">
              {dead && <div className="text-[13px] font-semibold text-ink">You fell · {score}</div>}
              <button
                onClick={(e) => { e.stopPropagation(); reset(); }}
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

      <div className="text-center text-[10.5px] text-muted-2 shrink-0">
        Tap / space — flip direction. Stay on the path.
      </div>

      <style jsx>{`
        @keyframes zz-spin {
          0%   { transform: rotateX(-55deg) rotateY(0deg); }
          100% { transform: rotateX(-55deg) rotateY(360deg); }
        }
      `}</style>
    </div>
  );
}
