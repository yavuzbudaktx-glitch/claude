import type { RoomTier } from "@/engine/catalog";
import { Iso, TILE, makeSprite, type P3, type Sprite } from "./iso";
import { Raster, shade } from "./raster";

// ---------- room geometry ----------

export interface RoomSpec {
  tier: RoomTier;
  n: number;
  wallH: number;
  W: number;
  H: number;
  origin: { x: number; y: number };
}

export function roomSpec(tier: RoomTier): RoomSpec {
  const n = tier === "penthouse" ? 12 : tier === "apartment" ? 10 : 8;
  const wallH = tier === "penthouse" ? 88 : 72;
  const W = n * 32 + 28;
  const top = wallH + 12;
  return { tier, n, wallH, W, H: top + n * 16 + 12, origin: { x: W / 2, y: top } };
}

/** Screen position of a tile's back corner (or its center). */
export function tileScreen(spec: RoomSpec, tx: number, ty: number, center = false): [number, number] {
  const c = center ? 0.5 : 0;
  return [spec.origin.x + (tx + c - (ty + c)) * TILE, spec.origin.y + ((tx + c + ty + c) * TILE) / 2];
}

/** Inverse of tileScreen for a floor point. */
export function screenToTile(spec: RoomSpec, sx: number, sy: number): { tx: number; ty: number } {
  const a = (sx - spec.origin.x) / TILE;
  const b = (sy - spec.origin.y) / (TILE / 2);
  return { tx: Math.floor((a + b) / 2), ty: Math.floor((b - a) / 2) };
}

// ---------- layout ----------

export interface Placement {
  id: string;
  tx: number;
  ty: number;
  w: number;
  d: number;
  /** Flat things (rugs, mess) always draw under people. */
  flat?: boolean;
}

const P = (id: string, tx: number, ty: number, w = 1, d = 1, flat = false): Placement => ({ id, tx, ty, w, d, flat });

export const FIXED: Placement[] = [P("bed", 0, 5, 3, 2), P("fridge", 2, 0), P("counter", 3, 0, 2, 1)];

export const RUG_SLOT = P("rug", 5, 3, 1, 2, true);

/** Floor items by catalog id. Car moves with the room size. */
export function itemSlot(id: string, tier: RoomTier): Placement | null {
  switch (id) {
    case "plant": return P(id, 0, 0);
    case "bookshelf": return P(id, 1, 0);
    case "coffee": return P(id, 5, 0);
    case "tasbihshelf": return P(id, 6, 0);
    case "lamp": return P(id, 7, 0);
    case "dumbbells": return P(id, 7, 1);
    case "monstera": return P(id, 7, 2);
    case "aquarium": return P(id, 7, 3);
    case "tv": return P(id, 0, 2);
    case "sofa": return P(id, 2, 2, 1, 2);
    case "rehal": return P(id, 5, 2);
    case "lantern": return P(id, 6, 2);
    case "mabkhara": return P(id, 4, 3);
    case "arcade": return P(id, 0, 4);
    case "beanbag": return P(id, 6, 5);
    case "desk": return P(id, 8, 0, 2, 1);
    case "chair": return P(id, 9, 1);
    case "treadmill": return P(id, 0, 8, 1, 2);
    case "piano": return P(id, 8, 5, 2, 1);
    case "trophycase": return P(id, 0, 10);
    case "ioniq5":
      return tier === "penthouse" ? P(id, 7, 9, 3, 2) : tier === "apartment" ? P(id, 5, 7, 3, 2) : P(id, 4, 6, 3, 2);
    default: return null;
  }
}

export const MESS: Placement[] = [P("pizza", 3, 4, 1, 1, true), P("clothes", 1, 3, 1, 1, true), P("can", 4, 5, 1, 1, true)];

/** Where the avatar stands for each kind of action. */
export const SPOTS = {
  wake: { tx: 3, ty: 5 },
  pray: { tx: 5, ty: 3 },
  diet: { tx: 3, ty: 1 },
  center: { tx: 4, ty: 4 },
  sad: { tx: 3, ty: 3 },
} as const;

// ---------- palettes ----------

export const PAINTS: Record<string, string> = {
  "paint-white": "#eceef0",
  "paint-teal": "#2d5f5e",
  "paint-gold": "#b5a47c",
};

const RUGS: Record<string, { border: string; field: string; accent: string; mihrab: string }> = {
  "rug-green": { border: "#c9a227", field: "#1f6b45", accent: "#9c2f2f", mihrab: "#2f8a5c" },
  "rug-red": { border: "#e2c28a", field: "#9e1f2a", accent: "#1d3557", mihrab: "#c0392b" },
  "rug-blue": { border: "#f2f2f2", field: "#1f5a96", accent: "#2bb3a3", mihrab: "#3f7cc0" },
  "rug-gold": { border: "#7a1f2b", field: "#c99a2e", accent: "#5b2a86", mihrab: "#e8c25a" },
};

// ---------- pieces ----------

const WOOD = "#8a5a33";

function octagon(cx: number, cz: number, r: number, plane: (u: number, z: number) => P3): P3[] {
  const k = r * 0.41;
  return ([[k, r], [r, k], [r, -k], [k, -r], [-k, -r], [-r, -k], [-r, k], [-k, r]] as const).map(([du, dz]) => plane(cx + du, cz + dz));
}

function drawIoniq(i: Iso, paint: string) {
  const clad = "#26272b";
  const glassSide = "#25313e";
  const glassFront = "#46627a";
  const roof = "#121820";
  const wheelBack = (x: number) => i.box(x, 5, 0, 9, 3, 9, "#18181a");
  wheelBack(8);
  wheelBack(34);
  // lower cladding and the flat-sided body
  i.box(1, 6, 2, 46, 20, 4, clad);
  i.box(1, 6, 6, 46, 20, 7, paint);
  // short clamshell hood, slightly raised
  i.box(31, 6, 13, 16, 20, 1, paint);
  // rear hatch shoulder
  i.box(1, 7, 13, 5, 18, 2, paint);
  // greenhouse: side glass, raked windshield, black panoramic roof
  i.quad([[5, 24, 13], [31, 24, 13], [25, 24, 19], [7, 24, 19]], glassSide, roof);
  i.quad([[25, 8, 19], [31, 7, 13], [31, 25, 13], [25, 24, 19]], glassFront, roof);
  i.quad([[7, 8, 19], [25, 8, 19], [25, 24, 19], [7, 24, 19]], roof, "#0b0f14");
  i.line([7, 24, 19], [25, 24, 19], shade(paint, 0.2));
  i.line([17, 24, 13], [17, 24, 19], roof);
  // signature diagonal door crease
  i.line([36, 26, 7], [14, 26, 11], shade(paint, -0.2));
  // flush handles, mirror
  i.line([20, 26, 11], [23, 26, 11], shade(paint, -0.45));
  i.line([30, 26, 11], [33, 26, 11], shade(paint, -0.45));
  i.box(29, 26, 12, 3, 2, 2, "#1d1d1d");
  // rear pixel taillight wrapping the corner
  i.quad([[1, 26, 10], [4, 26, 10], [4, 26, 12], [1, 26, 12]], "#d4202c");
  // front: black band with parametric pixel lights
  i.quad([[47, 7, 9], [47, 25, 9], [47, 25, 12], [47, 7, 12]], "#1b1c1f");
  for (const y0 of [8, 20])
    for (let y = y0; y < y0 + 4; y += 2)
      for (let z = 9.5; z < 12; z += 2) {
        const [sx, sy] = i.proj([47, y, z]);
        i.r.set(sx, sy, "#eaf6ff");
      }
  i.quad([[47, 7, 2], [47, 25, 2], [47, 25, 5], [47, 7, 5]], clad);
  // near-side wheels with arches and aero rims
  for (const cx of [12.5, 38]) {
    const plane = (u: number, z: number): P3 => [u, 26.5, z];
    i.quad(octagon(cx, 5, 5.8, plane), clad);
    i.quad(octagon(cx, 4.6, 4.6, plane), "#141416");
    i.quad(octagon(cx, 4.6, 3.1, plane), "#a3a9b0");
    i.quad(octagon(cx, 4.6, 1.6, plane), "#5d6268");
    const [hx, hy] = i.proj(plane(cx, 4.6));
    i.r.set(hx, hy, "#d9dde1");
  }
}

const DRAW: Record<string, (i: Iso, variant?: string) => void> = {
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
  rug(i, variant = "rug-green") {
    const c = RUGS[variant] ?? RUGS["rug-green"];
    i.box(1, 1, 0, 14, 30, 0, c.border, { top: c.border });
    i.box(3, 3, 0, 10, 26, 0, c.field, { top: c.field, noOutline: true });
    i.quad([[5, 4, 0], [11, 4, 0], [11, 9, 0], [5, 9, 0]], c.mihrab);
    i.quad([[7, 5, 0], [9, 5, 0], [9, 7, 0], [7, 7, 0]], c.border);
    for (let y = 13; y < 27; y += 4) i.quad([[6, y, 0], [10, y, 0], [10, y + 2, 0], [6, y + 2, 0]], c.accent);
  },
  plant(i) {
    i.box(4, 4, 0, 8, 8, 8, "#b5623a");
    i.box(3, 3, 8, 10, 10, 6, "#3f9a4a");
    i.box(5, 5, 14, 6, 6, 6, "#4fb45a");
    i.box(6, 6, 20, 4, 4, 4, "#62c96b");
  },
  monstera(i) {
    i.box(4, 4, 0, 9, 9, 10, "#e8e2d4");
    i.box(7, 7, 10, 2, 2, 14, "#2e6b34");
    i.box(1, 5, 18, 8, 5, 2, "#2f8a3e");
    i.box(8, 2, 22, 6, 8, 2, "#3aa34b");
    i.box(4, 9, 26, 7, 6, 2, "#2f8a3e");
    i.box(6, 4, 30, 6, 6, 2, "#46b857");
    i.box(10, 9, 15, 5, 5, 2, "#3aa34b");
  },
  lamp(i) {
    i.box(5, 5, 0, 6, 6, 2, "#333333");
    i.box(7, 7, 2, 2, 2, 26, "#5a5a5a");
    i.box(3, 3, 28, 10, 10, 8, "#f4d58a");
  },
  coffee(i) {
    i.box(1, 2, 0, 14, 12, 14, "#6b4a33", { top: "#2b2b2e" });
    i.box(3, 4, 14, 8, 7, 10, "#2b2b2e");
    i.box(4, 9, 15, 5, 3, 3, "#111111");
    i.box(11, 8, 14, 3, 3, 3, "#ffffff");
    const [sx, sy] = i.proj([11, 6, 21]);
    i.r.set(sx, sy, "#ff4040");
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
  beanbag(i) {
    i.box(2, 2, 0, 12, 12, 5, "#e67e22");
    i.box(3, 3, 5, 10, 10, 3, "#e67e22");
    i.box(4, 4, 8, 6, 8, 3, "#f0904a");
  },
  dumbbells(i) {
    i.box(2, 2, 0, 2, 2, 10, "#2b2b2e");
    i.box(12, 2, 0, 2, 2, 10, "#2b2b2e");
    i.box(2, 10, 0, 2, 2, 10, "#2b2b2e");
    i.box(12, 10, 0, 2, 2, 10, "#2b2b2e");
    i.box(1, 1, 10, 14, 13, 2, "#3a3a3e");
    for (let k = 0; k < 3; k++) {
      i.box(3 + k * 4, 3, 12, 3, 3, 3, k === 2 ? "#c0392b" : "#555559");
      i.box(3 + k * 4, 9, 12, 3, 3, 3, k === 2 ? "#c0392b" : "#555559");
      i.box(4 + k * 4, 6, 13, 1, 3, 1, "#9a9aa0");
    }
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
    i.box(4, 9, 14, 1, 1, 6, "#2f8a3e", { noOutline: true });
    i.box(10, 13, 14, 1, 1, 8, "#2f8a3e", { noOutline: true });
  },
  arcade(i) {
    i.box(1, 1, 0, 14, 14, 40, "#5b2a86");
    i.quad([[15, 3, 22], [15, 13, 22], [15, 13, 34], [15, 3, 34]], "#1c1c3a");
    i.quad([[15, 5, 26], [15, 8, 26], [15, 8, 29], [15, 5, 29]], "#4dff88");
    i.quad([[15, 9, 30], [15, 11, 30], [15, 11, 32], [15, 9, 32]], "#ff4d6d");
    i.box(1, 1, 40, 14, 14, 4, "#f1c40f");
    i.box(13, 3, 17, 4, 10, 2, "#2b2b2b");
  },
  desk(i) {
    for (const [x, y] of [[1, 2], [28, 2], [1, 12], [28, 12]]) i.box(x, y, 0, 2, 2, 12, "#9a9aa0");
    i.box(0, 1, 12, 31, 14, 2, "#e8e4da");
    i.box(10, 3, 14, 12, 2, 1, "#1d1d21");
    i.box(15, 3, 15, 2, 2, 3, "#1d1d21");
    i.box(8, 3, 18, 16, 2, 10, "#1d1d21");
    i.quad([[9, 5, 19], [23, 5, 19], [23, 5, 27], [9, 5, 27]], "#3a8ee6");
    i.box(10, 9, 14, 11, 3, 1, "#2b2b2e");
    i.box(23, 9, 14, 3, 3, 1, "#2b2b2e");
    i.box(26, 2, 14, 4, 9, 12, "#222226");
    const [sx, sy] = i.proj([30, 6, 22]);
    i.r.set(sx, sy, "#ff3df2");
    i.r.set(sx, sy + 2, "#3dfff2");
  },
  chair(i) {
    i.box(6, 6, 0, 4, 4, 1, "#1d1d1d");
    i.box(7, 7, 1, 2, 2, 6, "#3a3a3a");
    i.box(2, 2, 7, 12, 11, 3, "#c0392b");
    i.box(2, 12, 10, 12, 3, 18, "#c0392b");
    i.box(6, 12, 12, 4, 3, 14, "#1d1d1d", { noOutline: true });
    i.box(1, 3, 10, 2, 8, 4, "#1d1d1d");
    i.box(13, 3, 10, 2, 8, 4, "#1d1d1d");
  },
  treadmill(i) {
    i.box(1, 3, 0, 14, 28, 4, "#2b2b2e", { top: "#3a3a3f" });
    i.box(3, 5, 4, 10, 24, 0.01, "#1a1a1d", { noOutline: true });
    i.box(2, 2, 4, 2, 2, 20, "#55555a");
    i.box(12, 2, 4, 2, 2, 20, "#55555a");
    i.box(1, 1, 22, 14, 4, 5, "#2b2b2e");
    const [sx, sy] = i.proj([8, 5, 25]);
    i.r.rect(sx - 1, sy, 3, 1, "#4dff88");
  },
  piano(i) {
    i.box(0, 1, 0, 30, 9, 28, "#151517", { top: "#26262a" });
    i.box(1, 10, 12, 28, 5, 2, "#f4f4f4", { outline: "#555555" });
    for (let x = 3; x < 29; x += 2.5) {
      if (Math.round(x * 2) % 5 === 1) continue;
      i.box(x, 10, 14, 1, 3, 0.8, "#111111", { noOutline: true });
    }
    i.box(1, 10, 0, 2, 4, 12, "#151517");
    i.box(27, 10, 0, 2, 4, 12, "#151517");
    i.box(10, 8, 20, 9, 2, 6, "#f2ecd9");
  },
  trophycase(i) {
    i.box(1, 1, 0, 14, 12, 4, "#4a2f1c");
    for (const z of [4, 18, 32]) {
      i.box(2, 2, z, 12, 10, 1, "#4a2f1c", { noOutline: true });
      i.box(4, 5, z + 1, 3, 3, 6, "#e0b33a");
      i.box(9, 6, z + 1, 2, 2, 9, "#c9ccd2");
    }
    i.box(1, 1, 4, 14, 12, 42, "#bfe3f240", { top: "#d8f0fa60", left: "#bfe3f230", right: "#9fc9da40", outline: "#4a2f1c" });
  },
  rehal(i) {
    i.box(4, 5, 0, 8, 6, 3, "#7a4b2a");
    i.box(5, 6, 3, 6, 4, 4, "#8a5a33");
    i.quad([[3, 5, 7], [8, 5, 10], [8, 11, 10], [3, 11, 7]], "#f6efd8", "#1f6b45");
    i.quad([[8, 5, 10], [13, 5, 7], [13, 11, 7], [8, 11, 10]], "#efe6c8", "#1f6b45");
    i.line([5, 7, 8], [7, 7, 9], "#6b5a3a");
    i.line([9, 7, 9], [11, 7, 8], "#6b5a3a");
  },
  lantern(i) {
    i.box(6, 6, 0, 4, 4, 2, "#b8860b");
    i.box(5, 5, 2, 6, 6, 10, "#f5c542", { top: "#ffe08a" });
    i.line([8, 11, 2], [8, 11, 12], "#8a6508");
    i.box(6, 6, 12, 4, 4, 3, "#b8860b");
    i.box(7.5, 7.5, 15, 1, 1, 3, "#b8860b", { noOutline: true });
  },
  mabkhara(i) {
    i.box(5, 5, 0, 6, 6, 2, "#8a6508");
    i.box(6, 6, 2, 4, 4, 5, "#d4af37");
    i.box(5, 5, 7, 6, 6, 2, "#b8860b");
  },
  tasbihshelf(i) {
    i.box(1, 2, 0, 14, 11, 10, "#7a4b2a");
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const [sx, sy] = i.proj([7 + Math.cos(a) * 3.5, 7 + Math.sin(a) * 3.5, 10]);
      i.r.set(sx, sy, "#2f8a5c");
    }
    i.box(11, 4, 10, 2, 2, 5, "#a0522d");
    i.box(11.5, 4.5, 15, 1, 1, 2, "#d4af37", { noOutline: true });
  },
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
  ioniq5(i, variant = "paint-white") {
    drawIoniq(i, PAINTS[variant] ?? PAINTS["paint-white"]);
  },
};

/** Piece ids may carry a variant: "rug:rug-red", "ioniq5:paint-teal". */
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

const WALLPAPERS: Record<string, { left: Pattern; right: Pattern; base: string }> = {
  "wp-sky": { base: "#a9c6dc", left: () => "#b9d3e6", right: () => "#9dbbd2" },
  "wp-sand": { base: "#d9bf8f", left: () => "#e8d3a8", right: () => "#d6bd8e" },
  "wp-sage": { base: "#a6b996", left: () => "#bccdaf", right: () => "#a6b996" },
  "wp-navy": { base: "#26304c", left: () => "#34405f", right: () => "#29334f" },
  "wp-brick": { base: "#9a4f3a", left: (u, z) => brick(u, z, 0), right: (u, z) => brick(u, z, -0.12) },
  "wp-wood": { base: "#6b4729", left: (u) => slat(u, 0), right: (u) => slat(u, -0.12) },
  "wp-zellige": { base: "#e9e3d3", left: (u, z) => zellige(u, z, 0), right: (u, z) => zellige(u, z, -0.1) },
};

function brick(u: number, z: number, f: number) {
  const row = Math.floor(z / 4);
  const off = row % 2 ? 4 : 0;
  const col = Math.floor((u + off) / 8);
  if (z % 4 < 0.6 || (u + off) % 8 < 0.6) return shade("#cbb9a6", f);
  const v = hash2(col, row);
  return shade(v < 0.33 ? "#a5533c" : v < 0.66 ? "#b4613f" : "#94472f", f);
}

function slat(u: number, f: number) {
  const k = Math.floor(u / 5);
  if (u % 5 < 0.6) return shade("#3e2716", f);
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
    at: (x, y) => (x % 16 < 0.6 || y % 16 < 0.6 ? "#b9a277" : (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? "#d8c39c" : "#cfb98f"),
  },
  "fl-carpet": { slab: "#5d626b", at: (x, y) => (hash2(x * 2, y * 2) < 0.08 ? "#7c818b" : "#8a8f99") },
  "fl-oak": {
    slab: "#7c5530",
    at: (x, y) => {
      const plank = Math.floor(y / 5);
      const seg = Math.floor((x + plank * 11) / 28);
      if (y % 5 < 0.6 || (x + plank * 11) % 28 < 0.6) return "#7c5530";
      const v = hash2(plank, seg);
      return v < 0.33 ? "#c08a55" : v < 0.66 ? "#b37d4b" : "#c9955f";
    },
  },
  "fl-checker": {
    slab: "#333333",
    at: (x, y) => ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? "#1f1f22" : "#efefe9"),
  },
  "fl-marble": {
    slab: "#9a9a96",
    at: (x, y) => {
      if (x % 32 < 0.6 || y % 32 < 0.6) return "#d0d0cc";
      const v = Math.sin(x * 0.21 + y * 0.53 + Math.sin(y * 0.17) * 2.2);
      return Math.abs(v) < 0.05 ? "#b6b6b2" : hash2(x * 2, y * 2) < 0.03 ? "#e0e0dc" : "#f1f1ed";
    },
  },
};

export interface BackgroundInput {
  spec: RoomSpec;
  wallpaper: string;
  floor: string;
  hour: number;
  wallItems: { id: string; locked: boolean }[];
}

function skyColor(hour: number) {
  return hour >= 7 && hour < 18 ? "#8fd3ff" : hour >= 5 && hour < 20 ? "#f2a65a" : "#1d2550";
}

/** Walls, floor, windows (sky follows the clock), the Kaaba picture and wall decor. */
export function buildBackground({ spec, wallpaper, floor, hour, wallItems }: BackgroundInput): Raster {
  const r = new Raster(spec.W, spec.H);
  const iso = new Iso(r, spec.origin.x, spec.origin.y);
  const L = spec.n * TILE;
  const H = spec.wallH;
  const wp = WALLPAPERS[wallpaper] ?? WALLPAPERS["wp-sky"];
  const fl = FLOORS[floor] ?? FLOORS["fl-tile"];

  // wall slabs (gives the caps and outlines), then paint the faces with the pattern
  iso.box(-4, 0, 0, 4, L, H, wp.base, { top: "#e8eef3", outline: "#4f5f6d" });
  iso.box(-4, -4, 0, L + 4, 4, H, wp.base, { top: "#e8eef3", outline: "#4f5f6d" });
  paintPlane(r, iso, (u, z) => [0, u, z], L, H, wp.left);
  paintPlane(r, iso, (u, z) => [u, 0, z], L, H, wp.right);
  iso.line([0, 0, 0], [0, 0, H], "#4f5f6d");
  iso.quad([[0, 0, 0], [0, L, 0], [0, L, 4], [0, 0, 4]], "#7d5a3c");
  iso.quad([[0, 0, 0], [L, 0, 0], [L, 0, 4], [0, 0, 4]], "#6e4f34");

  iso.box(0, 0, -6, L, L, 6, fl.slab, { top: fl.slab, outline: shade(fl.slab, -0.5) });
  for (let x = 0; x < L; x += 0.5)
    for (let y = 0; y < L; y += 0.5) {
      const [sx, sy] = iso.proj([x, y, 0]);
      r.set(sx, sy, fl.at(x, y));
    }

  const sky = skyColor(hour);
  if (spec.tier === "penthouse") drawSkyline(iso, sky, 56, 136, 14, 78);
  else drawWindow(iso, sky, (u, z) => [u, 0, z], 70, 110, 28, 62);
  if (spec.tier !== "studio") drawWindow(iso, sky, (u, z) => [0, u, z], 124, 152, 28, 60);

  // framed Kaaba picture on the left wall
  iso.quad([[0, 40, 32], [0, 66, 32], [0, 66, 58], [0, 40, 58]], "#c9a227", "#7a5f12");
  iso.quad([[0, 42, 34], [0, 64, 34], [0, 64, 56], [0, 42, 56]], "#2b3a55");
  iso.quad([[0, 46, 36], [0, 60, 36], [0, 60, 48], [0, 46, 48]], "#111111");
  iso.quad([[0, 46, 45], [0, 60, 45], [0, 60, 46], [0, 46, 46]], "#d4af37");

  for (const w of wallItems) drawWallItem(iso, w.id, spec, w.locked);
  return r;
}

function paintPlane(r: Raster, iso: Iso, at: (u: number, z: number) => P3, L: number, H: number, pat: Pattern) {
  for (let u = 0; u < L; u += 0.5)
    for (let z = 0; z < H; z += 0.5) {
      const [sx, sy] = iso.proj(at(u, z));
      r.set(sx, sy, pat(u, z));
    }
}

function drawWindow(iso: Iso, sky: string, at: (u: number, z: number) => P3, u0: number, u1: number, z0: number, z1: number) {
  iso.quad([at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1)], "#f5f5f5", "#7d8a94");
  iso.quad([at(u0 + 2, z0 + 2), at(u1 - 2, z0 + 2), at(u1 - 2, z1 - 2), at(u0 + 2, z1 - 2)], sky);
  if (sky === "#1d2550") {
    iso.quad([at(u1 - 12, z1 - 10), at(u1 - 8, z1 - 10), at(u1 - 8, z1 - 6), at(u1 - 12, z1 - 6)], "#f5f0c8");
    for (const [du, dz] of [[6, 4], [14, 12], [24, 20], [10, 22]]) {
      const [px, py] = iso.proj(at(u0 + du, z1 - dz));
      iso.r.set(px, py, "#ffffff");
    }
  } else iso.quad([at(u0 + 6, z1 - 10), at(u0 + 10, z1 - 10), at(u0 + 10, z1 - 6), at(u0 + 6, z1 - 6)], "#fff3a6");
  const mid = (u0 + u1) / 2;
  iso.line(at(mid, z0 + 2), at(mid, z1 - 2), "#f5f5f5");
  iso.line(at(u0 + 2, (z0 + z1) / 2), at(u1 - 2, (z0 + z1) / 2), "#f5f5f5");
}

/** Floor-to-ceiling glass with a city skyline. */
function drawSkyline(iso: Iso, sky: string, u0: number, u1: number, z0: number, z1: number) {
  const at = (u: number, z: number): P3 => [u, 0, z];
  const night = sky === "#1d2550";
  iso.quad([at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1)], "#2b2f36");
  iso.quad([at(u0 + 2, z0 + 2), at(u1 - 2, z0 + 2), at(u1 - 2, z1 - 2), at(u0 + 2, z1 - 2)], sky);
  let u = u0 + 2;
  let k = 0;
  while (u < u1 - 2) {
    const w = 6 + Math.floor(hash2(k, 7) * 8);
    const h = 12 + Math.floor(hash2(k, 3) * 34);
    const u2 = Math.min(u1 - 2, u + w);
    const body = night ? (k % 2 ? "#1a1f33" : "#232a44") : k % 2 ? "#7d8ba3" : "#93a2ba";
    iso.quad([at(u, z0 + 2), at(u2, z0 + 2), at(u2, z0 + 2 + h), at(u, z0 + 2 + h)], body);
    for (let wu = u + 1.5; wu < u2 - 1; wu += 2.5)
      for (let wz = z0 + 5; wz < z0 + h; wz += 3) {
        if (hash2(wu * 3, wz * 5) < (night ? 0.45 : 0.25)) {
          const [px, py] = iso.proj(at(wu, wz));
          iso.r.set(px, py, night ? "#ffd86b" : "#c9d6e8");
        }
      }
    u = u2 + 1;
    k++;
  }
  for (const m of [u0 + (u1 - u0) / 3, u0 + (2 * (u1 - u0)) / 3]) iso.line(at(m, z0), at(m, z1), "#2b2f36");
}

/** Wall decor positions depend on the room size (bigger rooms have longer walls). */
function drawWallItem(iso: Iso, id: string, spec: RoomSpec, locked: boolean) {
  const R = (u: number, z: number): P3 => [u, 0, z];
  const Lw = (u: number, z: number): P3 => [0, u, z];
  const g = (c: string) => (locked ? greyOf(c) : c);
  const pent = spec.tier === "penthouse";
  switch (id) {
    case "clock": {
      const cu = pent ? 42 : 46;
      iso.quad(octagon(cu, 56, 6.5, R), g("#f5f5f5"), g("#333333"));
      iso.line(R(cu, 56), R(cu, 60), g("#222222"));
      iso.line(R(cu, 56), R(cu + 3, 56), g("#c0392b"));
      break;
    }
    case "shelf": {
      const u = pent ? 140 : 114;
      iso.box(u, 0, 44, 14, 5, 2, g("#7a4b2a"));
      iso.box(u + 2, 1, 46, 3, 3, 5, g("#e0b33a"));
      iso.box(u + 7, 1, 46, 2, 2, 7, g("#c9ccd2"));
      iso.box(u + 10, 1, 46, 3, 3, 4, g("#cd7f32"));
      break;
    }
    case "neon": {
      if (spec.tier === "studio") break;
      const u0 = pent ? 160 : 132;
      iso.quad([R(u0, 38), R(u0 + 26, 38), R(u0 + 26, 56), R(u0, 56)], g("#1b1b24"), g("#0d0d12"));
      neonText(iso, R, u0 + 3, 53, "DISCI", g("#ff4fc3"));
      neonText(iso, R, u0 + 3, 46, "PLINE", g("#ff4fc3"));
      break;
    }
    case "madinah": {
      iso.quad([Lw(10, 30), Lw(32, 30), Lw(32, 58), Lw(10, 58)], g("#f5f5f5"), g("#555555"));
      iso.quad([Lw(12, 32), Lw(30, 32), Lw(30, 56), Lw(12, 56)], g("#9fd0ef"));
      iso.quad([Lw(12, 32), Lw(30, 32), Lw(30, 40), Lw(12, 40)], g("#e9dfc9"));
      iso.quad(octagon(21, 44, 4.5, Lw).slice(0, 5).concat([Lw(16.5, 40), Lw(25.5, 40)]), g("#2e9e57"));
      iso.quad([Lw(26, 40), Lw(28, 40), Lw(28, 54), Lw(26, 54)], g("#e9dfc9"));
      iso.line(Lw(21, 48), Lw(21, 51), g("#d4af37"));
      break;
    }
    case "calligraphy": {
      iso.quad([Lw(82, 34), Lw(110, 34), Lw(110, 54), Lw(82, 54)], g("#c9a227"), g("#7a5f12"));
      iso.quad([Lw(84, 36), Lw(108, 36), Lw(108, 52), Lw(84, 52)], g("#123d2b"));
      const stroke = g("#e8c25a");
      iso.line(Lw(86, 42), Lw(105, 42), stroke);
      iso.line(Lw(88, 42), Lw(88, 48), stroke);
      iso.line(Lw(93, 42), Lw(93, 46), stroke);
      iso.line(Lw(97, 42), Lw(97, 49), stroke);
      iso.line(Lw(101, 42), Lw(103, 47), stroke);
      iso.line(Lw(90, 39), Lw(99, 39), stroke);
      break;
    }
  }
}

function greyOf(c: string) {
  const v = parseInt(c.slice(1, 3), 16) * 0.3 + parseInt(c.slice(3, 5), 16) * 0.59 + parseInt(c.slice(5, 7), 16) * 0.11;
  const h = Math.round(v * 0.55).toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

const FONT: Record<string, string[]> = {
  D: ["110", "101", "101", "101", "110"], I: ["111", "010", "010", "010", "111"], S: ["011", "100", "010", "001", "110"],
  C: ["011", "100", "100", "100", "011"], P: ["110", "101", "110", "100", "100"], L: ["100", "100", "100", "100", "111"],
  N: ["101", "111", "111", "101", "101"], E: ["111", "100", "110", "100", "111"],
};

function neonText(iso: Iso, at: (u: number, z: number) => P3, u0: number, zTop: number, text: string, color: string) {
  [...text].forEach((ch, k) => {
    const glyph = FONT[ch];
    if (!glyph) return;
    glyph.forEach((row, ry) =>
      [...row].forEach((bit, rx) => {
        if (bit !== "1") return;
        const [px, py] = iso.proj(at(u0 + k * 4 + rx, zTop - ry));
        iso.r.set(px, py, color);
      }),
    );
  });
}

// ---------- walking ----------

/** Tiles the avatar can't walk through. */
export function blockedTiles(placements: Placement[]): Set<string> {
  const set = new Set<string>();
  for (const p of placements) {
    if (p.flat) continue;
    for (let x = p.tx; x < p.tx + p.w; x++) for (let y = p.ty; y < p.ty + p.d; y++) set.add(`${x},${y}`);
  }
  return set;
}

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

export const WALL_ITEMS = ["clock", "shelf", "neon", "madinah", "calligraphy"];

/** Catalog thumbnail for a wall item, cropped to the item itself. */
export function wallItemPreview(id: string): Sprite {
  return makeSprite((iso) => drawWallItem(iso, id, roomSpec("apartment"), false), 420, 210, 230);
}

/** A tiny room corner showing a wallpaper, floor or room size. */
export function stylePreview(opts: { wallpaper?: string; floor?: string; size?: number }): Sprite {
  const L = opts.size ?? 40;
  const H = 30;
  return makeSprite((iso) => {
    const wp = WALLPAPERS[opts.wallpaper ?? "wp-sky"] ?? WALLPAPERS["wp-sky"];
    const fl = FLOORS[opts.floor ?? "fl-tile"] ?? FLOORS["fl-tile"];
    iso.box(-2, 0, 0, 2, L, H, wp.base, { top: "#e8eef3", outline: "#4f5f6d" });
    iso.box(-2, -2, 0, L + 2, 2, H, wp.base, { top: "#e8eef3", outline: "#4f5f6d" });
    paintPlane(iso.r, iso, (u, z) => [0, u, z], L, H, wp.left);
    paintPlane(iso.r, iso, (u, z) => [u, 0, z], L, H, wp.right);
    iso.box(0, 0, -3, L, L, 3, fl.slab, { top: fl.slab, outline: shade(fl.slab, -0.5) });
    for (let x = 0; x < L; x += 0.5)
      for (let y = 0; y < L; y += 0.5) {
        const [sx, sy] = iso.proj([x, y, 0]);
        iso.r.set(sx, sy, fl.at(x, y));
      }
  }, 260, 130, 90);
}
