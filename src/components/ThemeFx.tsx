"use client";

import { useEffect } from "react";

// Shared interactivity engine for the themes that react to you.
//
// Two mechanisms, both opt-in per theme so nothing runs when it isn't wanted:
//
//  1. POINTER VARS — `--mx` / `--my` (px) and `--mxp` / `--myp` (0-1) are
//     written onto <html> on pointer move, throttled to one write per frame.
//     Any theme can then aim a gradient at the cursor with pure CSS. This is
//     what powers Noir's follow-spot and Circuit's probe glow, and it costs a
//     single style write per frame — no React state, no re-render.
//
//  2. A CANVAS, for effects CSS genuinely can't do: Sakura's falling petals
//     and Zen's rake ripples, which spawn where the pointer travels.
//
// Follows the WeatherFx pattern: detects the theme from <html data-theme>,
// watches it with a MutationObserver, pauses when the tab is hidden, and tears
// everything down on unmount.

type Petal = { x: number; y: number; r: number; vy: number; vx: number; sp: number; ph: number; a: number };
type Ripple = { x: number; y: number; t: number; life: number };

const POINTER_THEMES = new Set(["noir", "circuit"]);
const CANVAS_THEMES = new Set(["sakura", "zen"]);

export function ThemeFx() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let theme = "";
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let petals: Petal[] = [];
    let ripples: Ripple[] = [];
    let raf: number | null = null;
    let w = 0, h = 0;
    let pending = false;
    let px = 0, py = 0;
    let lastRipple = 0;

    const wantsPointer = () => POINTER_THEMES.has(theme);
    const wantsCanvas = () => CANVAS_THEMES.has(theme);

    // ---------- pointer vars ----------
    const flush = () => {
      pending = false;
      root.style.setProperty("--mx", `${px}px`);
      root.style.setProperty("--my", `${py}px`);
      root.style.setProperty("--mxp", (px / Math.max(1, window.innerWidth)).toFixed(4));
      root.style.setProperty("--myp", (py / Math.max(1, window.innerHeight)).toFixed(4));
    };
    const onPointer = (e: PointerEvent) => {
      px = e.clientX; py = e.clientY;
      if (wantsPointer() && !pending) { pending = true; requestAnimationFrame(flush); }
      // Zen rakes where you travel, but not on every single event.
      if (theme === "zen" && !reduce) {
        const now = performance.now();
        if (now - lastRipple > 90) {
          lastRipple = now;
          if (ripples.length < 40) ripples.push({ x: px, y: py, t: now, life: 1700 });
        }
      }
    };

    // ---------- canvas ----------
    function ensureCanvas() {
      if (canvas) return;
      const c = document.createElement("canvas");
      c.setAttribute("aria-hidden", "true");
      c.style.cssText =
        "position:fixed;inset:0;width:100vw;height:100dvh;z-index:-1;pointer-events:none;";
      document.body.appendChild(c);
      canvas = c;
      ctx = c.getContext("2d");
      resize();
    }
    function removeCanvas() {
      if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
      canvas = null; ctx = null; petals = []; ripples = [];
    }
    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (theme === "sakura") {
        const n = Math.max(26, Math.min(70, Math.round((w * h) / 26000)));
        petals = Array.from({ length: n }, () => spawnPetal(true));
      }
    }
    function spawnPetal(anywhere: boolean): Petal {
      const depth = Math.random();
      return {
        x: Math.random() * (w + 80) - 40,
        y: anywhere ? Math.random() * h : -20 - Math.random() * 120,
        r: 5 + depth * 7,
        vy: 0.35 + depth * 0.85,
        vx: -0.25 + Math.random() * 0.7,
        sp: 0.008 + Math.random() * 0.02,   // flutter speed
        ph: Math.random() * Math.PI * 2,
        a: 0.35 + depth * 0.4,
      };
    }

    function paint(now: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const light = !root.classList.contains("dark");

      if (theme === "sakura") {
        for (const p of petals) {
          p.ph += p.sp;
          // A petal doesn't fall straight: it rocks, and the rock is what
          // makes it read as a petal rather than a dot.
          const sway = Math.sin(p.ph) * 1.6;
          p.x += p.vx + sway * 0.5;
          p.y += p.vy;
          if (p.y - p.r > h) Object.assign(p, spawnPetal(false));
          const squash = Math.abs(Math.cos(p.ph));      // edge-on ↔ face-on
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ph * 0.5);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * (0.35 + squash * 0.65), p.r * 0.52, 0, 0, Math.PI * 2);
          ctx.fillStyle = light
            ? `rgba(244, 172, 194, ${p.a})`
            : `rgba(226, 140, 170, ${p.a * 0.75})`;
          ctx.fill();
          ctx.restore();
        }
      }

      if (theme === "zen") {
        // Rake rings: each pointer sample leaves a ring that expands and fades,
        // like a stone dropped into raked sand.
        ripples = ripples.filter((r) => now - r.t < r.life);
        for (const r of ripples) {
          const k = (now - r.t) / r.life;
          const rad = 6 + k * 78;
          ctx.beginPath();
          ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
          ctx.lineWidth = 1.4 * (1 - k);
          ctx.strokeStyle = light
            ? `rgba(120, 104, 84, ${0.28 * (1 - k)})`
            : `rgba(214, 198, 168, ${0.22 * (1 - k)})`;
          ctx.stroke();
        }
      }
    }

    function step(now: number) {
      paint(now);
      raf = requestAnimationFrame(step);
    }

    function start() {
      if (wantsCanvas()) {
        ensureCanvas();
        if (reduce) paint(performance.now());
        else if (raf == null) raf = requestAnimationFrame(step);
      }
      if (wantsPointer() || wantsCanvas()) {
        window.addEventListener("pointermove", onPointer, { passive: true });
      }
    }
    function stop() {
      if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      window.removeEventListener("pointermove", onPointer);
      removeCanvas();
      root.style.removeProperty("--mx");
      root.style.removeProperty("--my");
      root.style.removeProperty("--mxp");
      root.style.removeProperty("--myp");
    }

    function sync() {
      const next = root.getAttribute("data-theme") ?? "";
      if (next === theme) return;
      stop();
      theme = next;
      start();
    }

    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const onResize = () => resize();
    const onVis = () => {
      if (document.hidden) {
        if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      } else if (wantsCanvas() && !reduce && raf == null) {
        raf = requestAnimationFrame(step);
      }
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);

    sync();

    return () => {
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
  }, []);

  return null;
}
