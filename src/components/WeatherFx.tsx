"use client";

import { useEffect } from "react";

// Weather for the "rain" theme, drawn on two canvases that only exist while
// that theme is on:
//
//  · SKY (z-index -1) — dark cloud cover drifting across the top of the
//    viewport in three parallax layers, with distant lightning that blooms
//    INSIDE the cloud mass. It deliberately sits behind every bit of page
//    content (main is z-index 1) so text stays perfectly readable, and it
//    lands above the aurora backdrop (body::before, z-index -1, painted
//    first) and below the vignette/grain (body::after, painted last) —
//    exactly where weather belongs in the stack.
//  · RAIN (z-index 40) — individual drops with their own depth, in FRONT of
//    the cards so it reads as rain on the glass. Still below every
//    popover/menu (those live at z-index 58+).
//
// Both are pointer-events:none so they never eat a click.
//
// The clouds are the expensive part, so each layer is pre-rendered ONCE into a
// small, horizontally seamless offscreen tile and then blitted twice per frame
// at a moving offset. Soft textures survive being scaled up, so the tiles are
// rendered at a fraction of screen resolution — per-frame cost is ~6
// drawImage calls plus the drops, which is what keeps this cheap on a phone.
//
// The lightning is deliberately calm: no full-screen flash (an earlier
// version had one and it was the least relaxing thing on the page), no sharp
// bolt, no strobe. The glow is drawn BETWEEN the cloud layers so the clouds in
// front occlude it and it reads as heat lightning behind cover, it fires only
// every 10-25s, and nothing in its envelope moves faster than ~300ms.
//
// Under prefers-reduced-motion we paint a single still frame — clouds and rain
// are there as texture, with no motion and no lightning at all.

type Drop = { x: number; y: number; len: number; spd: number; th: number; a: number };
type Layer = { tile: HTMLCanvasElement; tileW: number; speed: number; off: number };

const TAU = Math.PI * 2;
const TEX = 0.6;          // cloud tiles are rendered at 60% of CSS-pixel size
const SKY_FRAC = 0.42;    // clouds own roughly the top 42% of the viewport
const STRIKE_MS = 2400;   // one strike, pre-flicker through final fade

// Cloud layers, far → near. Nearer layers are smaller-featured, denser,
// hug the top edge more tightly and drift faster (parallax). `wide` is the
// tile width as a multiple of the viewport width — different per layer so the
// three repeats never line up into an obvious pattern.
const SPECS = [
  { wide: 1.90, speed: 3.5, gap: 1.05, blobA: 0.074, rMin: 0.34, rMax: 0.64, top: 0.02, spread: 0.60, fade: 0.30 },
  { wide: 1.55, speed: 7.5, gap: 0.90, blobA: 0.100, rMin: 0.27, rMax: 0.50, top: -0.05, spread: 0.48, fade: 0.25 },
  { wide: 1.25, speed: 13.0, gap: 0.78, blobA: 0.130, rMin: 0.21, rMax: 0.40, top: -0.12, spread: 0.36, fade: 0.19 },
];

// Light mode has to read as grey overcast against a pale sky, so its clouds
// are DARKER than the page and its lightning is a warm cream that lifts the
// grey. Dark mode's sky is nearly black, so there the clouds are slate masses
// slightly LIGHTER than the backdrop (that's what makes them visible at all)
// under a heavy gloom band, and the lightning is a cool blue-white.
const TONE = {
  dark: {
    cloud: ["82,104,140", "58,77,112", "38,53,80"],
    gloom: "3,6,13",
    gloomA: 0.56,
    glow: "150,190,245",
    glowA: [0.30, 0.17, 0.085],
    rain: "192,218,250",
  },
  light: {
    cloud: ["150,160,177", "124,136,157", "100,112,135"],
    gloom: "106,118,138",
    gloomA: 0.3,
    glow: "255,244,208",
    glowA: [0.22, 0.13, 0.06],
    rain: "60,86,126",
  },
};

// One strike's brightness over time: a soft pre-flicker, a beat, then the main
// bloom easing up over ~0.4s and decaying over ~1.5s with a gentle echo swell
// behind it. Returns 0…1.
function envelope(u: number): number {
  if (u <= 0 || u >= STRIKE_MS) return 0;
  const pre = u < 300 ? Math.sin((u / 300) * Math.PI) * 0.4 : 0;
  let main = 0;
  const v = u - 240;
  if (v > 0) {
    const r = Math.min(1, v / 420);
    main = r * r * (3 - 2 * r) * Math.exp(-v / 640) * 1.95;
  }
  const echo = u > 950 && u < 1650 ? Math.sin(((u - 950) / 700) * Math.PI) * 0.26 : 0;
  // Taper the very end so the tail never cuts off with a visible step.
  return Math.min(1, pre + main + echo) * Math.min(1, (STRIKE_MS - u) / 400);
}

export function WeatherFx() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let sky: HTMLCanvasElement | null = null;
    let sctx: CanvasRenderingContext2D | null = null;
    let rain: HTMLCanvasElement | null = null;
    let rctx: CanvasRenderingContext2D | null = null;
    let layers: Layer[] = [];
    let drops: Drop[] = [];
    let raf: number | null = null;
    let active = false;
    let w = 0, h = 0, skyH = 0;
    let builtW = 0, builtH = 0, builtLight = false;
    let wind = 0, windTarget = 0;
    let lastT = 0;
    let nextStrike = 0, strikeAt = -1, peak = 0, lx = 0, ly = 0, lr = 0;
    let flash = 0;

    const isRain = () => root.getAttribute("data-theme") === "rain";
    const isLight = () => !root.classList.contains("dark");
    const tone = () => (isLight() ? TONE.light : TONE.dark);

    // ---------- rain ----------

    // A CALM drizzle, not a downpour. Denser and a touch more opaque than the
    // near-invisible first pass, but the speed is barely changed — the point is
    // ambience you can work under, not weather that grabs your eye.
    function spawn(anywhere: boolean): Drop {
      const depth = Math.random();               // 0 far … 1 near
      const len = 9 + depth * 14;
      return {
        x: Math.random() * (w + 160) - 80,
        y: anywhere ? Math.random() * h : -len - Math.random() * 120,
        len,
        spd: 2.6 + depth * 4.6,
        th: 0.65 + depth * 0.85,
        a: 0.09 + depth * 0.26,
      };
    }

    // ---------- clouds ----------

    // One soft blob. The extra stops fake a gaussian falloff, which is what
    // stops the clouds looking like a pile of hard circles.
    function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, rgb: string) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${a})`);
      gr.addColorStop(0.34, `rgba(${rgb},${a * 0.74})`);
      gr.addColorStop(0.62, `rgba(${rgb},${a * 0.36})`);
      gr.addColorStop(0.82, `rgba(${rgb},${a * 0.11})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }

    // A cluster of blobs around one centre — wider than it is tall, because
    // that's how cloud banks sit. Blobs near an edge are drawn again on the
    // far side so the tile stays seamless when it repeats.
    function puff(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, a: number, rgb: string, tileW: number) {
      const n = 9 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * TAU;
        const d = Math.pow(Math.random(), 0.7) * R * 0.85;
        const bx = cx + Math.cos(ang) * d * 1.55;
        const by = cy + Math.sin(ang) * d * 0.5;
        const br = R * (0.36 + Math.random() * 0.46);
        blob(g, bx, by, br, a, rgb);
        if (bx - br < 0) blob(g, bx + tileW, by, br, a, rgb);
        else if (bx + br > tileW) blob(g, bx - tileW, by, br, a, rgb);
      }
    }

    function buildLayers() {
      const t = tone();
      layers = SPECS.map((spec, i) => {
        const tileW = Math.round(w * spec.wide);
        const c = document.createElement("canvas");
        c.width = Math.max(2, Math.round(tileW * TEX));
        c.height = Math.max(2, Math.round(skyH * TEX));
        const g = c.getContext("2d");
        if (g) {
          g.setTransform(TEX, 0, 0, TEX, 0, 0);   // draw in CSS pixels
          const count = Math.max(3, Math.round(tileW / (skyH * spec.gap)));
          const step = tileW / count;
          for (let k = 0; k < count; k++) {
            const cx = (k + 0.15 + Math.random() * 0.7) * step;
            const cy = skyH * (spec.top + Math.pow(Math.random(), 1.6) * spec.spread);
            const R = skyH * (spec.rMin + Math.random() * (spec.rMax - spec.rMin));
            puff(g, cx, cy, R, spec.blobA, t.cloud[i], tileW);
          }
          // Erase the bottom so the cloud dissolves into the page instead of
          // ending on a line. Densest at the very top, nothing by the base.
          g.globalCompositeOperation = "destination-out";
          const fade = g.createLinearGradient(0, skyH * spec.fade, 0, skyH);
          fade.addColorStop(0, "rgba(0,0,0,0)");
          fade.addColorStop(0.45, "rgba(0,0,0,0.34)");
          fade.addColorStop(0.75, "rgba(0,0,0,0.78)");
          fade.addColorStop(1, "rgba(0,0,0,1)");
          g.fillStyle = fade;
          g.fillRect(0, skyH * spec.fade, tileW, skyH);
        }
        return { tile: c, tileW, speed: spec.speed, off: layers[i] ? layers[i].off : Math.random() * tileW };
      });
      builtW = w;
      builtH = skyH;
      builtLight = isLight();
    }

    function blit(layer: Layer) {
      if (!sctx) return;
      let x = -(layer.off % layer.tileW);
      while (x < w) {
        sctx.drawImage(layer.tile, x, 0, layer.tileW, skyH);
        x += layer.tileW;
      }
    }

    // A wide, soft additive bloom. Flatter than a circle so it spreads along
    // the cloud base the way real sheet lightning does.
    function glow(a: number, spread: number) {
      if (!sctx || a <= 0.003) return;
      const t = tone();
      sctx.save();
      sctx.globalCompositeOperation = "lighter";
      sctx.translate(lx, ly);
      sctx.scale(1.6, 0.78);
      const r = lr * spread;
      const gr = sctx.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, `rgba(${t.glow},${a})`);
      gr.addColorStop(0.26, `rgba(${t.glow},${a * 0.6})`);
      gr.addColorStop(0.58, `rgba(${t.glow},${a * 0.22})`);
      gr.addColorStop(1, `rgba(${t.glow},0)`);
      sctx.fillStyle = gr;
      sctx.beginPath();
      sctx.arc(0, 0, r, 0, TAU);
      sctx.fill();
      sctx.restore();
    }

    // ---------- canvases ----------

    function ensureCanvas() {
      if (!sky) {
        const c = document.createElement("canvas");
        c.setAttribute("aria-hidden", "true");
        c.style.cssText =
          "position:fixed;left:0;top:0;width:100vw;height:40vh;z-index:-1;pointer-events:none;";
        document.body.appendChild(c);
        sky = c;
        sctx = c.getContext("2d");
      }
      if (!rain) {
        const c = document.createElement("canvas");
        c.setAttribute("aria-hidden", "true");
        c.style.cssText =
          "position:fixed;inset:0;width:100vw;height:100dvh;z-index:40;pointer-events:none;";
        document.body.appendChild(c);
        rain = c;
        rctx = c.getContext("2d");
      }
    }

    function removeCanvas() {
      if (sky?.parentNode) sky.parentNode.removeChild(sky);
      if (rain?.parentNode) rain.parentNode.removeChild(rain);
      sky = null; sctx = null; rain = null; rctx = null;
      layers = []; drops = [];
      builtW = 0; builtH = 0;
    }

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      skyH = Math.round(Math.max(200, Math.min(520, h * SKY_FRAC)));
      if (!sky || !sctx || !rain || !rctx) return;

      sky.style.height = `${skyH}px`;
      sky.width = Math.floor(w * dpr);
      sky.height = Math.floor(skyH * dpr);
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rain.width = Math.floor(w * dpr);
      rain.height = Math.floor(h * dpr);
      rctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Density scales with screen area, clamped so phones stay light and
      // ultrawides don't go sparse.
      const count = Math.max(110, Math.min(300, Math.round((w * h) / 6800)));
      drops = Array.from({ length: count }, () => spawn(true));

      // Re-rendering the cloud tiles is the one costly thing here, so skip it
      // unless the size actually moved (mobile URL bars fire resize constantly)
      // or light/dark flipped.
      if (!layers.length || Math.abs(w - builtW) > 40 || Math.abs(skyH - builtH) > 24 || isLight() !== builtLight) {
        buildLayers();
      }
      lr = skyH * 0.75;
    }

    // ---------- frame ----------

    function paintSky() {
      if (!sctx) return;
      const t = tone();
      sctx.clearRect(0, 0, w, skyH);

      // The overcast ceiling: heaviest at the very top edge, gone by the base.
      const gloom = sctx.createLinearGradient(0, 0, 0, skyH * 0.9);
      gloom.addColorStop(0, `rgba(${t.gloom},${t.gloomA})`);
      gloom.addColorStop(0.45, `rgba(${t.gloom},${t.gloomA * 0.42})`);
      gloom.addColorStop(1, `rgba(${t.gloom},0)`);
      sctx.fillStyle = gloom;
      sctx.fillRect(0, 0, w, skyH);

      // Far clouds, then the bloom, then the nearer clouds ON TOP of it — the
      // occlusion is what makes the light read as being inside the cloud
      // rather than painted over it. Each later pass leaks a little less.
      if (layers[0]) blit(layers[0]);
      if (flash > 0) glow(t.glowA[0] * flash, 1);
      if (layers[1]) blit(layers[1]);
      if (flash > 0) glow(t.glowA[1] * flash, 1.25);
      if (layers[2]) blit(layers[2]);
      if (flash > 0) glow(t.glowA[2] * flash, 1.7);
    }

    function paintRain() {
      if (!rctx) return;
      const t = tone();
      const light = isLight();
      rctx.clearRect(0, 0, w, h);

      // A soft haze low on the page — just enough to feel damp.
      const fog = rctx.createLinearGradient(0, h * 0.62, 0, h);
      if (light) {
        fog.addColorStop(0, "rgba(198,206,220,0)");
        fog.addColorStop(1, "rgba(198,206,220,0.16)");
      } else {
        fog.addColorStop(0, "rgba(8,13,22,0)");
        fog.addColorStop(1, "rgba(6,10,18,0.26)");
      }
      rctx.fillStyle = fog;
      rctx.fillRect(0, h * 0.62, w, h * 0.38);

      // The drops. They pick up a hair of extra brightness while lightning is
      // up — far too small to read as a flash, but it ties the two together.
      const boost = 1 + flash * 0.12;
      rctx.lineCap = "round";
      for (const d of drops) {
        rctx.strokeStyle = `rgba(${t.rain},${d.a * boost})`;
        rctx.lineWidth = d.th;
        rctx.beginPath();
        rctx.moveTo(d.x, d.y);
        rctx.lineTo(d.x - wind * 1.4, d.y - d.len);
        rctx.stroke();
      }
    }

    function schedule(now: number, first: boolean) {
      // Infrequent on purpose. The first one comes sooner so switching to the
      // theme doesn't look like nothing happens.
      nextStrike = now + (first ? 3500 + Math.random() * 5000 : 10000 + Math.random() * 15000);
    }

    function advance(dt: number, now: number) {
      const f = Math.max(0.4, Math.min(2.5, dt / 16.67));

      // A barely-there breeze that wanders instead of gusting.
      windTarget += (Math.random() - 0.5) * 0.03 * f;
      if (windTarget > 1.1) windTarget = 1.1;
      if (windTarget < -1.1) windTarget = -1.1;
      wind += (windTarget - wind) * 0.015 * f;

      for (const d of drops) {
        d.y += d.spd * f;
        d.x += wind * (d.spd / 9) * f;
        if (d.y - d.len > h) Object.assign(d, spawn(false));
      }

      for (const layer of layers) {
        layer.off = (layer.off + (layer.speed * dt) / 1000) % layer.tileW;
      }

      if (strikeAt < 0) {
        if (now >= nextStrike) {
          strikeAt = now;
          peak = 0.68 + Math.random() * 0.32;
          lx = w * (0.16 + Math.random() * 0.68);
          ly = skyH * (0.14 + Math.random() * 0.34);
        }
      } else {
        const u = now - strikeAt;
        flash = envelope(u) * peak;
        if (u >= STRIKE_MS) { strikeAt = -1; flash = 0; schedule(now, false); }
      }
    }

    function step(ts: number) {
      // A long gap means we were throttled or backgrounded: reset the clock
      // and re-roll the next strike rather than firing one instantly.
      if (!lastT || ts - lastT > 400) {
        lastT = ts;
        schedule(ts, true);
      }
      const dt = Math.min(50, ts - lastT);
      lastT = ts;

      advance(dt, ts);
      paintSky();
      paintRain();
      raf = requestAnimationFrame(step);
    }

    function start() {
      if (active) return;
      active = true;
      ensureCanvas();
      resize();
      if (reduce) {
        flash = 0;
        paintSky();
        paintRain();               // one still, rainy frame
      } else {
        lastT = 0;
        strikeAt = -1;
        flash = 0;
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
        else if (isLight() !== builtLight) {
          // Light/dark flipped: the cloud tiles are baked in one palette, so
          // rebuild them (and re-tint the still frame if we aren't animating).
          buildLayers();
          if (reduce) { paintSky(); paintRain(); }
        } else if (reduce) {
          paintSky();
          paintRain();
        }
      } else {
        stop();
      }
    }

    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });

    const onResize = () => { if (active) { resize(); if (reduce) { paintSky(); paintRain(); } } };
    const onVis = () => {
      if (document.hidden) {
        if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      } else if (active && !reduce && raf == null) {
        lastT = 0;                 // step() re-rolls the storm clock
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
