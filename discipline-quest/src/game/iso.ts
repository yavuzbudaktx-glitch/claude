import { Raster, shade } from "./raster";

/** World units per tile edge. A tile projects to a 32×16 diamond (times the render scale). */
export const TILE = 16;

/** Render scale: every world unit becomes S screen pixels, so art is drawn at twice the detail with 1-pixel outlines. */
export const S = 2;

export type P3 = [number, number, number];

/** A raster plus an isometric projection origin (where world 0,0,0 lands). */
export class Iso {
  constructor(public r: Raster, public ox: number, public oy: number, public s = S) {}

  proj([x, y, z]: P3): [number, number] {
    return [this.ox + (x - y) * this.s, this.oy + ((x + y) / 2 - z) * this.s];
  }

  /** One "world pixel": an s×s block at a 3D point (stars, LEDs, buttons). */
  dot(p: P3, color: string, w = 1, h = 1) {
    const [x, y] = this.proj(p);
    this.r.rect(Math.floor(x), Math.floor(y), w * this.s, h * this.s, color);
  }

  /** A screen-space ellipse centred on a 3D point; radii in world units. Good for leaves, balls, bowls. */
  blob(p: P3, rx: number, ry: number, color: string) {
    const [x, y] = this.proj(p);
    this.r.ellipse(x, y, rx * this.s, ry * this.s, color);
  }

  /** A flat circle lying on the floor plane (or any horizontal plane at height z). */
  disc(cx: number, cy: number, z: number, r: number, fill: string, outline?: string, n = 20) {
    this.quad(ring(n).map(([c, s2]) => [cx + c * r, cy + s2 * r, z] as P3), fill, outline);
  }

  /** A circle standing on a vertical plane. */
  circle(plane: (u: number, z: number) => P3, cu: number, cz: number, r: number, fill: string, outline?: string, n = 20) {
    this.quad(ring(n).map(([c, s2]) => plane(cu + c * r, cz + s2 * r)), fill, outline);
  }

  /** Upright cylinder (pots, posts, bins): side band shaded light→dark, then the top. */
  cylinder(cx: number, cy: number, z: number, r: number, h: number, color: string, top?: string, outline?: string) {
    const n = 24;
    const pts = ring(n);
    for (let k = 0; k < n; k++) {
      const [c1, s1] = pts[k], [c2, s2] = pts[(k + 1) % n];
      // only the half facing the viewer (+X/+Y)
      if (c1 + s1 + c2 + s2 < -0.2) continue;
      const lit = (s1 + s2) / 2 - (c1 + c2) / 2; // +Y side is lit, +X side darker
      this.quad(
        [[cx + c1 * r, cy + s1 * r, z], [cx + c2 * r, cy + s2 * r, z], [cx + c2 * r, cy + s2 * r, z + h], [cx + c1 * r, cy + s1 * r, z + h]],
        shade(color, lit * 0.12 - 0.08),
      );
    }
    this.disc(cx, cy, z + h, r, top ?? shade(color, 0.15), outline ?? shade(color, -0.55), n);
    if (outline !== "") {
      const e = outline ?? shade(color, -0.55);
      this.line([cx + r * 0.707, cy - r * 0.707, z], [cx + r * 0.707, cy - r * 0.707, z + h], e);
      this.line([cx - r * 0.707, cy + r * 0.707, z], [cx - r * 0.707, cy + r * 0.707, z + h], e);
    }
  }

  /** Fill a plane pixel-by-pixel from a pattern (walls, floors). `at` maps (a, b) on the plane to a 3D point. */
  paint(at: (a: number, b: number) => P3, A: number, B: number, pat: (a: number, b: number) => string, a0 = 0, b0 = 0) {
    const step = 0.5 / this.s;
    for (let a = a0; a < A; a += step)
      for (let b = b0; b < B; b += step) {
        const [sx, sy] = this.proj(at(a, b));
        this.r.set(sx, sy, pat(a, b));
      }
  }

  quad(pts: P3[], fill: string, outline?: string) {
    const p = pts.map((q) => this.proj(q));
    this.r.fillPoly(p, fill);
    if (outline) this.r.strokePoly(p, outline);
  }

  line(a: P3, b: P3, color: string) {
    const [x0, y0] = this.proj(a), [x1, y1] = this.proj(b);
    this.r.line(x0, y0, x1, y1, color);
  }

  /**
   * Habbo-style shaded box. Visible faces: top, "left" (the +Y face) and "right" (the +X face).
   * Light comes from the left, so left faces are mid-tone and right faces darker.
   */
  box(x: number, y: number, z: number, w: number, d: number, h: number, color: string, o: BoxOpts = {}) {
    const top = o.top ?? shade(color, 0.18);
    const left = o.left ?? color;
    const right = o.right ?? shade(color, -0.22);
    const edge = o.outline ?? shade(color, -0.65);
    const T: P3[] = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
    const L: P3[] = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
    const R: P3[] = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
    if (h > 0) {
      this.quad(L, left);
      this.quad(R, right);
    }
    this.quad(T, top);
    if (o.noOutline) return;
    const inner = shade(color, -0.4);
    if (h > 0) {
      this.line([x + w, y + d, z], [x + w, y + d, z + h], inner);
      this.line([x + w, y + d, z + h], [x + w, y, z + h], inner);
      this.line([x + w, y + d, z + h], [x, y + d, z + h], inner);
    }
    const sil: P3[] =
      h > 0
        ? [[x, y, z + h], [x + w, y, z + h], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x, y + d, z + h]]
        : T;
    this.r.strokePoly(sil.map((q) => this.proj(q)), edge);
  }
}

const rings = new Map<number, [number, number][]>();
function ring(n: number): [number, number][] {
  let r = rings.get(n);
  if (!r) rings.set(n, (r = Array.from({ length: n }, (_, k) => [Math.cos((k / n) * Math.PI * 2), Math.sin((k / n) * Math.PI * 2)] as [number, number])));
  return r;
}

export interface BoxOpts {
  top?: string;
  left?: string;
  right?: string;
  outline?: string;
  noOutline?: boolean;
}

/** A pre-rendered piece with the screen offset of its footprint's back corner. */
export interface Sprite {
  r: Raster;
  /** Pixel inside r where the footprint's back corner (world 0,0,0) sits. */
  ax: number;
  ay: number;
}

/** Render with a generous canvas (sizes in unscaled pixels), then crop to content. */
export function makeSprite(draw: (iso: Iso) => void, size0 = 200, ax0 = 100, ay0 = 130): Sprite {
  const size = size0 * S, ax = ax0 * S, ay = ay0 * S;
  const r = new Raster(size, size);
  draw(new Iso(r, ax, ay));
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (r.data[(y * size + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { r: new Raster(1, 1), ax: 0, ay: 0 };
  const out = new Raster(x1 - x0 + 1, y1 - y0 + 1);
  out.blit(cropView(r, x0, y0, out.w, out.h), 0, 0);
  return { r: out, ax: ax - x0, ay: ay - y0 };
}

function cropView(r: Raster, x0: number, y0: number, w: number, h: number): Raster {
  const c = new Raster(w, h);
  for (let y = 0; y < h; y++) c.data.set(r.data.subarray(((y0 + y) * r.w + x0) * 4, ((y0 + y) * r.w + x0 + w) * 4), y * w * 4);
  return c;
}

/** Desaturate + darken (used for relapse-locked items). */
export function lockedCopy(s: Sprite): Sprite {
  const r = new Raster(s.r.w, s.r.h);
  r.data.set(s.r.data);
  for (let i = 0; i < r.data.length; i += 4) {
    const g = (r.data[i] * 0.3 + r.data[i + 1] * 0.59 + r.data[i + 2] * 0.11) * 0.55;
    r.data[i] = g; r.data[i + 1] = g; r.data[i + 2] = g + 8;
  }
  return { ...s, r };
}

/**
 * Extrude a side profile (points in X/Z, any winding) across Y from y0 to y1.
 * Draws the faces that point up or toward +X, then the near (+Y) side on top.
 * Great for car bodies: the silhouette comes from the profile.
 */
export function prism(
  iso: Iso,
  profile: [number, number][],
  y0: number,
  y1: number,
  color: string,
  o: { side?: string; top?: string; front?: string; slope?: string; outline?: string; noSide?: boolean } = {},
) {
  let pts = profile;
  const area = pts.reduce((a, [x, z], i) => {
    const [x2, z2] = pts[(i + 1) % pts.length];
    return a + (x * z2 - x2 * z);
  }, 0);
  if (area < 0) pts = [...pts].reverse();
  const top = o.top ?? shade(color, 0.16);
  const front = o.front ?? shade(color, -0.22);
  const outline = o.outline ?? shade(color, -0.6);
  const faces: { q: P3[]; mx: number; c: string }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    const nx = z2 - z1, nz = -(x2 - x1);
    if (nz <= 0 && nx <= 0) continue;
    const len = Math.hypot(nx, nz) || 1;
    const up = Math.max(0, nz / len);
    const c = up > 0.85 ? top : up > 0.35 ? (o.slope ?? shade(color, 0.05)) : front;
    faces.push({ q: [[x1, y0, z1], [x2, y0, z2], [x2, y1, z2], [x1, y1, z1]], mx: (x1 + x2) / 2, c });
  }
  faces.sort((a, b) => a.mx - b.mx);
  for (const f of faces) iso.quad(f.q, f.c);
  if (!o.noSide) iso.quad(pts.map(([x, z]) => [x, y1, z] as P3), o.side ?? color);
  // silhouette-ish outline: near side edges plus the far top edges
  for (const f of faces) iso.line(f.q[0], f.q[1], outline);
  if (!o.noSide)
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      iso.line([a[0], y1, a[1]], [b[0], y1, b[1]], outline);
    }
}

/** Octagon "circle" on a vertical plane (u along the plane, z up). */
export function octagonOn(plane: (u: number, z: number) => P3, cu: number, cz: number, r: number): P3[] {
  const k = r * 0.41;
  return ([[k, r], [r, k], [r, -k], [k, -r], [-k, -r], [-r, -k], [-r, k], [-k, r]] as const).map(([du, dz]) => plane(cu + du, cz + dz));
}
