"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";

// A faithful (if affectionate) port of Chrome's offline T-Rex. Canvas
// everything; jump on Space / ArrowUp / click; duck on ArrowDown. Speed
// ramps up with score. Lifetime best persisted in localStorage.

const W = 720, H = 180;
const GROUND_Y = H - 26;
const REX_X = 56;
const GRAVITY = 0.85;
const JUMP_V = -13;

interface RectObj { x: number; y: number; w: number; h: number; kind: "small" | "big" }
type State = "idle" | "playing" | "dead";

export function TRex() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>("idle");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  // Game refs (mutated inside the loop, not via React state).
  const rexY = useRef(GROUND_Y);
  const rexV = useRef(0);
  const ducking = useRef(false);
  const obs = useRef<RectObj[]>([]);
  const speed = useRef(6);
  const spawnTimer = useRef(0);
  const frame = useRef(0);
  const scoreRef = useRef(0);
  const stateRef = useRef<State>("idle");

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    try { setBest(Number(localStorage.getItem("brief.trex.best") || "0")); } catch { /* noop */ }
  }, []);

  function jump() {
    if (stateRef.current === "idle") { start(); return; }
    if (stateRef.current === "dead") { restart(); return; }
    if (rexY.current >= GROUND_Y) {
      rexV.current = JUMP_V;
    }
  }
  function start() {
    rexY.current = GROUND_Y; rexV.current = 0;
    obs.current = [];
    speed.current = 6; spawnTimer.current = 0; frame.current = 0;
    scoreRef.current = 0; setScore(0);
    setState("playing");
  }
  function restart() { start(); }

  // Input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "Spacebar") {
        e.preventDefault(); jump();
      } else if (e.key === "ArrowDown") {
        ducking.current = true;
      } else if (e.key === "Enter" && stateRef.current === "dead") {
        e.preventDefault(); restart();
      }
    };
    const onUp = (e: KeyboardEvent) => { if (e.key === "ArrowDown") ducking.current = false; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // Render + simulate (single rAF loop).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastSpawn = 0;
    const inkLight = "#9aa0a6";
    const inkDark = "#535860";

    function spawn() {
      const big = Math.random() < 0.25;
      const w = big ? 22 : 14;
      const h = big ? 36 : 26;
      obs.current.push({ x: W + 20, y: GROUND_Y - h, w, h, kind: big ? "big" : "small" });
    }

    function draw() {
      const w = canvas!.width, h = canvas!.height;
      ctx!.clearRect(0, 0, w, h);

      // ground
      ctx!.strokeStyle = inkLight;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(0, GROUND_Y + 4);
      ctx!.lineTo(w, GROUND_Y + 4);
      ctx!.stroke();
      // ground dashes
      ctx!.strokeStyle = inkDark;
      ctx!.beginPath();
      for (let x = -(frame.current * speed.current) % 22; x < w; x += 22) {
        ctx!.moveTo(x, GROUND_Y + 8);
        ctx!.lineTo(x + 6, GROUND_Y + 8);
      }
      ctx!.stroke();

      // Rex (simple body block — recognisable silhouette).
      const rexH = ducking.current ? 26 : 40;
      const rexW = ducking.current ? 48 : 32;
      const yTop = (ducking.current ? GROUND_Y - 26 : rexY.current - 40);
      ctx!.fillStyle = inkDark;
      // body
      ctx!.fillRect(REX_X, yTop + 12, rexW - 8, rexH - 16);
      // head
      ctx!.fillRect(REX_X + rexW - 14, yTop, 14, 14);
      // eye
      ctx!.fillStyle = "#ffffff";
      ctx!.fillRect(REX_X + rexW - 5, yTop + 4, 2, 2);
      ctx!.fillStyle = inkDark;
      // tail
      ctx!.fillRect(REX_X - 6, yTop + 16, 8, 6);
      // legs — alternate so it reads as running
      if (rexY.current >= GROUND_Y && stateRef.current === "playing") {
        const phase = Math.floor(frame.current / 5) % 2;
        ctx!.fillRect(REX_X + 4, GROUND_Y - 6, 4, 8);
        ctx!.fillRect(REX_X + (rexW - 12), GROUND_Y - 6 + (phase ? 0 : 2), 4, phase ? 8 : 6);
      } else {
        ctx!.fillRect(REX_X + 6, GROUND_Y - 6, 4, 8);
        ctx!.fillRect(REX_X + (rexW - 12), GROUND_Y - 6, 4, 8);
      }

      // obstacles (cacti)
      ctx!.fillStyle = inkDark;
      for (const o of obs.current) {
        ctx!.fillRect(o.x, o.y, o.w, o.h);
        if (o.kind === "big") {
          // little branches
          ctx!.fillRect(o.x - 4, o.y + 8, 4, 10);
          ctx!.fillRect(o.x + o.w, o.y + 14, 4, 10);
        }
      }

      // score
      ctx!.fillStyle = inkLight;
      ctx!.font = "600 14px 'JetBrains Mono', ui-monospace, monospace";
      ctx!.textAlign = "right";
      const sStr = String(scoreRef.current).padStart(5, "0");
      ctx!.fillText(sStr, w - 12, 18);
      ctx!.fillStyle = inkDark;
      ctx!.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
      ctx!.fillText("HI " + String(best).padStart(5, "0"), w - 80, 18);
    }

    function step() {
      const s = stateRef.current;
      if (s === "playing") {
        frame.current++;
        // gravity
        rexV.current += GRAVITY;
        rexY.current = Math.min(GROUND_Y, rexY.current + rexV.current);

        // spawn obstacles — minimum gap scales with speed so the game stays fair.
        spawnTimer.current--;
        if (spawnTimer.current <= 0) {
          spawn();
          const minGap = Math.max(40, 80 - Math.floor(speed.current * 4));
          spawnTimer.current = minGap + Math.floor(Math.random() * 60);
          lastSpawn = frame.current;
        }
        // move obstacles
        for (const o of obs.current) o.x -= speed.current;
        obs.current = obs.current.filter((o) => o.x + o.w > -8);

        // speed up gradually
        speed.current = Math.min(15, 6 + scoreRef.current * 0.005);

        // score (frame-based)
        if (frame.current % 4 === 0) {
          scoreRef.current++;
          if (scoreRef.current % 20 === 0) setScore(scoreRef.current);
        }

        // collide
        const rexH = ducking.current ? 26 : 40;
        const rexW = ducking.current ? 48 : 32;
        const rx = REX_X, ry = ducking.current ? GROUND_Y - 26 : rexY.current - 40;
        // Tightened hitbox — the visible Rex has thin tail/head; a body-only
        // box ≈ the real silhouette feels fairer.
        const pad = 6;
        for (const o of obs.current) {
          if (rx + rexW - pad < o.x) continue;
          if (rx + pad > o.x + o.w) continue;
          if (ry + rexH - pad < o.y) continue;
          if (ry + pad > o.y + o.h) continue;
          // hit
          setScore(scoreRef.current);
          if (scoreRef.current > best) {
            try { localStorage.setItem("brief.trex.best", String(scoreRef.current)); } catch { /* noop */ }
            setBest(scoreRef.current);
          }
          setState("dead");
          stateRef.current = "dead";
          break;
        }
      }
      draw();
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span>T-Rex</span>
        <span>Best <span className="text-accent tabular-nums">{best}</span></span>
      </div>
      <div className="relative flex-1 min-h-0 grid place-items-center">
        <div
          onClick={() => state !== "playing" ? (state === "idle" ? start() : restart()) : jump()}
          className="relative w-full max-w-[720px] rounded-xl border border-[var(--rule)] bg-[var(--rule-soft)] overflow-hidden cursor-pointer select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
        >
          <canvas ref={canvasRef} width={W} height={H} className="absolute inset-0 w-full h-full" />
          {state !== "playing" && (
            <div className="absolute inset-0 grid place-items-center bg-black/30 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <button
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
                >
                  {state === "dead"
                    ? <><RotateCcw className="h-4 w-4" /> Run again — {score}</>
                    : <><Play className="h-4 w-4" /> Start running</>}
                </button>
                <div className="text-[10.5px] text-white/70">Space / ↑ to jump · ↓ to duck</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
