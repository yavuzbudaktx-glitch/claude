/** Tiny DOM-free RGBA raster so sprites stay pixel-exact and can be rendered in Node too. */
export type RGBA = [number, number, number, number];

const cache = new Map<string, RGBA>();
export function rgba(hex: string): RGBA {
  let c = cache.get(hex);
  if (c) return c;
  const h = hex.replace("#", "");
  c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length > 6 ? parseInt(h.slice(6, 8), 16) : 255];
  cache.set(hex, c);
  return c;
}

export function shade(hex: string, f: number): string {
  const [r, g, b] = rgba(hex);
  const adj = (v: number) => Math.round(Math.max(0, Math.min(255, f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return "#" + [adj(r), adj(g), adj(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export class Raster {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x: number, y: number, color: string) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b, a] = rgba(color);
    const i = (y * this.w + x) * 4;
    if (a === 255) {
      this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255;
      return;
    }
    const t = a / 255;
    this.data[i] = this.data[i] * (1 - t) + r * t;
    this.data[i + 1] = this.data[i + 1] * (1 - t) + g * t;
    this.data[i + 2] = this.data[i + 2] * (1 - t) + b * t;
    this.data[i + 3] = Math.max(this.data[i + 3], a);
  }

  /** Copy another raster in, optionally mirrored horizontally. Transparent pixels skipped. */
  blit(src: Raster, dx: number, dy: number, mirror = false) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + (mirror ? src.w - 1 - x : x)) * 4;
        if (src.data[i + 3] === 0) continue;
        const tx = dx + x, ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        const j = (ty * this.w + tx) * 4;
        this.data.set(src.data.subarray(i, i + 4), j);
      }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string) {
    x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  fillPoly(pts: [number, number][], color: string) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
    const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (inside(x + 0.5, y + 0.5, pts)) this.set(x, y, color);
  }

  strokePoly(pts: [number, number][], color: string) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.line(a[0], a[1], b[0], b[1], color);
    }
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }
}

function inside(x: number, y: number, pts: [number, number][]) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Paint a string-grid sprite: each char maps to a palette color; '.' is transparent. */
export function paintGrid(r: Raster, grid: string[], palette: Record<string, string>, dx = 0, dy = 0) {
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      const col = palette[ch];
      if (!col) throw new Error(`No palette color for '${ch}'`);
      r.set(dx + x, dy + y, col);
    }
  });
}

export function gridRaster(grid: string[], palette: Record<string, string>): Raster {
  const r = new Raster(Math.max(...grid.map((g) => g.length)), grid.length);
  paintGrid(r, grid, palette);
  return r;
}
