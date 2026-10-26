import { ROOM_SIZE, type RoomTier } from "@/engine/catalog";
import { reservedOnWalls } from "@/engine/wall";
import { Iso, TILE, makeSprite, prism, type P3, type Sprite } from "./iso";
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
  const n = ROOM_SIZE[tier];
  const wallH = tier === "studio" || tier === "apartment" ? 72 : tier === "penthouse" ? 88 : 96;
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

export const MESS: { id: string; tx: number; ty: number }[] = [
  { id: "pizza", tx: 3, ty: 4 },
  { id: "clothes", tx: 1, ty: 3 },
  { id: "can", tx: 4, ty: 5 },
];

const RUGS: Record<string, { border: string; field: string; accent: string; mihrab: string }> = {
  "rug-green": { border: "#c9a227", field: "#1f6b45", accent: "#9c2f2f", mihrab: "#2f8a5c" },
  "rug-red": { border: "#e2c28a", field: "#9e1f2a", accent: "#1d3557", mihrab: "#c0392b" },
  "rug-blue": { border: "#f2f2f2", field: "#1f5a96", accent: "#2bb3a3", mihrab: "#3f7cc0" },
  "rug-gold": { border: "#7a1f2b", field: "#c99a2e", accent: "#5b2a86", mihrab: "#e8c25a" },
};

const WOOD = "#8a5a33";

function octagon(cx: number, cz: number, r: number, plane: (u: number, z: number) => P3): P3[] {
  const k = r * 0.41;
  return ([[k, r], [r, k], [r, -k], [k, -r], [-k, -r], [-r, -k], [-r, k], [-k, r]] as const).map(([du, dz]) => plane(cx + du, cz + dz));
}

function px(i: Iso, p: P3, c: string) {
  const [x, y] = i.proj(p);
  i.r.set(x, y, c);
}

/** Kitchen set: French-door fridge, base cabinets with sink, stove. Variants: "wall" adds upper cabinets, "open" opens the fridge. */
function drawKitchen(i: Iso, variant = "") {
  const wall = variant.includes("wall");
  const open = variant.includes("open");
  const steel = "#d9dee3";
  // fridge first (it's furthest back): stainless, French doors, two handles, freezer drawer
  i.box(1, 1, 0, 14, 14, 40, steel, { left: "#e3e7eb", right: "#b9bfc5" });
  i.line([1, 15, 13], [15, 15, 13], "#8d949b");
  i.line([4, 15, 11], [12, 15, 11], "#6f767d");
  i.line([7, 15, 22], [7, 15, 33], "#5d646b");
  if (!open) {
    i.line([8, 15, 13], [8, 15, 40], "#8d949b");
    i.line([9, 15, 22], [9, 15, 33], "#5d646b");
  } else {
    // right door open: lit shelves with food inside
    i.quad([[8, 15, 13.5], [15, 15, 13.5], [15, 15, 39.5], [8, 15, 39.5]], "#f6fbff", "#8d949b");
    for (const z of [20, 27, 34]) i.line([8, 15, z], [15, 15, z], "#c9d6e2");
    i.box(9, 13, 14, 2, 2, 4, "#e74c3c", { noOutline: true });
    i.box(12, 13, 21, 2, 2, 3, "#f1c40f", { noOutline: true });
    i.box(9.5, 13, 28, 3, 2, 3, "#27ae60", { noOutline: true });
    i.box(12, 13, 35, 2, 2, 4, "#ffffff", { noOutline: true });
  }
  // upper cabinets and hood (only against a wall), starting where the fridge ends
  if (wall) {
    i.box(16, 0, 34, 32, 7, 13, "#f4f1ea");
    for (const x of [24, 32, 40]) i.line([x, 7, 35], [x, 7, 46], "#c9c3b5");
    i.box(34, 0, 27, 12, 8, 4, "#9aa0a6");
  }
  // base cabinets, dark stone top, sink
  i.box(15, 1, 0, 18, 14, 14, "#f4f1ea", { top: "#3a3a3f" });
  i.line([24, 15, 1], [24, 15, 12], "#c9c3b5");
  for (const x of [20, 28]) i.line([x, 15, 8], [x, 15, 10], "#7d7468");
  i.quad([[18, 4, 14.05], [28, 4, 14.05], [28, 11, 14.05], [18, 11, 14.05]], "#aab3bb", "#6f7881");
  i.box(22, 2, 14, 2, 2, 5, "#b8bec5");
  i.box(22, 2, 18, 2, 4, 1, "#b8bec5", { noOutline: true });
  // stove with glass top, four burners, oven window
  i.box(33, 1, 0, 15, 14, 14, "#2b2b2e", { top: "#1a1a1d" });
  for (const [x, y] of [[37, 4.5], [44, 4.5], [37, 10.5], [44, 10.5]])
    i.quad(octagon(x, y, 2.2, (u, v) => [u, v, 14.05]), "#26262a", "#5a5a60");
  i.quad([[35, 15, 3], [46, 15, 3], [46, 15, 10], [35, 15, 10]], "#121214", "#55555a");
  i.line([36, 15, 11.5], [45, 15, 11.5], "#b8bec5");
  // the open fridge door swings out toward you, in front of everything
  if (open) {
    i.quad([[15, 15, 13.5], [15, 26, 13.5], [15, 26, 39.5], [15, 15, 39.5]], "#cfd5db", "#8d949b");
    i.line([15, 24, 22], [15, 24, 33], "#5d646b");
  }
}

/** Arcade cabinet from a real side profile: marquee, slanted screen, control deck, kick plate. Front faces +X. */
function drawArcade(i: Iso) {
  const body = "#3b1f66";
  prism(i, [[1, 0], [1, 46], [14, 46], [14, 38], [10, 36], [9, 25], [15, 22], [15, 19], [12, 18], [12, 0]], 2, 14, body, {
    side: "#4b2a80", top: "#2a1650", front: "#2a1650", slope: "#22123f", outline: "#140a26",
  });
  const s = (x: number, z: number): P3 => [x, 14, z];
  // side art stripes
  i.quad([s(2, 4), s(11, 4), s(11, 8), s(2, 8)], "#ff4fc3");
  i.quad([s(2, 9), s(11, 9), s(11, 11), s(2, 11)], "#4de0ff");
  // lit marquee
  i.quad([[14, 2, 38.5], [14, 14, 38.5], [14, 14, 45.5], [14, 2, 45.5]], "#ffd23f", "#8a6a00");
  for (let y = 4; y < 13; y += 2) px(i, [14, y, 42], "#c0392b");
  // screen in its bezel, on the slanted face
  i.quad([[10, 3.5, 35.5], [10, 12.5, 35.5], [9.2, 12.5, 26], [9.2, 3.5, 26]], "#0b0d1a", "#000000");
  i.quad([[9.9, 4.5, 34], [9.9, 11.5, 34], [9.3, 11.5, 27.5], [9.3, 4.5, 27.5]], "#1c2a6b");
  // control deck: joystick + buttons
  i.box(11, 4, 22.3, 1, 1, 3, "#111111", { noOutline: true });
  px(i, [11.5, 4.5, 26], "#e74c3c");
  px(i, [12.5, 4.5, 26], "#e74c3c");
  for (const [x, y, c] of [[12, 8, "#f1c40f"], [13.5, 8, "#2ecc71"], [12, 10.5, "#3498db"], [13.5, 10.5, "#e74c3c"]] as const) px(i, [x, y, 22.5], c);
  // coin door
  i.quad([[12, 6, 6], [12, 10, 6], [12, 10, 12], [12, 6, 12]], "#1b0f33", "#c9a227");
  px(i, [12, 8, 10], "#ff4040");
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
  kitchen: drawKitchen,
  prayerrug(i, variant = "rug-green") {
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
    px(i, [11, 6, 21], "#ff4040");
  },
  bookshelf(i) {
    i.box(1, 0, 0, 14, 12, 44, "#7a4b2a");
    const cols = ["#c0392b", "#2e86c1", "#f1c40f", "#27ae60", "#8e44ad", "#e67e22"];
    [4, 17, 30].forEach((z, row) => {
      i.box(1, 12, z - 1, 14, 1, 1, "#5e391f", { noOutline: true });
      for (let b = 0; b < 5; b++) i.box(2 + b * 2.6, 9, z, 2, 3, 8 + ((b + row) % 3), cols[(b + row) % cols.length]);
    });
  },
  /** Low walnut console with a thin 65" panel, screen facing +X. */
  tv(i) {
    i.box(1, 1, 0, 13, 30, 8, "#3b2a20", { top: "#4a3528" });
    i.line([14, 11, 1], [14, 11, 7], "#22170f");
    i.line([14, 21, 1], [14, 21, 7], "#22170f");
    i.box(5, 13, 8, 3, 6, 2, "#1d1d20");
    i.box(5, 0, 10, 2.5, 32, 21, "#141416", { top: "#1d1d20" });
    i.quad([[7.5, 1, 11], [7.5, 31, 11], [7.5, 31, 30], [7.5, 1, 30]], "#0c1018", "#000000");
    i.line([7.5, 6, 29], [7.5, 18, 13], "#1c2433");
    i.line([7.5, 9, 29], [7.5, 21, 13], "#161d29");
    px(i, [8, 28, 11.5], "#ff3b3b");
  },
  sofa(i) {
    i.box(0, 0, 0, 14, 32, 8, "#c0392b");
    i.box(0, 0, 8, 10, 3, 6, "#c0392b");
    i.box(0, 29, 8, 10, 3, 6, "#c0392b");
    i.box(10, 0, 8, 4, 32, 11, "#a93226");
  },
  recordplayer(i) {
    i.box(1, 2, 0, 14, 12, 13, "#8a5a33", { top: "#7a4b2a" });
    const spines = ["#e74c3c", "#2c3e50", "#f1c40f", "#8e44ad", "#16a085", "#ecf0f1"];
    spines.forEach((c, k) => i.box(2.5 + k * 2, 13, 1, 1.6, 1, 10, c, { noOutline: true }));
    i.box(2, 3, 13, 12, 10, 2, "#2b2b2e", { top: "#3a3a3f" });
    i.quad(octagon(7.5, 8, 4.2, (u, v) => [u, v, 15.05]), "#111113", "#000000");
    i.quad(octagon(7.5, 8, 1.3, (u, v) => [u, v, 15.1]), "#d64541");
    i.line([12.5, 4.5, 15.2], [10, 9, 15.2], "#c9ccd2");
    i.box(12, 4, 15, 1.5, 1.5, 1, "#c9ccd2", { noOutline: true });
  },
  aquarium(i) {
    i.box(1, 1, 0, 14, 14, 12, "#4a3a2a");
    i.box(1, 1, 12, 14, 14, 14, "#6cc6e8", { top: "#a8e2f5" });
    i.box(2, 2, 12, 12, 12, 2, "#d9c27a", { noOutline: true });
    i.box(4, 9, 14, 1, 1, 6, "#2f8a3e", { noOutline: true });
    i.box(10, 13, 14, 1, 1, 8, "#2f8a3e", { noOutline: true });
  },
  /** Your clarinet on its stand, with a music stand. */
  clarinet(i) {
    i.box(5, 6, 0, 5, 5, 1, "#2b2b2e");
    i.line([5, 6, 1], [7.5, 8.5, 6], "#55555a");
    i.line([10, 6, 1], [7.5, 8.5, 6], "#55555a");
    i.line([7.5, 11, 1], [7.5, 8.5, 6], "#55555a");
    i.box(6.5, 7.5, 1, 2.2, 2.2, 3, "#121214");
    i.box(7, 8, 4, 1.3, 1.3, 20, "#121214", { top: "#2a2a2e" });
    for (const z of [8, 11, 14, 17, 20]) px(i, [8.3, 9.3, z], "#d8dde2");
    i.box(7.1, 8.1, 24, 1.1, 1.1, 2, "#c9ccd2", { noOutline: true });
    // music stand with a sheet
    i.line([12, 3, 0], [12, 3, 18], "#3a3a3e");
    i.quad([[10.5, 1, 17], [13.5, 1, 22], [13.5, 7, 22], [10.5, 7, 17]], "#f7f4ea", "#7d7468");
    for (let k = 0; k < 3; k++) i.line([11 + k, 2, 18 + k * 1.5], [11 + k, 6, 18 + k * 1.5], "#55555a");
  },
  arcade: drawArcade,
  desk(i) {
    for (const [x, y] of [[1, 2], [28, 2], [1, 12], [28, 12]]) i.box(x, y, 0, 2, 2, 12, "#9aa0a6");
    i.box(0, 1, 12, 31, 14, 2, "#e8e4da");
    i.box(10, 3, 14, 12, 2, 1, "#1d1d21");
    i.box(15, 3, 15, 2, 2, 3, "#1d1d21");
    i.box(8, 3, 18, 16, 2, 10, "#1d1d21");
    i.quad([[9, 5, 19], [23, 5, 19], [23, 5, 27], [9, 5, 27]], "#3a8ee6");
    i.box(10, 9, 14, 11, 3, 1, "#2b2b2e");
    i.box(23, 9, 14, 3, 3, 1, "#2b2b2e");
    i.box(26, 2, 14, 4, 9, 12, "#222226");
    px(i, [30, 6, 22], "#ff3df2");
    px(i, [30, 6, 20], "#3dfff2");
  },
  /** Beige leather desk chair: tufted back, wooden arms, chrome base. Faces -Y (the desk). */
  chair(i) {
    const leather = "#d9c19a";
    for (const [x, y] of [[4, 8], [12, 8], [8, 3], [8, 13]]) i.box(x - 1, y - 1, 0, 2, 2, 1, "#c9ccd2", { noOutline: true });
    i.box(7, 7, 0, 2, 2, 7, "#c9ccd2");
    i.box(2, 2, 7, 12, 11, 4, leather, { top: "#e8d5b2" });
    i.box(2, 12, 9, 12, 3, 18, leather, { top: "#e8d5b2" });
    for (const [x, z] of [[5, 15], [9, 15], [5, 21], [9, 21], [7, 18], [11, 18]]) {
      const [sx, sy] = i.proj([x, 15, z]);
      i.r.set(sx, sy, "#a88b5e");
    }
    i.box(1, 3, 11, 2, 9, 2, "#7a4b2a");
    i.box(13, 3, 11, 2, 9, 2, "#7a4b2a");
    i.box(1.5, 10, 7, 1, 1, 4, "#7a4b2a", { noOutline: true });
    i.box(13.5, 10, 7, 1, 1, 4, "#7a4b2a", { noOutline: true });
  },
  /** Flat bench with a rack and a loaded barbell. Long side along Y. */
  /** Rack at the back, bench clearly in front of it: no overlap. Long side along Y. */
  gymbench(i) {
    // rack: two posts on feet, barbell resting on the hooks, plates on the bar ends
    for (const x of [1, 13]) {
      i.box(x - 1, 0, 0, 4, 5, 1.5, "#3a3a3e");
      i.box(x, 1.5, 1.5, 2, 2, 22, "#55555a");
    }
    i.line([-4, 2.5, 22], [20, 2.5, 22], "#c9ccd2");
    for (const x of [-2.5, 18.5]) {
      const plane = (u: number, z: number): P3 => [x, u, z];
      i.quad(octagon(2.5, 22, 4.4, plane), "#1d1d1f", "#000000");
      i.quad(octagon(2.5, 22, 2.8, plane), "#c0392b");
      px(i, [x, 2.5, 22], "#c9ccd2");
    }
    // bench pad starts well in front of the rack
    for (const [x, y] of [[5, 13], [10, 13], [5, 28], [10, 28]]) i.box(x, y, 0, 1.5, 1.5, 6.5, "#3a3a3e");
    i.box(4, 12, 6.5, 8, 19, 3, "#1d1d1f", { top: "#2b2b2f" });
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
  fan(i) {
    i.box(5, 5, 0, 6, 6, 1.5, "#2b2b2e");
    i.box(7, 7, 1.5, 2, 2, 22, "#c9ccd2");
    i.box(5, 6, 22, 6, 4, 5, "#2b2b2e");
    const plane = (u: number, z: number): P3 => [11, u, z];
    i.quad(octagon(8, 27, 6.5, plane), "#e8eef2", "#7d8a94");
    i.quad(octagon(8, 27, 1.5, plane), "#2b2b2e");
  },
  coffeetable(i) {
    for (const [x, y] of [[2, 2], [12, 2], [2, 12], [12, 12]]) i.box(x, y, 0, 2, 2, 6, "#5a3a22");
    i.box(1, 1, 6, 14, 14, 2, "#7a4b2a", { top: "#8a5a33" });
    i.box(4, 5, 8, 6, 4, 1, "#2e86c1");
    i.box(10, 9, 8, 2, 2, 3, "#ffffff");
  },
  globe(i) {
    i.box(6, 6, 0, 4, 4, 2, "#7a4b2a");
    i.box(7.5, 7.5, 2, 1, 1, 8, "#c9a227", { noOutline: true });
    const plane = (u: number, z: number): P3 => [8, u, z];
    i.quad(octagon(8, 15, 5, plane), "#3d8bd6", "#1d4a7a");
    i.quad([plane(6, 13), plane(9, 12), plane(10, 15), plane(7, 17)], "#5cb85c");
    i.quad([plane(10, 16), plane(12, 17), plane(11, 19), plane(9.5, 18)], "#5cb85c");
  },
  armchair(i) {
    const c = "#8a4b2a";
    i.box(2, 2, 0, 12, 12, 7, c, { top: "#a35f38" });
    i.box(11, 2, 7, 3, 12, 11, c, { top: "#a35f38" });
    i.box(2, 1, 7, 9, 3, 5, c);
    i.box(2, 12, 7, 9, 3, 5, c);
  },
  wardrobe(i) {
    i.box(1, 1, 0, 30, 13, 42, "#e8e2d4", { top: "#f2ede1" });
    i.line([16, 14, 1], [16, 14, 41], "#b9b09c");
    i.line([14, 14, 18], [14, 14, 26], "#8a7f68");
    i.line([18, 14, 18], [18, 14, 26], "#8a7f68");
  },
  sideboard(i) {
    i.box(1, 2, 0, 30, 11, 14, "#6b4426", { top: "#7a4b2a" });
    for (const x of [8, 16, 24]) i.line([x, 13, 1], [x, 13, 13], "#4a2f1c");
    i.box(5, 5, 14, 4, 4, 9, "#3d6fb6");
    i.box(20, 5, 14, 6, 4, 3, "#e8e2d4");
  },
  majlis(i) {
    i.box(0, 1, 0, 32, 14, 4, "#7a1f2b", { top: "#9e2a39" });
    i.box(0, 1, 4, 32, 4, 9, "#7a1f2b", { top: "#9e2a39" });
    for (let x = 2; x < 30; x += 7) i.box(x, 5, 4, 5, 5, 3, "#c9a227", { top: "#e2c04a" });
  },
  dresser(i) {
    i.box(1, 2, 0, 30, 11, 16, "#e8e2d4");
    for (const z of [5, 10]) i.line([1, 13, z], [31, 13, z], "#b9b09c");
    i.box(8, 2, 16, 16, 2, 18, "#c9a227");
    i.quad([[9.5, 4, 17.5], [22.5, 4, 17.5], [22.5, 4, 32.5], [9.5, 4, 32.5]], "#cfe6f2");
  },
  console(i) {
    i.box(4, 5, 0, 8, 6, 2, "#1a1a1d");
    i.box(5, 4, 2, 5, 8, 12, "#f4f4f4", { top: "#ffffff" });
    i.line([10, 6, 4], [10, 6, 12], "#3a8ee6");
    i.box(10, 10, 0, 4, 3, 1, "#2b2b2e");
  },
  dining(i) {
    for (const [x, y] of [[4, 4], [26, 4], [4, 26], [26, 26]]) i.box(x, y, 0, 2, 2, 12, "#5a3a22");
    i.box(2, 2, 12, 28, 28, 2, "#8a5a33", { top: "#9a6a3e" });
    i.box(12, 12, 14, 8, 8, 1, "#ffffff");
    for (const [x, y] of [[-3, 10], [31, 10], [12, -3], [12, 31]]) {
      i.box(x, y, 0, 6, 6, 7, "#d9c19a");
    }
  },
  island(i) {
    i.box(1, 3, 0, 30, 10, 15, "#2b3a4a", { top: "#efefea" });
    i.line([1, 13, 15], [31, 13, 15], "#b9b9b4");
    for (const x of [6, 22]) {
      i.box(x + 1, 15, 0, 1, 1, 9, "#c9ccd2", { noOutline: true });
      i.box(x - 1, 13, 9, 5, 5, 2, "#d9c19a");
    }
  },
  telescope(i) {
    i.line([4, 4, 0], [8, 8, 10], "#3a3a3e");
    i.line([12, 4, 0], [8, 8, 10], "#3a3a3e");
    i.line([8, 13, 0], [8, 8, 10], "#3a3a3e");
    i.box(7, 7, 10, 2, 2, 2, "#2b2b2e");
    i.box(3, 6, 12, 12, 3, 3, "#f4f4f4", { top: "#ffffff" });
    i.box(14, 5.5, 11.5, 2, 4, 4, "#2b2b2e");
  },
  fireplace(i) {
    i.box(0, 1, 0, 32, 10, 22, "#e8e2d4", { top: "#f2ede1" });
    i.quad([[4, 11, 3], [28, 11, 3], [28, 11, 16], [4, 11, 16]], "#1a1a1d", "#55555a");
    i.box(-1, 0, 22, 34, 12, 2, "#5a3a22");
  },
  vending(i) {
    i.box(1, 1, 0, 14, 14, 44, "#c0392b", { top: "#d64541" });
    i.quad([[2, 15, 14], [11, 15, 14], [11, 15, 40], [2, 15, 40]], "#bfe3f2", "#7aa7bd");
    for (let z = 18; z < 40; z += 6) for (let x = 3; x < 11; x += 3) i.box(x, 12, z, 2, 2, 3, ["#f1c40f", "#3498db", "#2ecc71", "#e67e22"][(x + z) % 4], { noOutline: true });
    i.quad([[12, 15, 24], [14.5, 15, 24], [14.5, 15, 36], [12, 15, 36]], "#2b2b2e");
    i.quad([[2, 15, 4], [11, 15, 4], [11, 15, 9], [2, 15, 9]], "#1a1a1d");
  },
  massage(i) {
    i.box(2, 2, 0, 12, 12, 8, "#2b2b2e");
    i.box(2, 2, 8, 12, 12, 4, "#3a3a3e", { top: "#4a4a50" });
    i.box(11, 2, 12, 4, 12, 18, "#3a3a3e");
    i.box(1, 1, 8, 3, 14, 8, "#2b2b2e");
    i.box(4, 3, 0, 4, 10, 4, "#2b2b2e");
  },
  pingpong(i) {
    for (const [x, y] of [[4, 4], [42, 4], [4, 26], [42, 26]]) i.box(x, y, 0, 2, 2, 12, "#2b2b2e");
    i.box(2, 2, 12, 44, 28, 1.5, "#1f6b45", { top: "#2a8a5a" });
    i.line([2, 16, 13.6], [46, 16, 13.6], "#ffffff");
    i.box(23.5, 1, 13.5, 1, 30, 4, "#e8e8e8", { top: "#ffffff", outline: "#9a9a9a" });
    i.line([2, 2, 13.6], [46, 2, 13.6], "#ffffff");
  },
  pooltable(i) {
    for (const [x, y] of [[3, 3], [43, 3], [3, 27], [43, 27]]) i.box(x, y, 0, 3, 3, 12, "#3b2416");
    i.box(1, 1, 12, 46, 30, 3, "#5a3420", { top: "#5a3420" });
    i.quad([[4, 4, 15.05], [44, 4, 15.05], [44, 28, 15.05], [4, 28, 15.05]], "#1e7a46");
    for (const [x, y] of [[4, 4], [24, 4], [44, 4], [4, 28], [24, 28], [44, 28]]) i.quad(octagon(x, y, 1.4, (u, v) => [u, v, 15.1]), "#111111");
    for (const [x, y, c] of [[30, 14, "#f1c40f"], [32, 16, "#c0392b"], [32, 12, "#2e86c1"], [34, 14, "#111111"], [14, 16, "#ffffff"]] as [number, number, string][])
      i.quad(octagon(x, y, 0.9, (u, v) => [u, v, 15.2]), c);
    i.line([8, 22, 16], [28, 6, 18], "#c8a26a");
  },
  fountain(i) {
    i.box(1, 1, 0, 30, 30, 6, "#d9d4c4", { top: "#e6e1d2" });
    i.quad([[4, 4, 6.05], [28, 4, 6.05], [28, 28, 6.05], [4, 28, 6.05]], "#5bb8e0");
    i.box(13, 13, 6, 6, 6, 10, "#d9d4c4");
    i.box(10, 10, 16, 12, 12, 3, "#d9d4c4");
    i.box(14.5, 14.5, 19, 3, 3, 6, "#d9d4c4");
  },
  hottub(i) {
    i.box(1, 1, 0, 30, 30, 10, "#6b4426", { top: "#7a4b2a" });
    i.quad([[4, 4, 10.05], [28, 4, 10.05], [28, 28, 10.05], [4, 28, 10.05]], "#5fd3e8");
    for (const [x, y] of [[8, 9], [20, 14], [12, 22], [24, 24]]) i.quad(octagon(x, y, 1, (u, v) => [u, v, 10.1]), "#bff2fb");
  },
  yogamat(i) {
    i.box(3, 2, 0, 10, 28, 0.6, "#7e57c2", { top: "#9575cd" });
    i.box(3, 28, 0, 10, 3, 2, "#5e35b1");
  },
  punchbag(i) {
    i.box(6, 6, 0, 4, 4, 1, "#2b2b2e");
    i.line([8, 8, 44], [8, 8, 34], "#55555a");
    i.box(4, 4, 8, 8, 8, 26, "#b0302c", { top: "#c94540" });
    i.box(4, 4, 30, 8, 8, 2, "#1d1d1f", { noOutline: true });
    i.box(4, 4, 12, 8, 8, 2, "#1d1d1f", { noOutline: true });
    i.box(0, 0, 44, 16, 3, 2, "#2b2b2e");
  },
  pullup(i) {
    for (const x of [1, 13]) {
      i.box(x - 1, 2, 0, 4, 12, 1.5, "#2b2b2e");
      i.box(x, 7, 1.5, 2, 2, 46, "#3a3a3e");
    }
    i.line([1, 8, 47], [15, 8, 47], "#c9ccd2");
    i.box(5, 7, 46, 6, 2, 2, "#2b2b2e", { noOutline: true });
  },
  bike(i) {
    i.box(4, 5, 0, 24, 6, 2, "#2b2b2e");
    const plane = (u: number, z: number): P3 => [u, 9, z];
    for (const cx of [7, 25]) {
      i.quad(octagon(cx, 8, 6, plane), "#1d1d1f");
      i.quad(octagon(cx, 8, 4.6, plane), "#cfd5db");
      i.quad(octagon(cx, 8, 1, plane), "#2b2b2e");
    }
    i.line(plane(7, 8), plane(15, 9), "#e74c3c");
    i.line(plane(15, 9), plane(25, 8), "#e74c3c");
    i.line(plane(15, 9), plane(13, 18), "#e74c3c");
    i.line(plane(13, 18), plane(23, 18), "#e74c3c");
    i.line(plane(23, 18), plane(25, 8), "#e74c3c");
    i.line(plane(13, 18), plane(12, 21), "#2b2b2e");
    i.line(plane(10, 21), plane(14, 21), "#2b2b2e");
    i.line(plane(23, 18), plane(24, 22), "#2b2b2e");
    i.line(plane(22, 22), plane(26, 22), "#2b2b2e");
  },
  cactus(i) {
    i.box(5, 5, 0, 6, 6, 6, "#c0623a");
    i.box(6.5, 6.5, 6, 3, 3, 14, "#3c8d4a", { top: "#4fa95e" });
    i.box(4, 7, 11, 2.5, 2, 5, "#3c8d4a");
    i.box(9.5, 7, 13, 2.5, 2, 5, "#3c8d4a");
  },
  bonsai(i) {
    i.box(3, 4, 0, 10, 8, 4, "#2f5d8a");
    i.line([7, 8, 4], [9, 8, 10], "#5a3a22");
    i.line([9, 8, 10], [6, 8, 13], "#5a3a22");
    i.box(2, 5, 12, 7, 6, 3, "#3f8f45", { top: "#57ad5c" });
    i.box(8, 4, 9, 6, 6, 3, "#3f8f45", { top: "#57ad5c" });
  },
  olivetree(i) {
    i.box(3, 3, 0, 10, 10, 9, "#d9cfba");
    i.box(7, 7, 9, 2, 2, 18, "#6b5a45");
    for (const [x, y, z, s2] of [[2, 3, 24, 10], [5, 6, 30, 8], [4, 2, 34, 6], [8, 7, 26, 7]]) i.box(x, y, z, s2, s2, 5, "#7c9a5a", { top: "#93b26e" });
  },
  kilim(i) {
    i.box(1, 1, 0, 30, 30, 0, "#a33b2a", { top: "#a33b2a" });
    for (let k = 0; k < 4; k++) i.quad([[4 + k * 6, 6, 0], [7 + k * 6, 3, 0], [10 + k * 6, 6, 0], [7 + k * 6, 9, 0]], "#f2d24b");
    i.box(4, 12, 0, 24, 8, 0, "#1d3557", { top: "#1d3557", noOutline: true });
    for (let k = 0; k < 4; k++) i.quad([[4 + k * 6, 25, 0], [7 + k * 6, 22, 0], [10 + k * 6, 25, 0], [7 + k * 6, 28, 0]], "#f2d24b");
  },
  persian(i) {
    i.box(1, 1, 0, 46, 30, 0, "#7a1f2b", { top: "#7a1f2b" });
    i.box(4, 4, 0, 40, 24, 0, "#9e2a39", { top: "#9e2a39", noOutline: true });
    i.quad([[24, 8, 0], [34, 16, 0], [24, 24, 0], [14, 16, 0]], "#1d3557");
    i.quad([[24, 11, 0], [30, 16, 0], [24, 21, 0], [18, 16, 0]], "#e2c28a");
    for (const [x, y] of [[8, 8], [40, 8], [8, 24], [40, 24]]) i.quad([[x, y - 2, 0], [x + 2, y, 0], [x, y + 2, 0], [x - 2, y, 0]], "#e2c28a");
  },
  /** Budgie cage on a stand. The bird itself is drawn by the room so it can fly. */
  budgie(i) {
    i.box(6, 6, 0, 4, 4, 1, "#2b2b2e");
    i.box(7.5, 7.5, 1, 1, 1, 16, "#c9a227", { noOutline: true });
    i.box(3, 3, 17, 10, 10, 1, "#c9a227");
    for (let k = 0; k <= 4; k++) {
      i.line([3 + k * 2.5, 13, 18], [3 + k * 2.5, 13, 32], "#c9a227");
      i.line([13, 3 + k * 2.5, 18], [13, 3 + k * 2.5, 32], "#c9a227");
    }
    i.quad([[3, 13, 32], [8, 13, 36], [13, 13, 32]], "#e0c04a", "#a07e1a");
    i.line([3, 13, 32], [8, 8, 36], "#c9a227");
    i.line([13, 3, 32], [8, 8, 36], "#c9a227");
    i.line([3, 13, 25], [13, 13, 25], "#a07e1a");
  },
  hamster(i) {
    i.box(1, 3, 0, 14, 10, 2, "#2e86c1");
    i.box(1, 3, 2, 14, 10, 9, "#d6f0ff20", { top: "#e8f7ff30", left: "#d6f0ff30", right: "#b9dcf030", outline: "#2e86c1" });
    i.box(2, 4, 2, 12, 8, 1, "#e8d9a8", { noOutline: true });
    const plane = (u: number, z: number): P3 => [u, 9, z];
    i.quad(octagon(10, 7, 3.6, plane), "#f39c12", "#b9770e");
    i.quad(octagon(10, 7, 2.4, plane), "#f7c46c");
  },
  turtle(i) {
    i.box(1, 2, 0, 30, 12, 8, "#4a3a2a");
    i.box(1, 2, 8, 30, 12, 12, "#7fd0ee40", { top: "#a8e2f560", left: "#7fd0ee50", right: "#5fb8d850", outline: "#2b6f8a" });
    i.box(2, 3, 8, 28, 10, 5, "#3f9bc9", { noOutline: true });
    i.box(20, 3, 8, 9, 9, 7, "#9a8a70", { noOutline: true });
    i.box(3, 4, 8, 3, 2, 8, "#2f8a3e", { noOutline: true });
  },
  /** Corn snake terrarium with a heat lamp. The snake slithers (drawn by the room). */
  snake(i) {
    i.box(1, 2, 0, 30, 12, 6, "#2b2b2e");
    i.box(1, 2, 6, 30, 12, 14, "#cfe8f240", { top: "#e8f7ff40", left: "#cfe8f250", right: "#b9dcf050", outline: "#2b2b2e" });
    i.box(2, 3, 6, 28, 10, 2, "#d8b56a", { noOutline: true });
    i.line([5, 10, 8], [16, 6, 14], "#6b4426");
    i.box(22, 4, 8, 6, 5, 3, "#8a7f68", { noOutline: true });
    i.box(4, 5, 20, 6, 6, 3, "#2b2b2e");
    i.box(5.5, 6.5, 19, 3, 3, 1, "#ff9a3c", { noOutline: true });
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
};

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
  const wallAt = (wall: "L" | "R") => (u: number, z: number): P3 => (wall === "L" ? [0, u, z] : [u, 0, z]);
  for (const w of reservedOnWalls(spec.tier)) {
    const at = wallAt(w.wall);
    if (w.kind === "kaaba") {
      iso.quad([at(40, 32), at(66, 32), at(66, 58), at(40, 58)], "#c9a227", "#7a5f12");
      iso.quad([at(42, 34), at(64, 34), at(64, 56), at(42, 56)], "#2b3a55");
      iso.quad([at(46, 36), at(60, 36), at(60, 48), at(46, 48)], "#111111");
      iso.quad([at(46, 45), at(60, 45), at(60, 46), at(46, 46)], "#d4af37");
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
  if (ledStrip)
    for (const wall of ["L", "R"] as const) {
      const at = wallAt(wall);
      iso.line(at(2, H - 3), at(L - 2, H - 3), "#c86bff");
    }

  for (const w of wallItems) drawWallItem(iso, w.id, wallAt(w.wall), w.wall, w.u, w.locked);
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
        if (hash2(wu * 3, wz * 5) < (night ? 0.45 : 0.25)) {
          const [px, py] = iso.proj(at(wu, wz));
          iso.r.set(px, py, night ? "#ffd86b" : "#c9d6e8");
        }
    u = u2 + 1;
    k++;
  }
  const panes = Math.max(2, Math.round((u1 - u0) / 40));
  for (let p = 1; p < panes; p++) {
    const m = u0 + ((u1 - u0) * p) / panes;
    iso.line(at(m, z0), at(m, z1), "#2b2f36");
  }
}

/** Every wall decoration, drawn from its left edge `u0` on whichever wall it hangs. */
function drawWallItem(iso: Iso, id: string, at: (u: number, z: number) => P3, wall: "L" | "R", u0: number, locked: boolean) {
  const g = (c: string) => (locked ? greyOf(c) : c);
  const Q = (a: number, z0: number, b: number, z1: number, fill: string, edge?: string) =>
    iso.quad([at(a, z0), at(b, z0), at(b, z1), at(a, z1)], g(fill), edge ? g(edge) : undefined);
  const LN = (a: number, z0: number, b: number, z1: number, c: string) => iso.line(at(a, z0), at(b, z1), g(c));
  const PXL = (u: number, z: number, c: string) => {
    const [x, y] = iso.proj(at(u, z));
    iso.r.set(x, y, g(c));
  };
  const OCT = (cu: number, cz: number, rr: number, c: string, edge?: string) => iso.quad(octagon(cu, cz, rr, at), g(c), edge ? g(edge) : undefined);
  /** A box sticking out of the wall: along the wall `w`, out of the wall `d`, height `h`. */
  const BX = (u: number, z: number, w: number, d: number, h: number, c: string) =>
    wall === "R" ? iso.box(u, 0, z, w, d, h, g(c)) : iso.box(0, u, z, d, w, h, g(c));
  const u = u0;
  switch (id) {
    case "clock":
      OCT(u + 7, 56, 6.5, "#f5f5f5", "#333333");
      LN(u + 7, 56, u + 7, 60, "#222222");
      LN(u + 7, 56, u + 10, 56, "#c0392b");
      break;
    case "nozero":
      Q(u, 34, u + 18, 58, "#16161a", "#000000");
      neonText(iso, at, u + 2, 55, "NO", g("#ffffff"));
      neonText(iso, at, u + 2, 48, "ZERO", g("#ffd23f"));
      neonText(iso, at, u + 2, 41, "DAYS", g("#ffffff"));
      break;
    case "nazar":
      LN(u + 6, 62, u + 6, 54, "#7a5f12");
      for (const zz of [60, 58]) PXL(u + 6, zz, "#2e86de");
      OCT(u + 6, 47, 5.6, "#1f4fbf", "#0f2a66");
      OCT(u + 6, 47, 4, "#ffffff");
      OCT(u + 6, 47, 2.6, "#7fc8ff");
      OCT(u + 6, 47, 1.2, "#111111");
      break;
    case "calligraphy":
      Q(u, 34, u + 28, 54, "#c9a227", "#7a5f12");
      Q(u + 2, 36, u + 26, 52, "#123d2b");
      LN(u + 4, 42, u + 23, 42, "#e8c25a");
      LN(u + 6, 42, u + 6, 48, "#e8c25a");
      LN(u + 11, 42, u + 11, 46, "#e8c25a");
      LN(u + 15, 42, u + 15, 49, "#e8c25a");
      LN(u + 19, 42, u + 21, 47, "#e8c25a");
      LN(u + 8, 39, u + 17, 39, "#e8c25a");
      break;
    case "corkboard":
      Q(u, 34, u + 24, 54, "#7a4b2a", "#4a2f1c");
      Q(u + 1.5, 35.5, u + 22.5, 52.5, "#c49a6c");
      for (const [a, z, c] of [[3, 44, "#ffe066"], [11, 46, "#9be7ff"], [16, 38, "#ffadad"], [5, 37, "#caffbf"]] as [number, number, string][]) {
        Q(u + a, z, u + a + 5, z + 5, c);
        PXL(u + a + 2.5, z + 4.5, "#d63031");
      }
      break;
    case "mirror":
      Q(u, 24, u + 14, 62, "#c9a227", "#7a5f12");
      Q(u + 1.5, 25.5, u + 12.5, 60.5, "#cfe6f2");
      LN(u + 3, 40, u + 8, 55, "#ffffff");
      LN(u + 5, 34, u + 10, 50, "#e8f5fb");
      break;
    case "dartboard":
      OCT(u + 7, 48, 6.6, "#1a1a1a");
      OCT(u + 7, 48, 5.4, "#f1e6c8");
      OCT(u + 7, 48, 3.6, "#2e8b57");
      OCT(u + 7, 48, 2.2, "#f1e6c8");
      OCT(u + 7, 48, 0.9, "#d63031");
      LN(u + 9, 50, u + 12, 53, "#f39c12");
      break;
    case "madinah":
      Q(u, 30, u + 22, 58, "#f5f5f5", "#555555");
      Q(u + 2, 32, u + 20, 56, "#9fd0ef");
      Q(u + 2, 32, u + 20, 40, "#e9dfc9");
      iso.quad(octagon(u + 11, 44, 4.5, at).slice(0, 5).concat([at(u + 6.5, 40), at(u + 15.5, 40)]), g("#2e9e57"));
      Q(u + 16, 40, u + 18, 54, "#e9dfc9");
      LN(u + 11, 48, u + 11, 51, "#d4af37");
      break;
    case "istanbul": {
      Q(u, 32, u + 30, 56, "#3a2a20", "#1d140f");
      Q(u + 1.5, 46, u + 28.5, 54.5, "#f6b26b");
      Q(u + 1.5, 39, u + 28.5, 46, "#e07a5f");
      Q(u + 1.5, 33.5, u + 28.5, 39, "#3d5a80");
      const dark = "#2a1f2d";
      Q(u + 3, 39, u + 13, 42, dark);
      OCT(u + 8, 42, 3, dark);
      LN(u + 4, 39, u + 4, 47, dark);
      LN(u + 12, 39, u + 12, 47, dark);
      Q(u + 19, 39, u + 22, 49, dark);
      Q(u + 18.5, 49, u + 22.5, 51, dark);
      PXL(u + 20.5, 52, dark);
      LN(u + 24, 39, u + 28, 39, dark);
      break;
    }
    case "bluemosque":
      Q(u, 32, u + 24, 56, "#f5f5f5", "#555555");
      Q(u + 1.5, 33.5, u + 22.5, 54.5, "#b9dcf2");
      Q(u + 4, 33.5, u + 20, 40, "#7f93b5");
      OCT(u + 12, 41, 4.2, "#7f93b5");
      for (const m of [3, 6, 18, 21]) LN(u + m, 33.5, u + m, 50, "#6a7ea0");
      PXL(u + 12, 46, "#d4af37");
      break;
    case "plantshelf":
      BX(u, 40, 24, 5, 2, "#7a4b2a");
      for (const [a, c] of [[2, "#c0623a"], [10, "#e8e2d4"], [18, "#c0623a"]] as [number, string][]) {
        BX(u + a, 42, 4, 4, 4, c);
        for (let k = 0; k < 6; k++) PXL(u + a + 1 + (k % 3), 41 - k * 1.6, k % 2 ? "#3aa34b" : "#2f8a3e");
      }
      break;
    case "worldmap":
      Q(u, 34, u + 36, 56, "#2b2b2e", "#111111");
      Q(u + 1.5, 35.5, u + 34.5, 54.5, "#4a90c2");
      for (const [a, z0, b, z1] of [[4, 44, 11, 52], [8, 37, 12, 44], [15, 45, 21, 52], [16, 38, 21, 45], [22, 42, 31, 52], [27, 37, 31, 41]])
        Q(u + a, z0, u + b, z1, "#6fbf73");
      PXL(u + 18, 49, "#e74c3c");
      break;
    case "shelf":
      BX(u, 44, 14, 5, 2, "#7a4b2a");
      BX(u + 2, 46, 3, 3, 5, "#e0b33a");
      BX(u + 7, 46, 2, 2, 7, "#c9ccd2");
      BX(u + 10, 46, 3, 3, 4, "#cd7f32");
      break;
    case "guitar":
      LN(u + 6, 44, u + 6, 64, "#3a2a20");
      Q(u + 5, 62, u + 7, 66, "#2b2b2e");
      OCT(u + 6, 36, 5, "#c27c3a", "#5a3415");
      OCT(u + 6, 43, 3.6, "#c27c3a", "#5a3415");
      OCT(u + 6, 39, 1.4, "#1d140f");
      LN(u + 6, 32, u + 6, 46, "#e8e2d4");
      break;
    case "ioniqposter":
      Q(u, 32, u + 26, 56, "#101418", "#000000");
      Q(u + 4, 40, u + 22, 44, "#f2f4f6");
      Q(u + 7, 44, u + 19, 48, "#f2f4f6");
      Q(u + 8, 44.5, u + 18, 47.5, "#2a3846");
      OCT(u + 8, 40, 1.6, "#1a1a1a");
      OCT(u + 18, 40, 1.6, "#1a1a1a");
      for (let a = 5; a < 21; a += 2) PXL(u + a, 50.5, "#7fd3ff");
      neonText(iso, at, u + 5, 37, "EV", g("#7fd3ff"));
      break;
    case "vinylwall":
      for (let k = 0; k < 6; k++) {
        const cu = u + 5 + (k % 3) * 10, cz = 54 - Math.floor(k / 3) * 11;
        OCT(cu, cz, 4.4, "#141414", "#000000");
        OCT(cu, cz, 1.6, ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71", "#ff4fc3", "#ecf0f1"][k]);
      }
      break;
    case "neon":
      Q(u, 38, u + 26, 56, "#1b1b24", "#0d0d12");
      neonText(iso, at, u + 3, 53, "DISCI", g("#ff4fc3"));
      neonText(iso, at, u + 3, 46, "PLINE", g("#ff4fc3"));
      break;
    case "curtains":
      Q(u, 24, u + 8, 64, "#b23a48", "#6e1f2a");
      Q(u + 22, 24, u + 30, 64, "#b23a48", "#6e1f2a");
      Q(u + 8, 30, u + 22, 60, "#9fd0ef", "#7d8a94");
      LN(u - 2, 65, u + 32, 65, "#3a3a3e");
      break;
    case "ledstrip":
      LN(u, 60, u + 40, 60, "#c86bff");
      LN(u, 59, u + 40, 59, "#e3b3ff");
      break;
    case "walltv":
      Q(u, 28, u + 40, 54, "#111114", "#000000");
      Q(u + 1.5, 29.5, u + 38.5, 52.5, "#0c1018");
      LN(u + 6, 52, u + 18, 31, "#1c2433");
      LN(u + 10, 52, u + 22, 31, "#161d29");
      PXL(u + 37, 29.5, "#ff3b3b");
      break;
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
  N: ["101", "111", "111", "101", "101"], E: ["111", "100", "110", "100", "111"], O: ["010", "101", "101", "101", "010"],
  Z: ["111", "001", "010", "100", "111"], R: ["110", "101", "110", "101", "101"], A: ["010", "101", "111", "101", "101"],
  Y: ["101", "101", "010", "010", "010"], V: ["101", "101", "101", "101", "010"],
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

/** Catalog thumbnail for a wall item, cropped to the item itself. */
export function wallItemPreview(id: string): Sprite {
  return makeSprite((iso) => drawWallItem(iso, id, (u, z) => [u, 0, z], "R", 4, false), 160, 60, 120);
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
