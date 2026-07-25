"use client";

import { useEffect } from "react";

// Real rain — a full-screen canvas of individual drops, shown only while the
// "rain" theme is active. Each drop has its own depth (near drops are longer,
// faster and more opaque than far ones), the whole field drifts with a slow
// wandering wind, a fog bank thickens toward the bottom, and once in a while a
// soft sheet of lightning washes the screen. It's a FOREGROUND layer (rain on
// the glass, in front of the cards) so it actually reads as bad weather —
// pointer-events:none so it never eats a click, and it sits below every
// popover/menu (those live at z-index 58+).
//
// Under prefers-reduced-motion we paint a single still frame instead of
// animating, so the rainy texture is there without any motion.

type Drop = { x: number; y: number; len: number; spd: number; th: number; a: number };

export function WeatherFx() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let drops: Drop[] = [];
    let raf: number | null = null;
    let active = false;
    let w = 0, h = 0;
    let wind = 0, windTarget = 0;

    const isRain = () => root.getAttribute("data-theme") === "rain";
    const isLight = () => !root.classList.contains("dark");

    // A CALM drizzle, not a downpour. Sparse, slow, soft, thin — the point is
    // ambience you can work under, so every value here is deliberately gentle
    // (an earlier version was ~3x denser and 3x faster and read as a storm).
    function spawn(anywhere: boolean): Drop {
      const depth = Math.random();               // 0 far … 1 near
      const len = 7 + depth * 11;
      return {
        x: Math.random() * (w + 160) - 80,
        y: anywhere ? Math.random() * h : -len - Math.random() * 120,
        len,
        spd: 2.4 + depth * 4.2,
        th: 0.6 + depth * 0.7,
        a: 0.05 + depth * 0.17,
      };
    }

    function ensureCanvas() {
      if (canvas) return;
      const c = document.createElement("canvas");
      c.setAttribute("aria-hidden", "true");
      c.style.cssText =
        "position:fixed;inset:0;width:100vw;height:100dvh;z-index:40;pointer-events:none;";
      document.body.appendChild(c);
      canvas = c;
      ctx = c.getContext("2d");
    }

    function removeCanvas() {
      if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
      canvas = null; ctx = null; drops = [];
    }

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      if (!canvas || !ctx) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Density scales with screen area, clamped so phones stay light and
      // ultrawides don't go sparse.
      const count = Math.max(70, Math.min(210, Math.round((w * h) / 9500)));
      drops = Array.from({ length: count }, () => spawn(true));
    }

    function paint() {
      if (!ctx) return;
      const light = isLight();
      ctx.clearRect(0, 0, w, h);

      // A soft haze low on the page — just enough to feel damp.
      const fog = ctx.createLinearGradient(0, h * 0.62, 0, h);
      if (light) {
        fog.addColorStop(0, "rgba(198,206,220,0)");
        fog.addColorStop(1, "rgba(198,206,220,0.16)");
      } else {
        fog.addColorStop(0, "rgba(8,13,22,0)");
        fog.addColorStop(1, "rgba(6,10,18,0.26)");
      }
      ctx.fillStyle = fog;
      ctx.fillRect(0, h * 0.62, w, h * 0.38);

      // The rain itself.
      const rgb = light ? "78,106,148" : "188,214,246";
      ctx.lineCap = "round";
      for (const d of drops) {
        ctx.strokeStyle = `rgba(${rgb},${d.a})`;
        ctx.lineWidth = d.th;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - wind * 1.4, d.y - d.len);
        ctx.stroke();
      }

      // No lightning: a flash is the least relaxing thing a page can do.
    }

    function step() {
      // A barely-there breeze that wanders instead of gusting.
      windTarget += (Math.random() - 0.5) * 0.03;
      if (windTarget > 1.1) windTarget = 1.1;
      if (windTarget < -1.1) windTarget = -1.1;
      wind += (windTarget - wind) * 0.015;

      for (const d of drops) {
        d.y += d.spd;
        d.x += wind * (d.spd / 9);
        if (d.y - d.len > h) Object.assign(d, spawn(false));
      }

      paint();
      raf = requestAnimationFrame(step);
    }

    function start() {
      if (active) return;
      active = true;
      ensureCanvas();
      resize();
      if (reduce) {
        paint();                 // one still, rainy frame
      } else {
        raf = requestAnimationFrame(step);
      }
    }

    function stop() {
      active = false;
      if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      removeCanvas();
    }

    function sync() {
      if (isRain()) {
        if (!active) start();
        else if (reduce) paint();   // re-tint on a light/dark flip
      } else {
        stop();
      }
    }

    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });

    const onResize = () => { if (active) resize(); };
    const onVis = () => {
      if (document.hidden) {
        if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      } else if (active && !reduce && raf == null) {
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
