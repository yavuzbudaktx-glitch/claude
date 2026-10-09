import { Raster, shade } from "./raster";

/** World units per tile edge. A tile projects to a 32×16 diamond. */
export const TILE = 16;

export type P3 = [number, number, number];

/** A raster plus an isometric projection origin (where world 0,0,0 lands). */
export class Iso {
  constructor(public r: Raster, public ox: number, public oy: number) {}

  proj([x, y, z]: P3): [number, number] {
    return [this.ox + x - y, this.oy + (x + y) / 2 - z];
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

/** Render with a generous canvas, then crop to content. */
export function makeSprite(draw: (iso: Iso) => void, size = 200, ax = 100, ay = 130): Sprite {
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
