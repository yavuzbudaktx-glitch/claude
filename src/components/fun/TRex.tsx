"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

// A faithful, affectionate port of Chrome's offline T-Rex. Pixel-art dino +
// cacti + pterodactyls drawn on a canvas that RESIZES to fill its box, so the
// playfield always occupies the whole card. Jump on Space / ↑ / click, duck on
// ↓. Speed ramps with score; day flips to night every 700 points. Lifetime
// best persisted in localStorage.

// --- Pixel sprites ('1' = filled). Dino faces right; head top-right. --------
const DINO_BODY = [
  "00000000000000011111",
  "00000000000000111111",
  "00000000000000110011", // eye gap
  "00000000000000111111",
  "00000000000000111110",
  "00100000000011111100", // mouth
  "00110000000111111111",
  "00111000001111111111",
  "00111110011111111110",
  "00111111111111111100",
  "00011111111111111000",
  "00001111111111110000",
  "00000111111111100000",
  "00000011111111000000",
];
const DINO_DUCK = [
  "000000000000000111111",
  "000000000000001101111", // eye
  "000000000000001111111",
  "000000000000111111111",
  "001111111111111111110", // mouth
  "011111111111111111100",
  "111111111111111110000",
  "011111111111100000000",
  "001111110000000000000",
];

type State = "idle" | "playing" | "dead";
interface Obstacle { x: number; kind: "small" | "large" | "bird"; birdFrame?: number; yGrid: number }

const BEST_KEY = "brief.trex.best";

export function TRex() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>("idle");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);

  const stateRef = useRef<State>("idle");
  // physics in GRID units (size-independent); converted to px at draw time.
  const yoff = useRef(0);          // dino height above ground, grid units
  const vy = useRef(0);            // vertical velocity, grid/frame
  const ducking = useRef(false);
  const obs = useRef<Obstacle[]>([]);
  const speed = useRef(4.4);       // grid units / frame
  const spawnCd = useRef(60);
  const frame = useRef(0);
  const scoreRef = useRef(0);
  const groundShift = useRef(0);
  const dims = useRef({ W: 720, H: 220, dpr: 1 });
  const clouds = useRef<Array<{ x: number; y: number; s: number }>>([]);

  const G = 0.24;        // gravity, grid/frame^2
  const JUMP_V = -3.05;  // grid/frame

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    try { setBest(Number(localStorage.getItem(BEST_KEY) || "0")); } catch { /* noop */ }
  }, []);

  function start() {
    yoff.current = 0; vy.current = 0; ducking.current = false;
    obs.current = []; speed.current = 4.4; spawnCd.current = 50;
    frame.current = 0; scoreRef.current = 0; setScore(0);
    clouds.current = [];
    setState("playing");
  }
  function jump() {
    if (stateRef.current === "idle") { start(); return; }
    if (stateRef.current === "dead") { start(); return; }
    if (yoff.current <= 0.001) { vy.current = JUMP_V; }
  }

  // Input — note we DON'T preventDefault unless we're actually the dino's
  // game, so this never steals typing elsewhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "Spacebar") {
        if (stateRef.current !== "idle" || document.activeElement === wrapRef.current) e.preventDefault();
        jump();
      } else if (e.key === "ArrowDown") {
        if (stateRef.current === "playing") { e.preventDefault(); ducking.current = true; }
      }
    };
    const onUp = (e: KeyboardEvent) => { if (e.key === "ArrowDown") ducking.current = false; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize canvas to fill the box (DPR-aware).
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(240, Math.round(r.width));
      const H = Math.max(120, Math.round(r.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      dims.current = { W, H, dpr };
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Main loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cs = getComputedStyle(canvas);
    const themeColor = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;

    let raf = 0;
    const sprite = (grid: string[], px: number, py: number, u: number, color: string) => {
      ctx.fillStyle = color;
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        for (let c = 0; c < row.length; c++) {
          if (row[c] === "1") ctx.fillRect(Math.floor(px + c * u), Math.floor(py + r * u), Math.ceil(u), Math.ceil(u));
        }
      }
    };

    const loop = () => {
      const { W, H, dpr } = dims.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const night = Math.floor(scoreRef.current / 700) % 2 === 1;
      const FG = night ? themeColor("--ink", "#e6e6e8") : themeColor("--ink-soft", "#535353");
      const FAINT = themeColor("--muted-2", "#9aa0a6");
      const RULE = themeColor("--rule", "rgba(128,128,128,0.3)");

      const u = Math.max(1.3, Math.min(4.2, (H * 0.42) / 21)); // dino is 21 grid tall
      const groundY = H - Math.max(16, H * 0.16);
      const dinoX = Math.max(28, W * 0.10);

      // --- simulate ---
      const s = stateRef.current;
      if (s === "playing") {
        frame.current++;
        vy.current += G;
        yoff.current = Math.max(0, yoff.current - vy.current);
        if (yoff.current <= 0) { yoff.current = 0; if (vy.current > 0) vy.current = 0; }
        // ducking falls faster for a snappier drop
        if (ducking.current && yoff.current > 0) vy.current += G * 1.6;

        speed.current = Math.min(10.5, 4.4 + scoreRef.current * 0.0022);
        const spd = speed.current * u;
        groundShift.current = (groundShift.current + spd) % (14 * u);

        spawnCd.current--;
        if (spawnCd.current <= 0) {
          const canBird = scoreRef.current > 350 && Math.random() < 0.28;
          const kind: Obstacle["kind"] = canBird ? "bird" : (Math.random() < 0.32 ? "large" : "small");
          const yGrid = kind === "bird" ? [6, 11, 15][Math.floor(Math.random() * 3)] : 0;
          obs.current.push({ x: W + 10, kind, yGrid, birdFrame: 0 });
          const gapUnits = 52 + Math.random() * 52 - Math.min(18, scoreRef.current * 0.004);
          spawnCd.current = Math.max(28, Math.round(gapUnits / speed.current));
        }
        for (const o of obs.current) o.x -= spd;
        obs.current = obs.current.filter((o) => o.x > -40);

        if (frame.current % 5 === 0) scoreRef.current += 1;
        if (scoreRef.current % 25 === 0) setScore(scoreRef.current);

        // clouds
        if (clouds.current.length < 3 && Math.random() < 0.01) {
          clouds.current.push({ x: W + 30, y: H * (0.12 + Math.random() * 0.3), s: 0.4 + Math.random() * 0.3 });
        }
        for (const cl of clouds.current) cl.x -= spd * 0.25;
        clouds.current = clouds.current.filter((cl) => cl.x > -60);

        // --- collide ---
        const duck = ducking.current && yoff.current <= 0;
        const dTop = groundY - (duck ? 9 : 21) * u - (duck ? 0 : yoff.current * u);
        const dBoxX = dinoX + 3 * u, dBoxX2 = dinoX + (duck ? 18 : 17) * u;
        const dBoxY = dTop + 2 * u, dBoxY2 = groundY - 1 * u;
        for (const o of obs.current) {
          const ow = o.kind === "bird" ? 17 * u : (o.kind === "large" ? 11 * u : 7 * u);
          const oh = o.kind === "bird" ? 9 * u : (o.kind === "large" ? 18 * u : 14 * u);
          const oy = o.kind === "bird" ? groundY - o.yGrid * u - oh : groundY - oh;
          const ox = o.x, ox2 = o.x + ow, oy2 = oy + oh;
          const pad = 2 * u;
          if (dBoxX2 - pad < ox || dBoxX + pad > ox2 || dBoxY2 - pad < oy || dBoxY + pad > oy2) continue;
          // hit
          setScore(scoreRef.current);
          if (scoreRef.current > best) {
            try { localStorage.setItem(BEST_KEY, String(scoreRef.current)); } catch { /* noop */ }
            setBest(scoreRef.current);
          }
          setState("dead"); stateRef.current = "dead";
          break;
        }
      }

      // --- draw ---
      ctx.clearRect(0, 0, W, H);
      if (night) { ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(0, 0, W, H); }

      // moon / stars at night
      if (night) {
        ctx.fillStyle = FAINT;
        for (let i = 0; i < 6; i++) {
          const sx = ((i * 137 + frame.current * 0.1) % W);
          ctx.fillRect(sx, H * (0.1 + (i % 3) * 0.08), 2, 2);
        }
        ctx.fillStyle = FG;
        ctx.beginPath(); ctx.arc(W * 0.84, H * 0.2, 9, 0, Math.PI * 2); ctx.fill();
      }

      // clouds
      ctx.fillStyle = FAINT;
      for (const cl of clouds.current) {
        const cw = 26 * cl.s;
        ctx.fillRect(cl.x, cl.y, cw, 5 * cl.s);
        ctx.fillRect(cl.x + cw * 0.25, cl.y - 4 * cl.s, cw * 0.5, 5 * cl.s);
      }

      // ground line + scrolling bumps
      ctx.strokeStyle = RULE;
      ctx.lineWidth = Math.max(1, u * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, groundY + u);
      ctx.lineTo(W, groundY + u);
      ctx.stroke();
      ctx.fillStyle = FAINT;
      for (let x = -groundShift.current; x < W; x += 14 * u) {
        ctx.fillRect(x, groundY + 3 * u, 3 * u, u);
        ctx.fillRect(x + 7 * u, groundY + 4 * u, u, u);
      }

      // obstacles
      for (const o of obs.current) {
        if (o.kind === "bird") {
          const wingUp = Math.floor(frame.current / 6) % 2 === 0;
          const by = groundY - o.yGrid * u - 9 * u;
          // body
          ctx.fillStyle = FG;
          ctx.fillRect(o.x + 7 * u, by + 4 * u, 8 * u, 3 * u);
          ctx.fillRect(o.x + 13 * u, by + 3 * u, 4 * u, 3 * u); // head
          // wing
          if (wingUp) ctx.fillRect(o.x + 3 * u, by, 9 * u, 4 * u);
          else ctx.fillRect(o.x + 3 * u, by + 6 * u, 9 * u, 4 * u);
        } else {
          const large = o.kind === "large";
          const tH = (large ? 18 : 14) * u;
          const tx = o.x, top = groundY - tH;
          ctx.fillStyle = FG;
          // trunk
          ctx.fillRect(tx + 2 * u, top, 3 * u, tH);
          // arms
          ctx.fillRect(tx, top + 4 * u, 2 * u, u);
          ctx.fillRect(tx, top + 4 * u, u, 4 * u);
          ctx.fillRect(tx + 5 * u, top + 6 * u, 2 * u, u);
          ctx.fillRect(tx + 6 * u, top + 3 * u, u, 4 * u);
          if (large) { // second trunk for a cluster
            ctx.fillRect(tx + 8 * u, top + 3 * u, 3 * u, tH - 3 * u);
            ctx.fillRect(tx + 7 * u, top + 7 * u, u, 4 * u);
          }
        }
      }

      // dino
      const duck = ducking.current && yoff.current <= 0 && s === "playing";
      if (duck) {
        const top = groundY - 9 * u;
        sprite(DINO_DUCK, dinoX, top, u, FG);
        // legs
        const run = Math.floor(frame.current / 5) % 2 === 0;
        ctx.fillStyle = FG;
        ctx.fillRect(dinoX + 4 * u, groundY - 2 * u, 2 * u, run ? 2 * u : u);
        ctx.fillRect(dinoX + 9 * u, groundY - 2 * u, 2 * u, run ? u : 2 * u);
      } else {
        const top = groundY - 21 * u - yoff.current * u;
        sprite(DINO_BODY, dinoX, top, u, FG);
        const legTop = top + 13 * u;
        const onGround = yoff.current <= 0.001 && s === "playing";
        const run = Math.floor(frame.current / 5) % 2 === 0;
        ctx.fillStyle = FG;
        if (onGround) {
          // alternate legs for the run cycle
          ctx.fillRect(dinoX + 5 * u, legTop, 2 * u, (run ? 7 : 5) * u);
          ctx.fillRect(dinoX + 5 * u, legTop + (run ? 7 : 5) * u - u, 3 * u, u); // foot
          ctx.fillRect(dinoX + 10 * u, legTop, 2 * u, (run ? 5 : 7) * u);
          ctx.fillRect(dinoX + 10 * u, legTop + (run ? 5 : 7) * u - u, 3 * u, u);
        } else {
          // both legs tucked for the jump
          ctx.fillRect(dinoX + 5 * u, legTop, 2 * u, 5 * u);
          ctx.fillRect(dinoX + 10 * u, legTop, 2 * u, 5 * u);
        }
      }

      // score (top-right, mono)
      const fs = Math.max(12, Math.min(20, H * 0.085));
      ctx.font = `600 ${fs}px 'JetBrains Mono', ui-monospace, monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      const blink = scoreRef.current > 0 && scoreRef.current % 100 < 6 && Math.floor(frame.current / 4) % 2 === 0;
      ctx.fillStyle = FAINT;
      ctx.fillText("HI " + String(best).padStart(5, "0"), W - 14 - fs * 4.2, 10);
      ctx.fillStyle = blink ? FAINT : FG;
      ctx.fillText(String(scoreRef.current).padStart(5, "0"), W - 14, 10);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best]);

  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0">
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span>T-Rex run</span>
        <span>Best <span className="text-accent tabular-nums">{best}</span></span>
      </div>

      <div
        ref={wrapRef}
        tabIndex={0}
        onMouseDown={() => (state === "playing" ? jump() : start())}
        className="relative flex-1 min-h-0 rounded-2xl border border-[var(--rule)] bg-[var(--rule-soft)] overflow-hidden cursor-pointer select-none outline-none focus:ring-1 focus:ring-[var(--accent)]"
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {state !== "playing" && (
          <div className="absolute inset-0 grid place-items-center bg-black/25 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-semibold text-white shadow-lg"
                style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
              >
                {state === "dead"
                  ? <><RotateCcw className="h-4 w-4" /> Run again — {score}</>
                  : <><Play className="h-4 w-4" /> Start running</>}
              </button>
              <div className="text-[10.5px] text-white/75">Space / ↑ jump · ↓ duck</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
