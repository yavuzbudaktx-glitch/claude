import { isGymTier } from "@/engine/catalog";
import { reservedOnWalls, roomKeySize, type RoomKey } from "@/engine/wall";
import { Iso, S, TILE, makeSprite, type P3, type Sprite } from "./iso";
import { GYM } from "./pieces/gym";
import { HOME } from "./pieces/home";
import { LIVING } from "./pieces/living";
import type { Draw } from "./pieces/util";
import { Raster, shade } from "./raster";
import { drawWallItem } from "./wallart";

// ---------- room geometry ----------

export interface RoomSpec {
  key: RoomKey;
  n: number;
  /** Wall height in world units. */
  wallH: number;
  /** Canvas size in screen pixels. */
  W: number;
  H: number;
  origin: { x: number; y: number };
}

export function roomSpec(key: RoomKey): RoomSpec {
  const n = roomKeySize(key);
  const wallH = n <= 10 ? 72 : n <= 12 ? 88 : 96;
  const W = (n * 32 + 28) * S;
  const top = (wallH + 12) * S;
  return { key, n, wallH, W, H: top + (n * 16 + 12) * S, origin: { x: W / 2, y: top } };
}

/** Screen position of a tile's back corner (or its center). */
export function tileScreen(spec: RoomSpec, tx: number, ty: number, center = false): [number, number] {
  const c = center ? 0.5 : 0;
  return [spec.origin.x + (tx + c - (ty + c)) * TILE * S, spec.origin.y + ((tx + c + ty + c) * TILE * S) / 2];
}

/** Inverse of tileScreen for a floor point. */
export function screenToTile(spec: RoomSpec, sx: number, sy: number): { tx: number; ty: number } {
  const a = (sx - spec.origin.x) / (TILE * S);
  const b = (sy - spec.origin.y) / ((TILE * S) / 2);
  return { tx: Math.floor((a + b) / 2), ty: Math.floor((b - a) / 2) };
}

/** Screen point of a world point in the room (world units: a tile is 16). */
export function roomPoint(spec: RoomSpec, [x, y, z]: P3): [number, number] {
  return [spec.origin.x + (x - y) * S, spec.origin.y + ((x + y) / 2 - z) * S];
}

// ---------- pieces ----------

export const MESS: { id: string; tx: number; ty: number }[] = [
  { id: "pizza", tx: 3, ty: 4 },
  { id: "clothes", tx: 1, ty: 3 },
  { id: "can", tx: 4, ty: 5 },
];

const DRAW: Record<string, Draw> = { ...HOME, ...LIVING, ...GYM };

/** Piece keys may carry a variant: "prayerrug:rug-red", "kitchen:wall-open". */
export function buildPiece(key: string): Sprite {
  const [id, variant] = key.split(":");
  const draw = DRAW[id];
  if (!draw) return { r: new Raster(1, 1), ax: 0, ay: 0 };
  return makeSprite((iso) => draw(iso, variant), 220, 110, 150);
}

export const hasPiece = (id: string) => id in DRAW;

// ---------- walls & floors ----------

function hash2(a: number, b: number) {
  let h = (Math.floor(a) * 374761393 + Math.floor(b) * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Pattern = (u: number, z: number) => string;

const WALLPAPERS: Record<string, { left: Pattern; right: Pattern; base: string; trim?: string }> = {
  "wp-sky": { base: "#a9c6dc", left: () => "#b9d3e6", right: () => "#9dbbd2" },
  "wp-sand": { base: "#d9bf8f", left: () => "#e8d3a8", right: () => "#d6bd8e" },
  "wp-sage": { base: "#a6b996", left: () => "#bccdaf", right: () => "#a6b996" },
  "wp-navy": { base: "#26304c", left: () => "#34405f", right: () => "#29334f" },
  "wp-brick": { base: "#9a4f3a", left: (u, z) => brick(u, z, 0), right: (u, z) => brick(u, z, -0.12) },
  "wp-wood": { base: "#6b4729", left: (u) => slat(u, 0), right: (u) => slat(u, -0.12) },
  "wp-zellige": { base: "#e9e3d3", left: (u, z) => zellige(u, z, 0), right: (u, z) => zellige(u, z, -0.1) },
  // gym rooms
  "gw-block": { base: "#9a9c9e", left: (u, z) => block(u, z, 0), right: (u, z) => block(u, z, -0.12), trim: "#5a5c5e" },
  "gw-white": { base: "#e9e9e6", left: (u, z) => stripe(u, z, "#f2f2ef", 0), right: (u, z) => stripe(u, z, "#f2f2ef", -0.08), trim: "#1d1d20" },
  "gw-dark": { base: "#2b2d33", left: (u, z) => stripe(u, z, "#34373e", 0, "#ff7a1a"), right: (u, z) => stripe(u, z, "#34373e", -0.15, "#ff7a1a"), trim: "#111114" },
};

function brick(u: number, z: number, f: number) {
  const row = Math.floor(z / 4);
  const off = row % 2 ? 4 : 0;
  const col = Math.floor((u + off) / 8);
  if (z % 4 < 0.5 || (u + off) % 8 < 0.5) return shade("#cbb9a6", f);
  const v = hash2(col, row);
  return shade(v < 0.33 ? "#a5533c" : v < 0.66 ? "#b4613f" : "#94472f", f);
}

function block(u: number, z: number, f: number) {
  const row = Math.floor(z / 8);
  const off = row % 2 ? 8 : 0;
  if (z % 8 < 0.5 || (u + off) % 16 < 0.5) return shade("#7d8083", f);
  return shade(hash2(Math.floor((u + off) / 16), row) < 0.5 ? "#a2a4a6" : "#9a9c9e", f);
}

/** Painted wall with a dark band low down (and an accent line for the pro gym). */
function stripe(u: number, z: number, wallC: string, f: number, accent?: string) {
  if (z < 12) return shade(accent ? "#16171a" : "#2b2b2e", f);
  if (accent && z >= 12 && z < 14) return shade(accent, f);
  return shade(wallC, f + (hash2(u * 3, z * 3) < 0.04 ? -0.03 : 0));
}

function slat(u: number, f: number) {
  const k = Math.floor(u / 5);
  if (u % 5 < 0.5) return shade("#3e2716", f);
  return shade(k % 2 ? "#7a5232" : "#6e4a2c", f);
}

function zellige(u: number, z: number, f: number) {
  const a = Math.abs((u % 16) - 8), b = Math.abs((z % 16) - 8);
  if (a + b < 3.5) return shade("#3f7fa6", f);
  if (a + b > 12.5) return shade("#2a9d7f", f);
  if (Math.abs(a + b - 8) < 0.5) return shade("#d3c8ae", f);
  return shade("#f1ebdc", f);
}

type FloorPattern = (x: number, y: number) => string;

const FLOORS: Record<string, { slab: string; at: FloorPattern }> = {
  "fl-tile": {
    slab: "#a88758",
    at: (x, y) => (x % 16 < 0.5 || y % 16 < 0.5 ? "#b9a277" : (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? "#d8c39c" : "#cfb98f"),
  },
  "fl-carpet": { slab: "#5d626b", at: (x, y) => (hash2(x * 4, y * 4) < 0.08 ? "#7c818b" : "#8a8f99") },
  "fl-oak": {
    slab: "#7c5530",
    at: (x, y) => {
      const plank = Math.floor(y / 5);
      const seg = Math.floor((x + plank * 11) / 28);
      if (y % 5 < 0.5 || (x + plank * 11) % 28 < 0.5) return "#7c5530";
      const v = hash2(plank, seg);
      const grain = hash2(Math.floor(x * 2), plank) < 0.05 ? -0.06 : 0;
      return shade(v < 0.33 ? "#c08a55" : v < 0.66 ? "#b37d4b" : "#c9955f", grain);
    },
  },
  "fl-checker": {
    slab: "#333333",
    at: (x, y) => ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? "#1f1f22" : "#efefe9"),
  },
  "fl-marble": {
    slab: "#9a9a96",
    at: (x, y) => {
      if (x % 32 < 0.5 || y % 32 < 0.5) return "#d0d0cc";
      const v = Math.sin(x * 0.21 + y * 0.53 + Math.sin(y * 0.17) * 2.2);
      return Math.abs(v) < 0.05 ? "#b6b6b2" : hash2(x * 4, y * 4) < 0.03 ? "#e0e0dc" : "#f1f1ed";
    },
  },
  // gym rooms
  "gf-concrete": {
    slab: "#6f7275",
    at: (x, y) => (x % 32 < 0.5 || y % 32 < 0.5 ? "#7d8083" : hash2(x * 4, y * 4) < 0.05 ? "#9a9da0" : hash2(x, y) < 0.3 ? "#a9acaf" : "#b1b4b7"),
  },
  "gf-rubber": {
    slab: "#141416",
    at: (x, y) => (x % 16 < 0.5 || y % 16 < 0.5 ? "#101012" : hash2(x * 4, y * 4) < 0.07 ? "#4a4d55" : "#25262a"),
  },
  "gf-pro": {
    slab: "#141416",
    at: (x, y) => (Math.abs(x % 48 - 2) < 0.6 ? "#ff7a1a" : y % 16 < 0.5 ? "#101012" : hash2(x * 4, y * 4) < 0.06 ? "#3a3d45" : "#202125"),
  },
};

/** How each gym tier looks. */
export const GYM_LOOK: Record<string, { wallpaper: string; floor: string }> = {
  "gym-garage": { wallpaper: "gw-block", floor: "gf-concrete" },
  "gym-home": { wallpaper: "gw-white", floor: "gf-rubber" },
  "gym-pro": { wallpaper: "gw-dark", floor: "gf-pro" },
};

export interface BackgroundInput {
  spec: RoomSpec;
  wallpaper: string;
  floor: string;
  hour: number;
  wallItems: { id: string; wall: "L" | "R"; u: number; locked: boolean }[];
  curtains?: boolean;
  ledStrip?: boolean;
}

function skyColor(hour: number) {
  return hour >= 7 && hour < 18 ? "#8fd3ff" : hour >= 5 && hour < 20 ? "#f2a65a" : "#1d2550";
}

/** Walls, floor, windows (sky follows the clock), the Kaaba picture and wall decor. */
export function buildBackground({ spec, wallpaper, floor, hour, wallItems, curtains, ledStrip }: BackgroundInput): Raster {
  const r = new Raster(spec.W, spec.H);
  const iso = new Iso(r, spec.origin.x, spec.origin.y);
  const L = spec.n * TILE;
  const H = spec.wallH;
  const wp = WALLPAPERS[wallpaper] ?? WALLPAPERS["wp-sky"];
  const fl = FLOORS[floor] ?? FLOORS["fl-tile"];

  iso.box(-4, 0, 0, 4, L, H, wp.base, { top: "#e8eef3", outline: "#4f5f6d" });
  iso.box(-4, -4, 0, L + 4, 4, H, wp.base, { top: "#e8eef3", outline: "#4f5f6d" });
  iso.paint((u, z) => [0, u, z], L, H, wp.left);
  iso.paint((u, z) => [u, 0, z], L, H, wp.right);
  iso.line([0, 0, 0], [0, 0, H], "#4f5f6d");
  // skirting boards
  const trim = wp.trim ?? "#7d5a3c";
  iso.quad([[0, 0, 0], [0, L, 0], [0, L, 4], [0, 0, 4]], trim);
  iso.quad([[0, 0, 0], [L, 0, 0], [L, 0, 4], [0, 0, 4]], shade(trim, -0.12));
  iso.line([0, 0, 4], [0, L, 4], shade(trim, 0.25));
  iso.line([0, 0, 4], [L, 0, 4], shade(trim, 0.15));

  iso.box(0, 0, -6, L, L, 6, fl.slab, { top: fl.slab, outline: shade(fl.slab, -0.5) });
  iso.paint((x, y) => [x, y, 0], L, L, fl.at);
  // soft shading where the floor meets the walls
  for (let d = 0; d < 6; d += 0.5 / S) {
    const a = Math.round(40 * (1 - d / 6)).toString(16).padStart(2, "0");
    iso.line([d, d, 0], [d, L, 0], `#000000${a}`);
    iso.line([d, d, 0], [L, d, 0], `#000000${a}`);
  }

  const sky = skyColor(hour);
  const wallAt = (wall: "L" | "R") => (u: number, z: number): P3 => (wall === "L" ? [0, u, z] : [u, 0, z]);
  for (const w of reservedOnWalls(spec.key)) {
    const at = wallAt(w.wall);
    if (w.kind === "kaaba") {
      iso.quad([at(40, 32), at(66, 32), at(66, 58), at(40, 58)], "#c9a227", "#7a5f12");
      iso.quad([at(42, 34), at(64, 34), at(64, 56), at(42, 56)], "#2b3a55");
      iso.quad([at(46, 36), at(60, 36), at(60, 48), at(46, 48)], "#111111");
      iso.quad([at(46, 45), at(60, 45), at(60, 46.5), at(46, 46.5)], "#d4af37");
      iso.quad([at(51, 36), at(54, 36), at(54, 42), at(51, 42)], "#1d1d1d", "#d4af37");
    } else if (w.kind === "door") {
      iso.quad([at(w.u0, 0), at(w.u1, 0), at(w.u1, 70), at(w.u0, 70)], "#f5f5f5", "#7d8a94");
      iso.quad([at(w.u0 + 2, 1), at(w.u1 - 2, 1), at(w.u1 - 2, 68), at(w.u0 + 2, 68)], sky);
      iso.line(at((w.u0 + w.u1) / 2, 1), at((w.u0 + w.u1) / 2, 68), "#f5f5f5");
      iso.quad([at(w.u0 + 2, 1), at(w.u1 - 2, 1), at(w.u1 - 2, 12), at(w.u0 + 2, 12)], "#6f7a84");
    } else if (w.u1 - w.u0 > 60) drawSkyline(iso, sky, at, w.u0, w.u1, 14, Math.min(H - 8, 82));
    else drawWindow(iso, sky, at, w.u0, w.u1, 28, 62);
    if (curtains && w.kind !== "kaaba") {
      const top = w.kind === "door" ? 72 : w.u1 - w.u0 > 60 ? Math.min(H - 6, 84) : 64;
      const bottom = w.kind === "door" ? 0 : w.u1 - w.u0 > 60 ? 10 : 24;
      iso.quad([at(w.u0 - 4, bottom), at(w.u0 + 4, bottom), at(w.u0 + 4, top), at(w.u0 - 4, top)], "#b23a48", "#6e1f2a");
      iso.quad([at(w.u1 - 4, bottom), at(w.u1 + 4, bottom), at(w.u1 + 4, top), at(w.u1 - 4, top)], "#b23a48", "#6e1f2a");
      for (const u of [w.u0 - 2, w.u0 + 1, w.u1 - 1, w.u1 + 2]) iso.line(at(u, bottom + 1), at(u, top - 1), "#8e2b38");
      iso.line(at(w.u0 - 6, top + 1), at(w.u1 + 6, top + 1), "#3a3a3e");
    }
  }
  if (isGymTier(spec.key)) {
    // ceiling spotlights / strip lights along the top of the walls
    for (const wall of ["L", "R"] as const) {
      const at = wallAt(wall);
      for (let u = 12; u < L - 8; u += 32) iso.quad([at(u, H - 6), at(u + 10, H - 6), at(u + 10, H - 4), at(u, H - 4)], "#f4f7fa", "#9aa0a6");
    }
  }
  if (ledStrip)
    for (const wall of ["L", "R"] as const) {
      const at = wallAt(wall);
      iso.line(at(2, H - 3), at(L - 2, H - 3), "#c86bff");
    }

  for (const w of wallItems) drawWallItem(iso, w.id, wallAt(w.wall), w.wall, w.u, w.locked);
  return r;
}

function drawWindow(iso: Iso, sky: string, at: (u: number, z: number) => P3, u0: number, u1: number, z0: number, z1: number) {
  iso.quad([at(u0 - 1, z0 - 2), at(u1 + 1, z0 - 2), at(u1 + 1, z0), at(u0 - 1, z0)], "#f5f5f5", "#9aa5ae");
  iso.quad([at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1)], "#f5f5f5", "#7d8a94");
  iso.quad([at(u0 + 2, z0 + 2), at(u1 - 2, z0 + 2), at(u1 - 2, z1 - 2), at(u0 + 2, z1 - 2)], sky);
  if (sky === "#1d2550") {
    iso.circle(at, u1 - 10, z1 - 8, 2.4, "#f5f0c8", undefined, 16);
    iso.circle(at, u1 - 9, z1 - 7.4, 2, sky, undefined, 16);
    for (const [du, dz] of [[6, 4], [14, 12], [24, 20], [10, 22]]) iso.dot(at(u0 + du, z1 - dz), "#ffffff");
  } else {
    iso.circle(at, u0 + 8, z1 - 8, 2.6, "#fff3a6", undefined, 16);
    for (const [du, dz, w] of [[14, 9, 6], [22, 14, 8]]) {
      iso.quad([at(u0 + du, z1 - dz), at(u0 + du + w, z1 - dz), at(u0 + du + w, z1 - dz + 1.6), at(u0 + du, z1 - dz + 1.6)], "#ffffffcc");
    }
  }
  const mid = (u0 + u1) / 2;
  iso.line(at(mid, z0 + 2), at(mid, z1 - 2), "#f5f5f5");
  iso.line(at(u0 + 2, (z0 + z1) / 2), at(u1 - 2, (z0 + z1) / 2), "#f5f5f5");
  iso.line(at(u0 + 3, z1 - 4), at(u0 + 8, z1 - 12), "#ffffff60");
}

/** Floor-to-ceiling glass with a city skyline. */
function drawSkyline(iso: Iso, sky: string, at: (u: number, z: number) => P3, u0: number, u1: number, z0: number, z1: number) {
  const night = sky === "#1d2550";
  iso.quad([at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1)], "#2b2f36");
  iso.quad([at(u0 + 2, z0 + 2), at(u1 - 2, z0 + 2), at(u1 - 2, z1 - 2), at(u0 + 2, z1 - 2)], sky);
  let u = u0 + 2;
  let k = 0;
  while (u < u1 - 2) {
    const w = 6 + Math.floor(hash2(k, 7) * 8);
    const h = 12 + Math.floor(hash2(k, 3) * Math.min(40, z1 - z0 - 18));
    const u2 = Math.min(u1 - 2, u + w);
    const body = night ? (k % 2 ? "#1a1f33" : "#232a44") : k % 2 ? "#7d8ba3" : "#93a2ba";
    iso.quad([at(u, z0 + 2), at(u2, z0 + 2), at(u2, z0 + 2 + h), at(u, z0 + 2 + h)], body);
    for (let wu = u + 1.5; wu < u2 - 1; wu += 2.5)
      for (let wz = z0 + 5; wz < z0 + h; wz += 3)
        if (hash2(wu * 3, wz * 5) < (night ? 0.45 : 0.25)) iso.dot(at(wu, wz), night ? "#ffd86b" : "#c9d6e8");
    u = u2 + 1;
    k++;
  }
  const panes = Math.max(2, Math.round((u1 - u0) / 40));
  for (let p = 1; p < panes; p++) {
    const m = u0 + ((u1 - u0) * p) / panes;
    iso.line(at(m, z0), at(m, z1), "#2b2f36");
  }
}

// ---------- walking ----------

/** BFS path over the floor, 4-connected. Returns tiles after the start. */
export function findPath(n: number, from: { tx: number; ty: number }, to: { tx: number; ty: number }, blocked: Set<string>) {
  const key = (x: number, y: number) => `${x},${y}`;
  const prev = new Map<string, string | null>([[key(from.tx, from.ty), null]]);
  const q: [number, number][] = [[from.tx, from.ty]];
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x === to.tx && y === to.ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= n || ny >= n || prev.has(k) || blocked.has(k)) continue;
      prev.set(k, key(x, y));
      q.push([nx, ny]);
    }
  }
  const path: { tx: number; ty: number }[] = [];
  let k: string | null | undefined = key(to.tx, to.ty);
  if (!prev.has(k)) return path;
  while (k && k !== key(from.tx, from.ty)) {
    const [x, y] = k.split(",").map(Number);
    path.unshift({ tx: x, ty: y });
    k = prev.get(k);
  }
  return path;
}

// ---------- previews ----------

/** Catalog thumbnail for a wall item, cropped to the item itself. */
export function wallItemPreview(id: string): Sprite {
  return makeSprite((iso) => drawWallItem(iso, id, (u, z) => [u, 0, z], "R", 4, false), 160, 60, 120);
}

/** A tiny room corner showing a wallpaper, floor, room size or gym tier. */
export function stylePreview(opts: { wallpaper?: string; floor?: string; size?: number; gym?: string }): Sprite {
  const L = opts.size ?? 40;
  const H = 30;
  const look = opts.gym ? GYM_LOOK[opts.gym] : undefined;
  return makeSprite((iso) => {
    const wp = WALLPAPERS[look?.wallpaper ?? opts.wallpaper ?? "wp-sky"] ?? WALLPAPERS["wp-sky"];
    const fl = FLOORS[look?.floor ?? opts.floor ?? "fl-tile"] ?? FLOORS["fl-tile"];
    iso.box(-2, 0, 0, 2, L, H, wp.base, { top: "#e8eef3", outline: "#4f5f6d" });
    iso.box(-2, -2, 0, L + 2, 2, H, wp.base, { top: "#e8eef3", outline: "#4f5f6d" });
    iso.paint((u, z) => [0, u, z], L, H, wp.left);
    iso.paint((u, z) => [u, 0, z], L, H, wp.right);
    iso.box(0, 0, -3, L, L, 3, fl.slab, { top: fl.slab, outline: shade(fl.slab, -0.5) });
    iso.paint((x, y) => [x, y, 0], L, L, fl.at);
  }, 260, 130, 90);
}
