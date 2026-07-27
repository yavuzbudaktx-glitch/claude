"use client";

import { useEffect } from "react";

// Weather for the "rain" theme, drawn on two canvases that only exist while
// that theme is on:
//
//  · SKY (z-index -1, full viewport) — the atmosphere. Cloud cover drifting
//    across the top in three parallax layers, lightning that blooms INSIDE
//    the cloud mass, and slow mist banks lower down. It deliberately sits
//    behind every bit of page content (main is z-index 1), and that is the
//    whole reason the fog can have real density: nothing here is ever in
//    front of a word. It lands above the aurora backdrop (body::before,
//    z-index -1, painted first) and below the vignette/grain (body::after,
//    painted last) — exactly where weather belongs in the stack.
//  · RAIN (z-index 40) — falling drops with their own depth, plus droplets
//    clinging to the "glass", in FRONT of the cards so it reads as rain on a
//    window. Still below every popover/menu (those live at z-index 58+).
//
// Both are pointer-events:none so they never eat a click.
//
// Everything expensive is pre-rendered ONCE into an offscreen canvas and then
// blitted:
//  · each cloud layer and each mist bank is a horizontally seamless tile,
//    rendered at a fraction of screen resolution (soft textures survive being
//    scaled up) and drawn a couple of times per frame at a moving offset;
//  · the drops are four sprites — a motion-blur streak with a gaussian
//    cross-section and a gradient down its length — drawn scaled and rotated.
//    That matters: a per-drop createLinearGradient (or even a per-drop
//    rgba() string) allocates hundreds of objects every frame and is what
//    makes canvas rain stutter on a phone. Here a drop costs one setTransform
//    plus one drawImage, and nothing allocates.
//
// The lightning is deliberately calm: no full-screen flash (an earlier
// version had one and it was the least relaxing thing on the page), no
// strobe. The light starts at a point inside the cloud, and the clouds it
// actually lands on are what brighten — a masked pass, so the mass lights
// unevenly and the bases catch the most. The filament inside is dim, short
// and drawn UNDER the two nearer cloud layers so it is mostly occluded. It
// fires every 10-25s and nothing in its envelope moves faster than ~180ms.
//
// Under prefers-reduced-motion we paint a single still frame — clouds, fog,
// rain and droplets are there as texture, with no motion and no lightning.

type Drop = { x: number; y: number; len: number; wid: number; spd: number; a: number; s: number; tm: number; tw: number };
type Bead = { x: number; y: number; r: number; max: number; vy: number; ph: number; sway: number; since: number; a: number };
type Mark = { x: number; y: number; r: number; a: number };
type Layer = { tile: HTMLCanvasElement; tileW: number; speed: number; off: number };
type Bank = { tile: HTMLCanvasElement; tileW: number; tileH: number; top: number; speed: number; off: number; bob: number; per: number };
type Seg = { ax: number; ay: number; bx: number; by: number };

const TAU = Math.PI * 2;
const TEX = 0.6;          // cloud tiles are rendered at 60% of CSS-pixel size
const MIST_TEX = 0.3;     // mist is nothing but soft edges, so 30% is plenty
const LIT_TEX = 0.5;      // the lightning mask only needs to be roughly right
const SKY_FRAC = 0.42;    // clouds own roughly the top 42% of the viewport
const STRIKE_MS = 2600;   // one strike, leader through final fade
const WIND_DIV = 5.2;     // wind → sideways drift; also sets the streak tilt
const MAX_MARKS = 96;     // ring buffer for the trails sliding droplets leave

// Cloud layers, far → near. Nearer layers are smaller-featured, denser,
// hug the top edge more tightly and drift faster (parallax). `wide` is the
// tile width as a multiple of the viewport width — different per layer so the
// three repeats never line up into an obvious pattern.
const SPECS = [
  { wide: 1.90, speed: 3.5, gap: 1.05, blobA: 0.074, rMin: 0.34, rMax: 0.64, top: 0.02, spread: 0.60, fade: 0.30 },
  { wide: 1.55, speed: 7.5, gap: 0.90, blobA: 0.100, rMin: 0.27, rMax: 0.50, top: -0.05, spread: 0.48, fade: 0.25 },
  { wide: 1.25, speed: 13.0, gap: 0.78, blobA: 0.130, rMin: 0.21, rMax: 0.40, top: -0.12, spread: 0.36, fade: 0.19 },
];

// Mist banks, high → low. A flat gradient reads as a grey band, so instead
// these are uneven tiles of stretched wisps that drift at different speeds
// and in different directions — the density where they cross keeps changing,
// which is what makes it feel like moving air. Lower banks are thicker and
// travel faster because they are nearer. `bob` is a slow vertical breathe.
const BANKS = [
  { wide: 1.80, top: 0.26, tall: 0.52, speed: -5, n: 13, rMin: 0.10, rMax: 0.34, stretch: 3.6, a: 0.046, bob: 10, per: 47 },
  { wide: 1.45, top: 0.48, tall: 0.46, speed: 9, n: 12, rMin: 0.09, rMax: 0.30, stretch: 3.0, a: 0.056, bob: 7, per: 33 },
  { wide: 1.15, top: 0.70, tall: 0.38, speed: -14, n: 11, rMin: 0.08, rMax: 0.26, stretch: 2.5, a: 0.07, bob: 5, per: 25 },
];

// The four drop sprites, far → near. `k` is the width of the bright core as a
// fraction of the sprite, so a low `k` is a crisp thread with a faint halo and
// a high one is a smear. The last is the depth-of-field class: a handful of
// drops passing right by the glass, big and blurred and nearly transparent.
const CLASSES = [
  { w: 6, h: 48, k: 0.46 },
  { w: 8, h: 48, k: 0.50 },
  { w: 10, h: 56, k: 0.54 },
  { w: 28, h: 64, k: 0.86 },
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
    lit: 0.5,             // how hard the strike re-lights the cloud mass
    rain: "192,218,250",
    mist: "116,142,178",
    mistA: 1,
    floor: 0.1,           // the humid gradient at the foot of the page
    rim: "2,6,14",        // droplet edge — where a bead bends light away
    spec: "198,224,252",  // droplet highlight
  },
  light: {
    cloud: ["150,160,177", "124,136,157", "100,112,135"],
    gloom: "106,118,138",
    gloomA: 0.3,
    glow: "255,244,208",
    glowA: [0.22, 0.13, 0.06],
    lit: 0.38,
    rain: "60,86,126",
    mist: "240,245,251",
    mistA: 1.5,
    floor: 0.24,
    rim: "72,88,110",
    spec: "255,255,255",
  },
};

// One strike's brightness over time. Real lightning is a stepped leader, then
// a bright return stroke, then usually a dimmer second one — copying that
// shape is most of what makes a flash believable. Every stage ramps over at
// least 180ms, which keeps it well clear of anything that reads as a strobe.
// Returns 0…1.
function envelope(u: number): number {
  if (u <= 0 || u >= STRIKE_MS) return 0;
  const lead = u < 270 ? Math.sin((u / 270) * Math.PI) * 0.3 : 0;
  const lead2 = u > 300 && u < 470 ? Math.sin(((u - 300) / 170) * Math.PI) * 0.22 : 0;
  let main = 0;
  const v = u - 470;
  if (v > 0) {
    const r = Math.min(1, v / 220);
    main = r * r * (3 - 2 * r) * Math.exp(-v / 600) * 1.9;
  }
  let second = 0;
  const v2 = u - 980;
  if (v2 > 0) {
    const r = Math.min(1, v2 / 200);
    second = r * r * (3 - 2 * r) * Math.exp(-v2 / 380) * 0.62;
  }
  const echo = u > 1500 && u < 2200 ? Math.sin(((u - 1500) / 700) * Math.PI) * 0.2 : 0;
  // Taper the very end so the tail never cuts off with a visible step.
  return Math.min(1, lead + lead2 + main + second + echo) * Math.min(1, (STRIKE_MS - u) / 450);
}

// The filament is only there for the return stroke itself — a third of a
// second, no more. Anything longer and the eye starts reading it as a shape.
function boltAlpha(u: number): number {
  if (u < 450 || u > 820) return 0;
  return Math.sin(((u - 450) / 370) * Math.PI) ** 2;
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
    let lit: HTMLCanvasElement | null = null;   // scratch for the lightning mask
    let lctx: CanvasRenderingContext2D | null = null;
    let layers: Layer[] = [];
    let banks: Bank[] = [];
    let sprites: HTMLCanvasElement[] = [];
    let beadTex: HTMLCanvasElement | null = null;
    let gloomGrad: CanvasGradient | null = null;
    let floorGrad: CanvasGradient | null = null;
    let drops: Drop[] = [];
    let beads: Bead[] = [];
    let marks: Mark[] = [];
    let markI = 0;
    let raf: number | null = null;
    let active = false;
    let w = 0, h = 0, skyH = 0, dpr = 1;
    let builtW = 0, builtH = 0, builtLight = false;
    let wind = 0, windTarget = 0;
    let clock = 0;             // seconds of animation, for the mist breathe
    let lastT = 0;
    let nextStrike = 0, strikeAt = -1, peak = 0, lx = 0, ly = 0, lr = 0;
    let flash = 0, boltA = 0;
    let bolt: Seg[] = [];

    const isRain = () => root.getAttribute("data-theme") === "rain";
    const isLight = () => !root.classList.contains("dark");
    const tone = () => (isLight() ? TONE.light : TONE.dark);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    // ---------- falling rain ----------

    // A CALM drizzle, not a downpour: the density and speed are ambience you
    // can work under. What sells it as rain is the spread — length is tied to
    // speed (a fast drop smears further in one frame), alpha and blur are tied
    // to depth, and every drop leans a hair off the wind angle instead of the
    // whole sheet sharing one.
    function reset(d: Drop, anywhere: boolean) {
      const near = Math.random() < 0.045;
      const depth = near ? rnd(0.9, 1) : Math.pow(Math.random(), 0.85) * 0.8;
      d.s = near ? 3 : depth < 0.3 ? 0 : depth < 0.62 ? 1 : 2;
      d.spd = 2.4 + depth * 7.4;
      d.len = d.spd * rnd(2.4, 4.1);
      d.wid = near ? rnd(8, 12) : 1.9 + depth * 3.2;
      d.a = near ? rnd(0.06, 0.12) : 0.1 + depth * rnd(0.2, 0.42);
      d.tm = rnd(0.75, 1.25);
      d.tw = rnd(-0.05, 0.05);
      d.x = Math.random() * (w + 200) - 100;
      d.y = anywhere ? Math.random() * h : -d.len - Math.random() * 140;
    }

    // ---------- droplets on the glass ----------

    // The detail that actually says "window": a bead sits still and swells for
    // a few seconds, then its weight wins and it slides, wobbling along a
    // fixed wavy track and shedding little beads behind it. Real drops do
    // exactly this, and because they are static most of the time they cost
    // almost nothing.
    function resetBead(b: Bead, anywhere: boolean) {
      b.r = rnd(1.1, 2.2);
      b.max = rnd(3.4, 7);
      b.vy = 0;
      b.ph = Math.random() * TAU;
      b.sway = rnd(0.5, 1.6);
      b.since = 0;
      b.a = rnd(0.5, 1);
      b.x = rnd(0.02, 0.98) * w;
      b.y = anywhere ? Math.random() * h * 0.9 : rnd(-0.02, 0.55) * h;
      if (anywhere) {
        // The first frame shouldn't look like the glass just got wet: give the
        // starting set random sizes and put some of them already on the move.
        b.r = rnd(0.9, b.max);
        if (Math.random() < 0.35) b.vy = rnd(0.3, 1.6);
      }
    }

    function addMark(x: number, y: number, r: number, a: number) {
      const m = marks[markI];
      markI = (markI + 1) % marks.length;
      m.x = x; m.y = y; m.r = r; m.a = a;
    }

    // ---------- pre-rendered textures ----------

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

    // A wisp of mist: the same blob stretched sideways by its own amount, so
    // that a dozen of them at scattered heights pile into a lumpy bank instead
    // of the even horizontal band a single gradient would give.
    function wisp(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, sx: number, sy: number, a: number, rgb: string, tileW: number) {
      for (const off of [0, tileW, -tileW]) {
        const x = cx + off;
        if (x + r * sx < 0 || x - r * sx > tileW) continue;
        g.save();
        g.translate(x, cy);
        g.scale(sx, sy);
        blob(g, 0, 0, r, a, rgb);
        g.restore();
      }
    }

    function buildClouds() {
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
    }

    function buildMist() {
      const t = tone();
      banks = BANKS.map((spec, i) => {
        const tileW = Math.round(w * spec.wide);
        const tileH = Math.round(h * spec.tall);
        const c = document.createElement("canvas");
        c.width = Math.max(2, Math.round(tileW * MIST_TEX));
        c.height = Math.max(2, Math.round(tileH * MIST_TEX));
        const g = c.getContext("2d");
        if (g) {
          g.setTransform(MIST_TEX, 0, 0, MIST_TEX, 0, 0);
          const step = tileW / spec.n;
          for (let k = 0; k < spec.n; k++) {
            const cx = (k + rnd(-0.4, 1.4)) * step;
            const cy = tileH * rnd(0.1, 0.9);
            const r = tileH * rnd(spec.rMin, spec.rMax);
            const sx = spec.stretch * rnd(0.5, 1.6);
            const sy = rnd(0.55, 1.25);
            wisp(g, cx, cy, r, sx, sy, spec.a * t.mistA * rnd(0.45, 1.5), t.mist, tileW);
          }
        }
        return {
          tile: c, tileW, tileH, top: spec.top, speed: spec.speed,
          off: banks[i] ? banks[i].off : Math.random() * tileW,
          bob: spec.bob, per: spec.per,
        };
      });
    }

    // A drop sprite: a motion-blurred streak. The cross-section is a real
    // gaussian (that's why it needs pixels rather than a gradient), and down
    // its length it fades from dense at the trailing end to nothing at the
    // leading tip — which is what a drop actually leaves on a sensor, and the
    // single biggest difference between this and a grey dash.
    function buildSprites() {
      const t = tone();
      const [r, g, b] = t.rain.split(",").map(Number);
      sprites = CLASSES.map((cl) => {
        const c = document.createElement("canvas");
        c.width = cl.w;
        c.height = cl.h;
        const x = c.getContext("2d");
        if (!x) return c;
        const img = x.createImageData(cl.w, cl.h);
        const d = img.data;
        const half = (cl.w - 1) / 2;
        for (let py = 0; py < cl.h; py++) {
          const u = py / (cl.h - 1);
          const rise = Math.min(1, u / 0.12);
          const fall = 0.34 + 0.66 * Math.pow(1 - u, 0.85);
          const tip = u > 0.9 ? Math.pow(1 - (u - 0.9) / 0.1, 0.7) : 1;
          const v = rise * fall * tip;
          for (let px = 0; px < cl.w; px++) {
            const dx = (px - half) / (half * cl.k);
            const a = v * Math.exp(-dx * dx * 2.1);
            const i = (py * cl.w + px) * 4;
            d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(Math.min(1, a) * 255);
          }
        }
        x.putImageData(img, 0, 0);
        return c;
      });
    }

    // A bead of water on glass. A drop is a lens: it darkens slightly in the
    // middle, it gathers light into a bright ring at its edge, the light it
    // gathers leaves through the BOTTOM (so that edge is always the brightest
    // part), and there's a small specular dot where the sky reflects off the
    // top-left. Four gradients, rendered once, then scaled — it is never more
    // than a few pixels across so it never needs to be sharp.
    function buildBead() {
      const t = tone();
      const S = 44, c = document.createElement("canvas");
      c.width = S; c.height = S;
      const g = c.getContext("2d");
      if (g) {
        const m = S / 2, R = m - 1;
        let gr = g.createRadialGradient(m, m, 0, m, m, R);
        gr.addColorStop(0, `rgba(${t.rim},0.16)`);
        gr.addColorStop(0.6, `rgba(${t.rim},0.26)`);
        gr.addColorStop(0.88, `rgba(${t.rim},0.44)`);
        gr.addColorStop(1, `rgba(${t.rim},0)`);
        g.fillStyle = gr;
        g.beginPath(); g.arc(m, m, R, 0, TAU); g.fill();

        g.globalCompositeOperation = "lighter";
        gr = g.createRadialGradient(m, m, R * 0.55, m, m, R);
        gr.addColorStop(0, `rgba(${t.spec},0)`);
        gr.addColorStop(0.78, `rgba(${t.spec},0.2)`);
        gr.addColorStop(0.93, `rgba(${t.spec},0.55)`);
        gr.addColorStop(1, `rgba(${t.spec},0)`);
        g.fillStyle = gr;
        g.beginPath(); g.arc(m, m, R, 0, TAU); g.fill();

        gr = g.createRadialGradient(m, m + R * 0.45, 0, m, m + R * 0.45, R * 0.7);
        gr.addColorStop(0, `rgba(${t.spec},0.5)`);
        gr.addColorStop(0.55, `rgba(${t.spec},0.17)`);
        gr.addColorStop(1, `rgba(${t.spec},0)`);
        g.fillStyle = gr;
        g.beginPath(); g.arc(m, m, R * 0.99, 0, TAU); g.fill();

        const hx = m - R * 0.3, hy = m - R * 0.34, hr = R * 0.3;
        gr = g.createRadialGradient(hx, hy, 0, hx, hy, hr);
        gr.addColorStop(0, `rgba(${t.spec},0.7)`);
        gr.addColorStop(1, `rgba(${t.spec},0)`);
        g.fillStyle = gr;
        g.beginPath(); g.arc(hx, hy, hr, 0, TAU); g.fill();
      }
      beadTex = c;
    }

    function buildGrads() {
      if (!sctx) return;
      const t = tone();
      // The overcast ceiling: heaviest at the very top edge, gone by the base.
      const gl = sctx.createLinearGradient(0, 0, 0, skyH * 0.9);
      gl.addColorStop(0, `rgba(${t.gloom},${t.gloomA})`);
      gl.addColorStop(0.45, `rgba(${t.gloom},${t.gloomA * 0.42})`);
      gl.addColorStop(1, `rgba(${t.gloom},0)`);
      gloomGrad = gl;
      // Humid air pools at the bottom of a view, so the mist banks sit on a
      // slab that thickens all the way down.
      const fl = sctx.createLinearGradient(0, h * 0.5, 0, h);
      fl.addColorStop(0, `rgba(${t.mist},0)`);
      fl.addColorStop(0.55, `rgba(${t.mist},${t.floor * 0.34})`);
      fl.addColorStop(1, `rgba(${t.mist},${t.floor})`);
      floorGrad = fl;
    }

    function build() {
      buildClouds();
      buildMist();
      buildSprites();
      buildBead();
      buildGrads();
      builtW = w;
      builtH = h;
      builtLight = isLight();
    }

    // ---------- lightning ----------

    // A short branching channel near the source. It is generated per strike so
    // it never repeats, and it is drawn under the two nearer cloud layers so
    // most of it is swallowed by cloud.
    function makeBolt() {
      bolt = [];
      const dir = Math.random() < 0.5 ? -1 : 1;
      let x = lx, y = ly - skyH * 0.3;
      const n = 5 + Math.floor(Math.random() * 3);
      const step = (skyH * 0.44) / n;
      for (let i = 0; i < n; i++) {
        const nx = x + dir * step * rnd(0.2, 0.55) * (Math.random() < 0.3 ? -1 : 1);
        const ny = y + step * rnd(0.7, 1.3);
        bolt.push({ ax: x, ay: y, bx: nx, by: ny });
        if (i > 0 && i < n - 1 && Math.random() < 0.55) {
          bolt.push({ ax: nx, ay: ny, bx: nx + rnd(-1.2, 1.2) * step, by: ny + step * rnd(0.4, 1.1) });
        }
        x = nx; y = ny;
      }
    }

    function filament(a: number) {
      if (!sctx || a <= 0.01 || !bolt.length) return;
      const t = tone();
      sctx.save();
      sctx.globalCompositeOperation = "lighter";
      sctx.lineCap = "round";
      sctx.lineJoin = "round";
      // Two passes: a wide soft bloom, then a thin core. Both stay dim; the
      // cloud drawn over them is what keeps this from reading as a bolt.
      for (let pass = 0; pass < 2; pass++) {
        sctx.lineWidth = pass ? 1.1 : 5;
        sctx.strokeStyle = `rgba(${t.glow},${pass ? a * 0.5 : a * 0.16})`;
        sctx.beginPath();
        for (const s of bolt) { sctx.moveTo(s.ax, s.ay); sctx.lineTo(s.bx, s.by); }
        sctx.stroke();
      }
      sctx.restore();
    }

    // A wide, soft additive bloom at the source. Flatter than a circle so it
    // spreads along the cloud base the way sheet lightning does.
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

    // The part that makes a strike look like light rather than a painted
    // circle: build the cloud silhouette in a scratch buffer, then paint the
    // light into it with source-in so the result is light × cloud, and add
    // that back. Clouds near the source brighten hard, ones further off barely
    // move, and the bases catch the most because the source sits low in the
    // mass. Only runs while a strike is up, at half resolution.
    function relight(a: number) {
      if (!sctx || !lctx || !lit || a <= 0.004) return;
      const t = tone();
      lctx.setTransform(LIT_TEX, 0, 0, LIT_TEX, 0, 0);
      lctx.globalCompositeOperation = "source-over";
      lctx.clearRect(0, 0, w, skyH);
      for (const layer of layers) {
        let x = -(layer.off % layer.tileW);
        while (x < w) {
          lctx.drawImage(layer.tile, x, 0, layer.tileW, skyH);
          x += layer.tileW;
        }
      }
      lctx.globalCompositeOperation = "source-in";
      lctx.translate(lx, ly);
      lctx.scale(1.5, 0.9);
      const r = lr * 1.5;
      const gr = lctx.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, `rgba(${t.glow},1)`);
      gr.addColorStop(0.3, `rgba(${t.glow},0.52)`);
      gr.addColorStop(0.65, `rgba(${t.glow},0.16)`);
      gr.addColorStop(1, `rgba(${t.glow},0)`);
      lctx.fillStyle = gr;
      lctx.beginPath();
      lctx.arc(0, 0, r, 0, TAU);
      lctx.fill();

      sctx.save();
      sctx.globalCompositeOperation = "lighter";
      sctx.globalAlpha = a;
      sctx.drawImage(lit, 0, 0, w, skyH);
      sctx.restore();
    }

    // ---------- canvases ----------

    function ensureCanvas() {
      if (!sky) {
        const c = document.createElement("canvas");
        c.setAttribute("aria-hidden", "true");
        c.style.cssText =
          "position:fixed;left:0;top:0;width:100vw;height:100dvh;z-index:-1;pointer-events:none;";
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
      if (!lit) {
        lit = document.createElement("canvas");
        lctx = lit.getContext("2d");
      }
    }

    function removeCanvas() {
      if (sky?.parentNode) sky.parentNode.removeChild(sky);
      if (rain?.parentNode) rain.parentNode.removeChild(rain);
      sky = null; sctx = null; rain = null; rctx = null; lit = null; lctx = null;
      layers = []; banks = []; sprites = []; beadTex = null;
      gloomGrad = null; floorGrad = null;
      drops = []; beads = []; marks = []; bolt = [];
      builtW = 0; builtH = 0;
    }

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      skyH = Math.round(Math.max(200, Math.min(520, h * SKY_FRAC)));
      if (!sky || !sctx || !rain || !rctx || !lit || !lctx) return;

      sky.width = Math.floor(w * dpr);
      sky.height = Math.floor(h * dpr);
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rain.width = Math.floor(w * dpr);
      rain.height = Math.floor(h * dpr);
      rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lit.width = Math.max(2, Math.floor(w * LIT_TEX));
      lit.height = Math.max(2, Math.floor(skyH * LIT_TEX));

      // Density scales with screen area, clamped so phones stay light and
      // ultrawides don't go sparse.
      const count = Math.max(150, Math.min(340, Math.round((w * h) / 4300)));
      drops = Array.from({ length: count }, () => {
        const d: Drop = { x: 0, y: 0, len: 0, wid: 0, spd: 0, a: 0, s: 0, tm: 1, tw: 0 };
        reset(d, true);
        return d;
      });
      const nb = Math.max(10, Math.min(26, Math.round((w * h) / 44000)));
      beads = Array.from({ length: nb }, () => {
        const b: Bead = { x: 0, y: 0, r: 0, max: 0, vy: 0, ph: 0, sway: 0, since: 0, a: 1 };
        resetBead(b, true);
        return b;
      });
      marks = Array.from({ length: MAX_MARKS }, () => ({ x: 0, y: 0, r: 0, a: 0 }));
      markI = 0;

      // Re-rendering the tiles is the one costly thing here, so skip it unless
      // the size actually moved by more than a mobile URL bar's worth (those
      // fire resize constantly) or light/dark flipped.
      if (!layers.length || Math.abs(w - builtW) > 40 || Math.abs(h - builtH) > 130 || isLight() !== builtLight) {
        build();
      } else {
        buildGrads();       // gradients are bound to the resized context
      }
      lr = skyH * 0.75;
    }

    // ---------- frame ----------

    function blit(layer: Layer) {
      if (!sctx) return;
      let x = -(layer.off % layer.tileW);
      while (x < w) {
        sctx.drawImage(layer.tile, x, 0, layer.tileW, skyH);
        x += layer.tileW;
      }
    }

    function paintSky() {
      if (!sctx) return;
      const t = tone();
      sctx.clearRect(0, 0, w, h);

      if (gloomGrad) {
        sctx.fillStyle = gloomGrad;
        sctx.fillRect(0, 0, w, skyH);
      }

      // Far clouds, then the filament and the bloom, then the nearer clouds ON
      // TOP of them — the occlusion is what makes the light read as being
      // inside the cloud rather than painted over it. Each later pass leaks a
      // little less. The masked re-light goes last, over the whole mass.
      if (layers[0]) blit(layers[0]);
      if (boltA > 0) filament(boltA * peak);
      if (flash > 0) glow(t.glowA[0] * flash, 1);
      if (layers[1]) blit(layers[1]);
      if (flash > 0) glow(t.glowA[1] * flash, 1.25);
      if (layers[2]) blit(layers[2]);
      if (flash > 0) glow(t.glowA[2] * flash, 1.7);
      if (flash > 0) relight(t.lit * flash);

      // Mist last: it is the nearest thing in the sky canvas, so it hangs in
      // front of the cloud bases and softens where they end.
      if (floorGrad) {
        sctx.fillStyle = floorGrad;
        sctx.fillRect(0, h * 0.5, w, h * 0.5);
      }
      for (const b of banks) {
        const y = h * b.top + Math.sin((clock / b.per) * TAU + b.top * 9) * b.bob;
        let x = -(b.off % b.tileW);
        while (x < w) {
          sctx.drawImage(b.tile, x, y, b.tileW, b.tileH);
          x += b.tileW;
        }
      }
    }

    function paintRain() {
      if (!rctx || !sprites.length) return;
      rctx.clearRect(0, 0, w, h);

      // The drops. One setTransform + one drawImage each, no allocation: the
      // sprite already carries the colour, the gradient and the blur, so all
      // that changes per drop is where it is, how long it is and how faint.
      // They pick up a hair of extra brightness while lightning is up — far
      // too little to read as a flash, but it ties the two together.
      const boost = 1 + flash * 0.12;
      const tilt = -Math.atan(wind / WIND_DIV);
      for (const d of drops) {
        const ang = tilt * d.tm + d.tw;
        const c = Math.cos(ang) * dpr, s = Math.sin(ang) * dpr;
        rctx.setTransform(c, s, -s, c, d.x * dpr, d.y * dpr);
        rctx.globalAlpha = Math.min(1, d.a * boost);
        rctx.drawImage(sprites[d.s], -d.wid / 2, -d.len, d.wid, d.len);
      }
      rctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Then the glass itself: the faint track a sliding bead left, and the
      // beads on top of it.
      if (beadTex) {
        for (const m of marks) {
          if (m.a <= 0.01) continue;
          rctx.globalAlpha = m.a;
          rctx.drawImage(beadTex, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
        }
        for (const b of beads) {
          // A moving bead stretches into a teardrop; a hanging one is round.
          const ry = b.r * (1 + Math.min(1.1, b.vy * 0.22));
          rctx.globalAlpha = b.a * 0.85;
          rctx.drawImage(beadTex, b.x - b.r, b.y - ry, b.r * 2, ry * 2);
        }
      }
      rctx.globalAlpha = 1;
    }

    function schedule(now: number, first: boolean) {
      // Infrequent on purpose. The first one comes sooner so switching to the
      // theme doesn't look like nothing happens.
      nextStrike = now + (first ? 4000 + Math.random() * 5000 : 10000 + Math.random() * 15000);
    }

    function advance(dt: number, now: number) {
      const f = Math.max(0.4, Math.min(2.5, dt / 16.67));
      clock += dt / 1000;

      // A barely-there breeze that wanders instead of gusting.
      windTarget += (Math.random() - 0.5) * 0.04 * f;
      if (windTarget > 1.5) windTarget = 1.5;
      if (windTarget < -1.5) windTarget = -1.5;
      wind += (windTarget - wind) * 0.015 * f;

      for (const d of drops) {
        d.y += d.spd * f;
        d.x += (wind / WIND_DIV) * d.spd * f;
        if (d.y - d.len > h) reset(d, false);
      }

      for (const layer of layers) {
        layer.off = (layer.off + (layer.speed * dt) / 1000) % layer.tileW;
      }
      for (const b of banks) {
        b.off = (b.off + (b.speed * dt) / 1000 + b.tileW) % b.tileW;
      }

      for (const m of marks) {
        if (m.a > 0) m.a = Math.max(0, m.a - 0.0022 * dt);
      }

      for (const b of beads) {
        b.since += dt;
        if (b.vy === 0) {
          // Hanging: swell for the best part of ten seconds until surface
          // tension gives out. The wait is randomised by `max` so they never
          // let go together — a synchronised release is instantly fake.
          b.r += 0.00009 * dt * b.max;
          if (b.r >= b.max) b.vy = 0.04;
        } else {
          b.vy = Math.min(2.3, b.vy + 0.0012 * dt * (b.r / 4));
          const prev = b.y;
          b.y += b.vy * f;
          // The track wobbles because the glass is never evenly wet.
          b.x += Math.sin(b.y * 0.055 + b.ph) * b.sway * 0.09 * f;
          // Shed a little of itself as it goes; when there's nothing left it
          // stops being a drop.
          b.r -= 0.00035 * dt * b.vy;
          if (b.y - prev > 0 && Math.random() < 0.05 * f && b.r > 1) {
            addMark(b.x + rnd(-0.6, 0.6), b.y - b.r * 1.4, b.r * rnd(0.26, 0.46), b.a * 0.5);
          }
          if (b.y - b.r > h || b.r < 0.8) resetBead(b, false);
        }
      }

      if (strikeAt < 0) {
        if (now >= nextStrike) {
          strikeAt = now;
          peak = 0.68 + Math.random() * 0.32;
          lx = w * (0.16 + Math.random() * 0.68);
          // Low in the mass, so what lights up is the underside of the cloud.
          ly = skyH * (0.3 + Math.random() * 0.28);
          makeBolt();
        }
      } else {
        const u = now - strikeAt;
        flash = envelope(u) * peak;
        boltA = boltAlpha(u);
        if (u >= STRIKE_MS) { strikeAt = -1; flash = 0; boltA = 0; schedule(now, false); }
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
      // Rain almost never falls dead vertical, and a sheet with no lean is the
      // giveaway that it was drawn rather than photographed — so start with a
      // real breeze already blowing and let it wander from there.
      windTarget = (Math.random() < 0.5 ? -1 : 1) * rnd(0.75, 1.4);
      wind = windTarget;
      ensureCanvas();
      resize();
      if (reduce) {
        flash = 0;
        boltA = 0;
        paintSky();
        paintRain();               // one still, rainy frame
      } else {
        lastT = 0;
        strikeAt = -1;
        flash = 0;
        boltA = 0;
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
          // Light/dark flipped: every tile and sprite is baked in one palette,
          // so rebuild them (and re-tint the still frame if we aren't
          // animating).
          build();
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
