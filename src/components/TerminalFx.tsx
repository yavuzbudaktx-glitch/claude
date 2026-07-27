"use client";

import { useEffect } from "react";

// Digital rain for the "terminal" theme, on one canvas that only exists while
// that theme is on. It is a pure BACKGROUND layer — fixed, inset 0, z-index -1,
// pointer-events none — so it lands above the aurora (body::before) and below
// the CRT scanlines (body::after), and never in front of a word or a click.
// The cards blur whatever is behind them (backdrop-filter), so over a card the
// rain reads as a soft phosphor haze rather than glyphs competing with text.
//
// Two decisions do most of the work here:
//
//  · IT IS STEPPED, NOT SMOOTH. Rows advance on a fixed ~76ms tick, which is
//    how the effect is supposed to read (a character cell either holds a glyph
//    or it doesn't — there is no half-row). It also means we repaint ~13 times
//    a second instead of 60, so this costs about a fifth of what a per-frame
//    version would on a phone.
//  · NOTHING ALLOCATES PER FRAME. The glyph in a cell is a pure function of
//    (column, row, epoch) — a hash, no per-column buffers — and every fill
//    colour comes from a small table of pre-built rgba() strings, quantised to
//    SHADES levels. A frame is therefore N fillText calls and zero garbage.
//
// The glyph set is mostly digits with some hex letters and operators mixed in:
// the ask was "hacking numbers", and digits are also the most legible thing to
// have drifting behind real text.
//
// Density and alpha are deliberately restrained — this sits behind a dashboard
// all day. Columns idle between runs so the field never fills up, and light
// mode drops to roughly a quarter of the ink because paper has nowhere near
// the headroom a black CRT does.
//
// Under prefers-reduced-motion we seed the columns at random heights and paint
// exactly one frame: the texture is there, the motion isn't.

const CHARS = ("0123456789".repeat(3) + "ABCDEF" + "<>/\\|=+*:;#%").split("");

const STEP_MS = 76;      // one row of travel; also the repaint interval
const SHADES = 14;       // quantised alpha levels in the tail ramp
const CATCHUP = 4;       // missed steps we're willing to replay in one frame

// Column brightness classes: most of the field is dim, a few columns run
// bright and fast — that variation is what stops a grid of falling text from
// looking like a screensaver. [weight, ink multiplier, speed range].
const CLASSES = [
  { w: 0.52, ink: 0.55, spd: [0.26, 0.5] },
  { w: 0.36, ink: 0.8, spd: [0.4, 0.7] },
  { w: 0.12, ink: 1.0, spd: [0.62, 0.95] },
];

// Dark is a black CRT with real phosphor headroom. Light is paper: the same
// hue, a fraction of the ink, and a head that goes DARKER instead of hotter,
// because on a pale background "bright" means "invisible".
const TONE = {
  dark: { headA: 0.85, tailA: 0.5, toward: [230, 255, 240], mix: 0.72, fallback: "#22ff77" },
  light: { headA: 0.3, tailA: 0.12, toward: [8, 40, 22], mix: 0.35, fallback: "#0f6b34" },
};

type Col = { x: number; row: number; acc: number; spd: number; tail: number; cls: number; wait: number };

// Custom properties come back as whatever token the author wrote, so accept
// both hex and rgb(). Anything else falls through to the theme's own default.
function parseRGB(raw: string): [number, number, number] | null {
  const s = raw.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return Number.isNaN(r + g + b) ? null : [r, g, b];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return Number.isNaN(r + g + b) ? null : [r, g, b];
    }
    return null;
  }
  const m = s.match(/-?\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

// Which glyph sits in a cell. Deterministic from position plus an epoch, so
// there is no per-column state to keep and a cell "mutates" simply by its
// epoch ticking over — the epochs are staggered per cell so a handful change
// on any given step instead of the whole field flipping at once.
function glyphAt(col: number, row: number, epoch: number): string {
  let h = Math.imul(col, 374761393) ^ Math.imul(row, 668265263) ^ Math.imul(epoch, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return CHARS[(h >>> 9) % CHARS.length];
}

export function TerminalFx() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cv: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let cols: Col[] = [];
    let shades: string[][] = [];      // [class][level] → rgba string for the tail
    let heads: string[] = [];         // [class] → rgba string for the lead glyph
    let raf: number | null = null;
    let active = false;
    let builtLight = false;
    let w = 0, h = 0, dpr = 1, cellW = 0, cellH = 0, rows = 0, size = 0;
    let steps = 0;
    let last = 0;
    let idle = 0;                     // columns currently waiting to start

    const isTerminal = () => root.getAttribute("data-theme") === "terminal";
    const isLight = () => !root.classList.contains("dark");
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    function pickClass(): number {
      const r = Math.random();
      let acc = 0;
      for (let i = 0; i < CLASSES.length; i++) {
        acc += CLASSES[i].w;
        if (r < acc) return i;
      }
      return 0;
    }

    // Build the colour tables once per palette. The ramp is gamma-ish rather
    // than linear so the tail dies off quickly and only the few cells behind
    // the head carry real weight.
    function buildTone() {
      const t = isLight() ? TONE.light : TONE.dark;
      const accent =
        parseRGB(getComputedStyle(root).getPropertyValue("--accent")) ??
        parseRGB(t.fallback) ??
        [34, 255, 119];
      const head = accent.map((c, i) => Math.round(c + (t.toward[i] - c) * t.mix));
      const tail = accent.join(",");
      shades = CLASSES.map((cl) => {
        const arr: string[] = [];
        for (let k = 0; k < SHADES; k++) {
          const f = Math.pow((k + 1) / SHADES, 1.7);
          arr.push(`rgba(${tail},${(t.tailA * cl.ink * f).toFixed(3)})`);
        }
        return arr;
      });
      heads = CLASSES.map((cl) => `rgba(${head.join(",")},${(t.headA * cl.ink).toFixed(3)})`);
      builtLight = isLight();
    }

    function respawn(c: Col, anywhere: boolean) {
      c.cls = pickClass();
      const cl = CLASSES[c.cls];
      c.spd = rnd(cl.spd[0], cl.spd[1]);
      c.tail = Math.round(rnd(7, Math.min(22, Math.max(8, rows * 0.55))));
      c.acc = Math.random();
      if (anywhere) {
        // First frame: the field should already be running, not starting.
        c.row = Math.round(rnd(-c.tail, rows));
        c.wait = Math.random() < 0.3 ? Math.round(rnd(2, 34)) : 0;
      } else {
        c.row = -Math.round(rnd(0, 5));
        // The idle gap between runs is what keeps the density modest — without
        // it every column is always busy and the page turns into wallpaper.
        // But the gaps have to be SHORT, and there is a floor on how many
        // columns may idle at once: the seeded columns finish their first
        // (partial) run at roughly the same time, and without the floor the
        // whole field went blank a few seconds after the theme loaded.
        c.wait = idle > cols.length * 0.4 ? Math.round(rnd(0, 7)) : Math.round(rnd(3, 40));
      }
      if (c.wait > 0) idle++;
    }

    function layout() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      if (!cv || !ctx) return;

      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Cells are wider than the glyphs so the columns sit apart — an airier
      // grid than the movie's, which is what makes it liveable behind text.
      size = w < 560 ? 12 : w < 1100 ? 13 : 14;
      cellW = Math.round(size * 1.45);
      cellH = Math.round(size * 1.25);
      rows = Math.ceil(h / cellH);

      // Resizing a canvas resets its state, so the text setup goes here.
      ctx.font = `${size}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const n = Math.max(1, Math.floor(w / cellW));
      const pad = (w - (n - 1) * cellW) / 2;
      idle = 0;
      cols = Array.from({ length: n }, (_, i) => {
        const c: Col = { x: Math.round(pad + i * cellW), row: 0, acc: 0, spd: 0, tail: 0, cls: 0, wait: 0 };
        respawn(c, true);
        return c;
      });
      buildTone();
    }

    function advance(n: number) {
      steps += n;
      for (let k = 0; k < n; k++) {
        for (let i = 0; i < cols.length; i++) {
          const c = cols[i];
          if (c.wait > 0) { c.wait--; if (c.wait === 0) idle--; continue; }
          c.acc += c.spd;
          while (c.acc >= 1) {
            c.acc -= 1;
            c.row++;
            // Retire the column once its whole trail has left the viewport.
            if (c.row - c.tail > rows) { respawn(c, false); break; }
          }
        }
      }
    }

    function paint() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (c.wait > 0) continue;
        const ramp = shades[c.cls];
        const from = Math.max(0, c.row - c.tail + 1);
        const to = Math.min(rows, c.row);
        for (let r = to; r >= from; r--) {
          const d = c.row - r;
          if (d === 0) ctx.fillStyle = heads[c.cls];
          else ctx.fillStyle = ramp[((1 - d / c.tail) * (SHADES - 1)) | 0];
          // Staggered epoch → this cell picks a new glyph every ~16 steps, at
          // its own moment rather than in lockstep with its neighbours.
          ctx.fillText(glyphAt(i, r, (steps + r * 5 + i * 11) >> 4), c.x, r * cellH);
        }
      }
    }

    function step(ts: number) {
      raf = requestAnimationFrame(step);
      if (!last) last = ts;
      const gap = ts - last;
      if (gap < STEP_MS) return;
      let n = (gap / STEP_MS) | 0;
      // A long gap means we were throttled or backgrounded. Replaying all of
      // it would teleport every column, so take one step and resync.
      if (n > CATCHUP) { n = 1; last = ts; } else { last += n * STEP_MS; }
      advance(n);
      paint();
    }

    function start() {
      if (active) return;
      active = true;
      if (!cv) {
        const c = document.createElement("canvas");
        c.setAttribute("aria-hidden", "true");
        c.style.cssText =
          "position:fixed;inset:0;width:100vw;height:100dvh;z-index:-1;pointer-events:none;";
        document.body.appendChild(c);
        cv = c;
        ctx = c.getContext("2d");
      }
      layout();
      paint();                      // the field is already running on frame one
      if (!reduce) {
        last = 0;
        raf = requestAnimationFrame(step);
      }
    }

    function stop() {
      active = false;
      if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      if (cv?.parentNode) cv.parentNode.removeChild(cv);
      cv = null;
      ctx = null;
      cols = [];
      shades = [];
      heads = [];
    }

    function sync() {
      if (!isTerminal()) { stop(); return; }
      if (!active) start();
      else if (isLight() !== builtLight) {
        // Light/dark flipped: only the colour tables are palette-bound.
        buildTone();
        if (reduce) paint();
      }
    }

    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });

    // Resizing a canvas wipes it, so paint the new grid straight away rather
    // than leaving the backdrop blank until the next tick lands.
    const onResize = () => { if (active) { layout(); paint(); } };
    const onVis = () => {
      if (document.hidden) {
        if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      } else if (active && !reduce && raf == null) {
        last = 0;
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
