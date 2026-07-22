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
    let nextBolt = 0, flash = 0;

    const isRain = () => root.getAttribute("data-theme") === "rain";
    const isLight = () => !root.classList.contains("dark");

    function spawn(anywhere: boolean): Drop {
      const depth = Math.random();               // 0 far … 1 near
      const len = 9 + depth * 20;
      return {
        x: Math.random() * (w + 160) - 80,
        y: anywhere ? Math.random() * h : -len - Math.random() * 80,
        len,
        spd: 7 + depth * 15,
        th: 0.7 + depth * 1.2,
        a: 0.1 + depth * 0.38,
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
      const count = Math.max(220, Math.min(680, Math.round((w * h) / 2900)));
      drops = Array.from({ length: count }, () => spawn(true));
    }

    function paint() {
      if (!ctx) return;
      const light = isLight();
      ctx.clearRect(0, 0, w, h);

      // Fog bank rising from the bottom.
      const fog = ctx.createLinearGradient(0, h * 0.5, 0, h);
      if (light) {
        fog.addColorStop(0, "rgba(198,206,220,0)");
        fog.addColorStop(1, "rgba(198,206,220,0.34)");
      } else {
        fog.addColorStop(0, "rgba(8,13,22,0)");
        fog.addColorStop(1, "rgba(6,10,18,0.5)");
      }
      ctx.fillStyle = fog;
      ctx.fillRect(0, h * 0.5, w, h * 0.5);

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

      // Lightning wash (soft single flash, never a rapid strobe).
      if (flash > 0) {
        ctx.fillStyle = light
          ? `rgba(255,255,255,${0.1 * flash})`
          : `rgba(200,220,255,${0.18 * flash})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    function step() {
      // Wind wanders slowly, easing toward a drifting target.
      windTarget += (Math.random() - 0.5) * 0.05;
      if (windTarget > 2.4) windTarget = 2.4;
      if (windTarget < -2.4) windTarget = -2.4;
      wind += (windTarget - wind) * 0.02;

      for (const d of drops) {
        d.y += d.spd;
        d.x += wind * (d.spd / 13);
        if (d.y - d.len > h) Object.assign(d, spawn(false));
      }

      const now = performance.now();
      if (now > nextBolt && flash <= 0) {
        nextBolt = now + 9000 + Math.random() * 17000;
        flash = 1;
      }
      if (flash > 0) flash -= 0.05;

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
        nextBolt = performance.now() + 6000 + Math.random() * 10000;
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
