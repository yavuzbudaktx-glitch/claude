import type { ItemId } from "@/engine/types";
import { Iso, TILE, makeSprite, type Sprite } from "./iso";
import { Raster, shade } from "./raster";
import { renderPony } from "./sprites/pony";

export const ROOM_TILES = 8;
export const ROOM_W = 320;
export const ROOM_H = 240;
/** Screen position of world (0,0,0): the back corner of the floor. */
export const ORIGIN = { x: 160, y: 96 };

export type PieceId = "bed" | "fridge" | "counter" | "rug" | ItemId | "pizza" | "clothes" | "can";

export interface Placement {
  id: PieceId;
  tx: number;
  ty: number;
  w: number;
  d: number;
  /** Flat things (rugs, mess) always draw under people. */
  flat?: boolean;
  /** Billboard sprites (pony) anchor at tile center instead of back corner. */
  billboard?: boolean;
}

export const FIXED: Placement[] = [
  { id: "bed", tx: 0, ty: 5, w: 3, d: 2 },
  { id: "fridge", tx: 2, ty: 0, w: 1, d: 1 },
  { id: "counter", tx: 3, ty: 0, w: 2, d: 1 },
  { id: "rug", tx: 5, ty: 3, w: 1, d: 2, flat: true },
];

export const ITEM_SLOTS: Record<ItemId, Placement> = {
  plant: { id: "plant", tx: 0, ty: 0, w: 1, d: 1 },
  bookshelf: { id: "bookshelf", tx: 1, ty: 0, w: 1, d: 1 },
  lamp: { id: "lamp", tx: 7, ty: 0, w: 1, d: 1 },
  tv: { id: "tv", tx: 0, ty: 2, w: 1, d: 1 },
  sofa: { id: "sofa", tx: 2, ty: 2, w: 1, d: 2 },
  aquarium: { id: "aquarium", tx: 7, ty: 3, w: 1, d: 1 },
  arcade: { id: "arcade", tx: 0, ty: 4, w: 1, d: 1 },
  car: { id: "car", tx: 4, ty: 6, w: 3, d: 2 },
  pony: { id: "pony", tx: 2, ty: 4, w: 1, d: 1, billboard: true },
};

export const MESS: Placement[] = [
  { id: "pizza", tx: 3, ty: 4, w: 1, d: 1, flat: true },
  { id: "clothes", tx: 1, ty: 3, w: 1, d: 1, flat: true },
  { id: "can", tx: 4, ty: 5, w: 1, d: 1, flat: true },
];

/** Where the avatar stands for each kind of action. */
export const SPOTS = {
  wake: { tx: 3, ty: 5 },
  pray: { tx: 5, ty: 3 },
  diet: { tx: 3, ty: 1 },
  center: { tx: 4, ty: 4 },
  sad: { tx: 6, ty: 4 },
} as const;

const WOOD = "#8a5a33";

const DRAW: Record<PieceId, (iso: Iso) => void> = {
  bed(i) {
    i.box(0, 0, 0, 3, 32, 22, WOOD);
    i.box(3, 0, 0, 45, 32, 7, WOOD);
    i.box(4, 1, 7, 43, 30, 4, "#f2efe6");
    i.box(6, 6, 11, 9, 20, 3, "#ffffff");
    i.box(18, 0, 7, 30, 32, 6, "#3d6fb6");
    i.box(18, 0, 13, 4, 32, 0.01, "#f2efe6", { noOutline: true });
  },
  fridge(i) {
    i.box(1, 1, 0, 14, 14, 38, "#e9edf0");
    i.line([15, 1, 26], [15, 15, 26], "#9aa3ab");
    i.line([15, 4, 28], [15, 4, 34], "#6b747c");
    i.line([15, 4, 15], [15, 4, 22], "#6b747c");
  },
  counter(i) {
    i.box(0, 1, 0, 32, 14, 15, "#9a6a3e", { top: "#e6dccb" });
    i.box(7, 4, 15, 9, 7, 1, "#ffffff");
    i.box(9, 5, 16, 4, 4, 2, "#5cb85c");
    i.box(21, 6, 15, 3, 3, 3, "#d23a2c");
    i.box(26, 4, 15, 2, 2, 6, "#bfe3f2");
  },
  rug(i) {
    i.box(1, 1, 0, 14, 30, 0, "#c9a227", { top: "#c9a227" });
    i.box(3, 3, 0, 10, 26, 0, "#1f6b45", { top: "#1f6b45", noOutline: true });
    i.quad([[5, 4, 0], [11, 4, 0], [11, 9, 0], [5, 9, 0]], "#2f8a5c");
    i.quad([[7, 5, 0], [9, 5, 0], [9, 7, 0], [7, 7, 0]], "#c9a227");
    for (let y = 13; y < 27; y += 4) i.quad([[6, y, 0], [10, y, 0], [10, y + 2, 0], [6, y + 2, 0]], "#9c2f2f");
  },
  plant(i) {
    i.box(4, 4, 0, 8, 8, 8, "#b5623a");
    i.box(3, 3, 8, 10, 10, 6, "#3f9a4a");
    i.box(5, 5, 14, 6, 6, 6, "#4fb45a");
    i.box(6, 6, 20, 4, 4, 4, "#62c96b");
  },
  lamp(i) {
    i.box(5, 5, 0, 6, 6, 2, "#333333");
    i.box(7, 7, 2, 2, 2, 26, "#5a5a5a");
    i.box(3, 3, 28, 10, 10, 8, "#f4d58a");
  },
  bookshelf(i) {
    i.box(1, 0, 0, 14, 12, 44, "#7a4b2a");
    const cols = ["#c0392b", "#2e86c1", "#f1c40f", "#27ae60", "#8e44ad", "#e67e22"];
    [4, 17, 30].forEach((z, row) => {
      i.box(1, 12, z - 1, 14, 1, 1, "#5e391f", { noOutline: true });
      for (let b = 0; b < 5; b++) i.box(2 + b * 2.6, 9, z, 2, 3, 8 + ((b + row) % 3), cols[(b + row) % cols.length]);
    });
  },
  tv(i) {
    i.box(1, 2, 0, 10, 12, 10, "#5a3a22");
    i.box(1, 1, 10, 11, 14, 12, "#3a3a3a");
    i.quad([[12, 3, 12], [12, 13, 12], [12, 13, 20], [12, 3, 20]], "#6fb7e6");
    i.quad([[12, 4, 17], [12, 7, 17], [12, 7, 19], [12, 4, 19]], "#bfe6ff");
    i.line([6, 8, 22], [3, 3, 30], "#222222");
    i.line([6, 8, 22], [9, 12, 30], "#222222");
  },
  sofa(i) {
    i.box(0, 0, 0, 14, 32, 8, "#c0392b");
    i.box(0, 0, 8, 10, 3, 6, "#c0392b");
    i.box(0, 29, 8, 10, 3, 6, "#c0392b");
    i.box(10, 0, 8, 4, 32, 11, "#a93226");
  },
  aquarium(i) {
    i.box(1, 1, 0, 14, 14, 12, "#4a3a2a");
    i.box(1, 1, 12, 14, 14, 14, "#6cc6e8", { top: "#a8e2f5" });
    i.box(2, 2, 12, 12, 12, 2, "#d9c27a", { noOutline: true });
    const fish = (x: number, y: number, z: number, c: string) => {
      const [sx, sy] = i.proj([x, y, z]);
      i.r.rect(sx, sy, 3, 2, c);
      i.r.set(sx - 1, sy, shade(c, -0.3));
    };
    fish(15, 6, 20, "#ff8c1a");
    fish(15, 11, 17, "#ffd23f");
    fish(9, 15, 22, "#ff5e5e");
  },
  arcade(i) {
    i.box(1, 1, 0, 14, 14, 40, "#5b2a86");
    i.quad([[15, 3, 22], [15, 13, 22], [15, 13, 34], [15, 3, 34]], "#1c1c3a");
    i.quad([[15, 5, 26], [15, 8, 26], [15, 8, 29], [15, 5, 29]], "#4dff88");
    i.quad([[15, 9, 30], [15, 11, 30], [15, 11, 32], [15, 9, 32]], "#ff4d6d");
    i.box(1, 1, 40, 14, 14, 4, "#f1c40f");
    i.box(13, 3, 17, 4, 10, 2, "#2b2b2b");
  },
  car(i) {
    const wheel = (x: number, y: number) => i.box(x, y, 0, 8, 4, 8, "#1d1d1d");
    wheel(6, 1);
    wheel(34, 1);
    i.box(0, 3, 3, 48, 26, 9, "#d8342a");
    i.box(0, 4, 12, 14, 24, 3, "#d8342a");
    i.box(14, 6, 12, 3, 20, 10, "#f1e3c6");
    i.box(17, 6, 12, 10, 20, 5, "#f1e3c6");
    i.box(28, 5, 12, 4, 22, 3, "#2a2a2a");
    i.box(27, 17, 15, 2, 4, 4, "#222222");
    i.box(32, 4, 12, 16, 24, 1, "#d8342a");
    i.box(31, 6, 13, 1, 20, 8, "#bfe3f2", { outline: "#7aa7bd" });
    i.box(47, 4, 3, 3, 24, 4, "#c8c8c8");
    i.box(50, 7, 7, 1, 4, 3, "#ffe680");
    i.box(50, 21, 7, 1, 4, 3, "#ffe680");
    wheel(6, 27);
    wheel(34, 27);
  },
  pony() {},
  pizza(i) {
    i.box(2, 3, 0, 12, 12, 2, "#c8a26a");
    i.quad([[4, 5, 2], [9, 5, 2], [9, 10, 2], [4, 10, 2]], "#e0b34a");
    i.quad([[5, 6, 2], [6, 6, 2], [6, 7, 2], [5, 7, 2]], "#c0392b");
  },
  clothes(i) {
    i.quad([[2, 3, 0], [12, 2, 0], [14, 9, 0], [5, 12, 0]], "#3d6fb6", "#22406b");
    i.quad([[6, 8, 0], [13, 10, 0], [10, 15, 0], [4, 14, 0]], "#e1e1e1", "#8a8a8a");
  },
  can(i) {
    i.box(5, 6, 0, 6, 3, 3, "#c0392b");
  },
};

export function buildPiece(id: PieceId): Sprite {
  if (id === "pony") {
    const r = renderPony();
    return { r, ax: Math.floor(r.w / 2), ay: r.h - 2 };
  }
  return makeSprite(DRAW[id]);
}

/** Screen position of a tile's back corner (or its center for billboards). */
export function tileScreen(tx: number, ty: number, center = false): [number, number] {
  const cx = center ? 0.5 : 0, cy = center ? 0.5 : 0;
  return [ORIGIN.x + (tx + cx - (ty + cy)) * TILE, ORIGIN.y + ((tx + cx + ty + cy) * TILE) / 2];
}

/** Floor, walls, window (sky follows the clock) and a framed Kaaba picture. */
export function buildBackground(hour: number): Raster {
  const r = new Raster(ROOM_W, ROOM_H);
  const iso = new Iso(r, ORIGIN.x, ORIGIN.y);
  const L = ROOM_TILES * TILE;
  const H = 72;

  iso.box(-4, 0, 0, 4, L, H, "#a9c6dc", { right: "#b9d3e6", top: "#e8eef3", outline: "#5f7a8f" });
  iso.box(-4, -4, 0, L + 4, 4, H, "#a9c6dc", { left: "#9dbbd2", top: "#e8eef3", outline: "#5f7a8f" });
  // baseboards
  iso.quad([[0, 0, 0], [0, L, 0], [0, L, 4], [0, 0, 4]], "#7d5a3c");
  iso.quad([[0, 0, 0], [L, 0, 0], [L, 0, 4], [0, 0, 4]], "#6e4f34");

  iso.box(0, 0, -6, L, L, 6, "#a88758", { top: "#a88758", outline: "#5e4628" });
  for (let tx = 0; tx < ROOM_TILES; tx++)
    for (let ty = 0; ty < ROOM_TILES; ty++) {
      const x = tx * TILE, y = ty * TILE;
      iso.quad([[x, y, 0], [x + TILE, y, 0], [x + TILE, y + TILE, 0], [x, y + TILE, 0]],
        (tx + ty) % 2 ? "#d8c39c" : "#cfb98f", "#b9a277");
    }

  // window on the right wall
  const sky = hour >= 7 && hour < 18 ? "#8fd3ff" : hour >= 5 && hour < 20 ? "#f2a65a" : "#1d2550";
  iso.quad([[70, 0, 28], [110, 0, 28], [110, 0, 62], [70, 0, 62]], "#f5f5f5", "#7d8a94");
  iso.quad([[72, 0, 30], [108, 0, 30], [108, 0, 60], [72, 0, 60]], sky);
  if (sky === "#1d2550") {
    iso.quad([[96, 0, 50], [100, 0, 50], [100, 0, 54], [96, 0, 54]], "#f5f0c8");
    for (const [sx, sz] of [[78, 56], [86, 48], [102, 40], [80, 38]]) {
      const [px, py] = iso.proj([sx, 0, sz]);
      r.set(px, py, "#ffffff");
    }
  } else {
    iso.quad([[76, 0, 52], [80, 0, 52], [80, 0, 56], [76, 0, 56]], "#fff3a6");
  }
  iso.line([90, 0, 30], [90, 0, 60], "#f5f5f5");
  iso.line([72, 0, 45], [108, 0, 45], "#f5f5f5");

  // framed Kaaba picture on the left wall
  iso.quad([[0, 40, 32], [0, 66, 32], [0, 66, 58], [0, 40, 58]], "#c9a227", "#7a5f12");
  iso.quad([[0, 42, 34], [0, 64, 34], [0, 64, 56], [0, 42, 56]], "#2b3a55");
  iso.quad([[0, 46, 36], [0, 60, 36], [0, 60, 48], [0, 46, 48]], "#111111");
  iso.quad([[0, 46, 45], [0, 60, 45], [0, 60, 46], [0, 46, 46]], "#d4af37");
  return r;
}

/** Tiles the avatar can't walk through. */
export function blockedTiles(owned: ItemId[]): Set<string> {
  const set = new Set<string>();
  const add = (p: Placement) => {
    if (p.flat) return;
    for (let x = p.tx; x < p.tx + p.w; x++) for (let y = p.ty; y < p.ty + p.d; y++) set.add(`${x},${y}`);
  };
  FIXED.forEach(add);
  owned.forEach((id) => add(ITEM_SLOTS[id]));
  return set;
}

/** BFS path over the 8×8 floor, 4-connected. Returns tiles after the start. */
export function findPath(from: { tx: number; ty: number }, to: { tx: number; ty: number }, blocked: Set<string>) {
  const key = (x: number, y: number) => `${x},${y}`;
  const prev = new Map<string, string | null>([[key(from.tx, from.ty), null]]);
  const q: [number, number][] = [[from.tx, from.ty]];
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x === to.tx && y === to.ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= ROOM_TILES || ny >= ROOM_TILES || prev.has(k) || blocked.has(k)) continue;
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
