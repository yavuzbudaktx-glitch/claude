import { prism, type Iso, type P3 } from "../iso";
import { shade } from "../raster";
import { BLACK, STEEL, WALNUT, WOOD, octagon, onX, onY, px, type Draw } from "./util";

const RUGS: Record<string, { border: string; field: string; accent: string; mihrab: string }> = {
  "rug-green": { border: "#c9a227", field: "#1f6b45", accent: "#9c2f2f", mihrab: "#2f8a5c" },
  "rug-red": { border: "#e2c28a", field: "#9e1f2a", accent: "#1d3557", mihrab: "#c0392b" },
  "rug-blue": { border: "#f2f2f2", field: "#1f5a96", accent: "#2bb3a3", mihrab: "#3f7cc0" },
  "rug-gold": { border: "#7a1f2b", field: "#c99a2e", accent: "#5b2a86", mihrab: "#e8c25a" },
};

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
  i.line([2, 15, 39], [6, 15, 30], "#f4f7fa");
  if (!open) {
    i.line([8, 15, 13], [8, 15, 40], "#8d949b");
    i.line([9, 15, 22], [9, 15, 33], "#5d646b");
  } else {
    i.quad([[8, 15, 13.5], [15, 15, 13.5], [15, 15, 39.5], [8, 15, 39.5]], "#f6fbff", "#8d949b");
    for (const z of [20, 27, 34]) i.line([8, 15, z], [15, 15, z], "#c9d6e2");
    i.box(9, 13, 14, 2, 2, 4, "#e74c3c", { noOutline: true });
    i.box(12, 13, 21, 2, 2, 3, "#f1c40f", { noOutline: true });
    i.box(9.5, 13, 28, 3, 2, 3, "#27ae60", { noOutline: true });
    i.box(12, 13, 35, 2, 2, 4, "#ffffff", { noOutline: true });
  }
  if (wall) {
    i.box(16, 0, 34, 32, 7, 13, "#f4f1ea");
    for (const x of [24, 32, 40]) i.line([x, 7, 35], [x, 7, 46], "#c9c3b5");
    for (const x of [21, 29, 37, 45]) i.line([x, 7, 37], [x, 7, 39], "#7d7468");
    i.box(34, 0, 27, 12, 8, 4, "#9aa0a6");
  }
  i.box(15, 1, 0, 18, 14, 14, "#f4f1ea", { top: "#3a3a3f" });
  i.line([24, 15, 1], [24, 15, 12], "#c9c3b5");
  for (const x of [20, 28]) i.line([x, 15, 8], [x, 15, 10], "#7d7468");
  i.quad([[18, 4, 14.05], [28, 4, 14.05], [28, 11, 14.05], [18, 11, 14.05]], "#aab3bb", "#6f7881");
  i.box(22, 2, 14, 2, 2, 5, "#b8bec5");
  i.box(22, 2, 18, 2, 4, 1, "#b8bec5", { noOutline: true });
  i.box(33, 1, 0, 15, 14, 14, "#2b2b2e", { top: "#1a1a1d" });
  for (const [x, y] of [[37, 4.5], [44, 4.5], [37, 10.5], [44, 10.5]]) i.disc(x, y, 14.05, 2.2, "#26262a", "#5a5a60");
  i.quad([[35, 15, 3], [46, 15, 3], [46, 15, 10], [35, 15, 10]], "#121214", "#55555a");
  i.line([36, 15, 11.5], [45, 15, 11.5], "#b8bec5");
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
  i.quad([s(2, 4), s(11, 4), s(11, 8), s(2, 8)], "#ff4fc3");
  i.quad([s(2, 9), s(11, 9), s(11, 11), s(2, 11)], "#4de0ff");
  i.quad([[14, 2, 38.5], [14, 14, 38.5], [14, 14, 45.5], [14, 2, 45.5]], "#ffd23f", "#8a6a00");
  for (let y = 4; y < 13; y += 2) px(i, [14, y, 42], "#c0392b");
  i.quad([[10, 3.5, 35.5], [10, 12.5, 35.5], [9.2, 12.5, 26], [9.2, 3.5, 26]], "#0b0d1a", "#000000");
  i.quad([[9.9, 4.5, 34], [9.9, 11.5, 34], [9.3, 11.5, 27.5], [9.3, 4.5, 27.5]], "#1c2a6b");
  i.box(11, 4, 22.3, 1, 1, 3, "#111111", { noOutline: true });
  i.blob([11.5, 4.5, 26], 0.9, 0.9, "#e74c3c");
  for (const [x, y, c] of [[12, 8, "#f1c40f"], [13.5, 8, "#2ecc71"], [12, 10.5, "#3498db"], [13.5, 10.5, "#e74c3c"]] as const) i.blob([x, y, 22.5], 0.7, 0.5, c);
  i.quad([[12, 6, 6], [12, 10, 6], [12, 10, 12], [12, 6, 12]], "#1b0f33", "#c9a227");
  px(i, [12, 8, 10], "#ff4040");
}

/** A small dining chair: seat plus a backrest on the given outer side. */
function diningChair(i: Iso, x: number, y: number, back: "-x" | "+x" | "-y" | "+y") {
  const wood = "#6b4426", seat = "#d9c19a";
  for (const [lx, ly] of [[x, y], [x + 4, y], [x, y + 4], [x + 4, y + 4]]) i.box(lx, ly, 0, 1, 1, 7, wood, { noOutline: true });
  const backBox = () => {
    if (back === "-x") i.box(x - 0.5, y, 7, 1.5, 5, 12, wood, { top: shade(wood, 0.2) });
    if (back === "-y") i.box(x, y - 0.5, 7, 5, 1.5, 12, wood, { top: shade(wood, 0.2) });
    if (back === "+x") i.box(x + 4, y, 7, 1.5, 5, 12, wood, { top: shade(wood, 0.2) });
    if (back === "+y") i.box(x, y + 4, 7, 5, 1.5, 12, wood, { top: shade(wood, 0.2) });
  };
  // a back on the far side is drawn before the seat, a near one after
  if (back === "-x" || back === "-y") backBox();
  i.box(x - 0.3, y - 0.3, 7, 5.6, 5.6, 2, seat, { top: "#e8d5b2" });
  if (back === "+x" || back === "+y") backBox();
}

export const HOME: Record<string, Draw> = {
  bed(i) {
    i.box(0, 0, 0, 3, 32, 22, WOOD);
    i.line([3, 2, 20], [3, 30, 20], shade(WOOD, 0.2));
    i.box(3, 0, 0, 45, 32, 7, WOOD);
    i.box(4, 1, 7, 43, 30, 4, "#f2efe6");
    i.box(6, 6, 11, 9, 20, 3, "#ffffff", { top: "#ffffff" });
    i.line([7, 16, 14], [14, 16, 14], "#e1ddd2");
    i.box(18, 0, 7, 30, 32, 6, "#3d6fb6", { top: "#4a7fc6" });
    for (let x = 22; x < 46; x += 6) i.line([x, 1, 13], [x, 31, 13], "#3a68aa");
    i.box(18, 0, 13, 4, 32, 0.01, "#f2efe6", { noOutline: true });
  },
  kitchen: drawKitchen,
  prayerrug(i, variant = "rug-green") {
    const c = RUGS[variant] ?? RUGS["rug-green"];
    i.box(1, 1, 0, 14, 30, 0, c.border, { top: c.border });
    i.box(3, 3, 0, 10, 26, 0, c.field, { top: c.field, noOutline: true });
    // pointed mihrab arch at the head end
    i.quad([[5, 9, 0], [5, 5, 0], [8, 3.5, 0], [11, 5, 0], [11, 9, 0]], c.mihrab);
    i.quad([[7, 5, 0], [9, 5, 0], [9, 7, 0], [7, 7, 0]], c.border);
    for (let y = 13; y < 27; y += 4) i.quad([[6, y, 0], [8, y - 1, 0], [10, y, 0], [8, y + 1.5, 0]], c.accent);
    for (let y = 2; y < 30; y += 2) px(i, [1.5, y, 0], shade(c.border, -0.25));
    for (let x = 1; x <= 15; x += 2) px(i, [x, 31, 0], "#f2efe6", 1, 1);
  },
  lamp(i) {
    i.disc(8, 8, 0, 3.5, "#333333", "#111111");
    i.box(7.5, 7.5, 0.5, 1, 1, 27, "#6a6a6e", { noOutline: true });
    // drum shade, linen
    i.cylinder(8, 8, 27, 5, 8, "#f4d58a", "#fbe9b8", "#a8873a");
  },
  coffee(i) {
    // espresso machine: brushed steel body, black group head, cup tray, drip tray
    i.box(3, 3, 0, 10, 10, 13, "#b9bfc5", { left: "#d4d8dc", right: "#9aa0a6" });
    i.box(3, 3, 13, 10, 10, 1, "#2b2b2e");
    i.box(9, 6, 7, 2, 4, 2, "#1d1d20");
    i.box(10, 6.5, 9, 3, 3, 1, "#2b2b2e", { noOutline: true });
    i.box(11, 4, 0.3, 2.5, 8, 1, "#3a3a3e");
    i.cylinder(12, 8, 1.3, 1.1, 2.2, "#ffffff");
    px(i, [13, 4.5, 11], "#4dff88");
  },
  bookshelf(i) {
    i.box(1, 0, 0, 14, 12, 44, "#7a4b2a");
    const cols = ["#c0392b", "#2e86c1", "#f1c40f", "#27ae60", "#8e44ad", "#e67e22"];
    [4, 17, 30].forEach((z, row) => {
      i.box(1, 12, z - 1, 14, 1, 1, "#5e391f", { noOutline: true });
      for (let b = 0; b < 5; b++) {
        const h = 8 + ((b + row) % 3);
        i.box(2 + b * 2.6, 9, z, 2, 3, h, cols[(b + row) % cols.length]);
        i.line([2.5 + b * 2.6, 12, z + h - 2], [3.5 + b * 2.6, 12, z + h - 2], "#f2e6c8");
      }
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
    const c = "#c0392b";
    i.box(0, 0, 0, 14, 32, 8, c, { top: "#d24a3b" });
    i.box(0, 0, 8, 10, 3, 6, c);
    i.box(0, 29, 8, 10, 3, 6, c);
    for (const y of [11, 21]) i.line([1, y, 8], [9, y, 8], "#9e2b20");
    i.box(10, 0, 8, 4, 32, 11, "#a93226");
    for (const y of [3, 16, 29]) i.line([14, y, 9], [14, y, 18], "#8e281f");
  },
  recordplayer(i) {
    i.box(1, 2, 0, 14, 12, 13, "#8a5a33", { top: "#7a4b2a" });
    const spines = ["#e74c3c", "#2c3e50", "#f1c40f", "#8e44ad", "#16a085", "#ecf0f1"];
    spines.forEach((c, k) => i.box(2.5 + k * 2, 13, 1, 1.6, 1, 10, c, { noOutline: true }));
    i.box(2, 3, 13, 12, 10, 2, "#2b2b2e", { top: "#3a3a3f" });
    i.disc(7.5, 8, 15.05, 4.2, "#111113", "#000000");
    for (const r of [3.4, 2.6]) i.disc(7.5, 8, 15.07, r, "#1d1d20");
    i.disc(7.5, 8, 15.1, 1.3, "#d64541");
    i.line([12.5, 4.5, 15.2], [10, 9, 15.2], STEEL);
    i.box(12, 4, 15, 1.5, 1.5, 1, STEEL, { noOutline: true });
  },
  aquarium(i) {
    i.box(1, 1, 0, 14, 14, 12, "#4a3a2a");
    i.box(1, 1, 12, 14, 14, 14, "#6cc6e8", { top: "#a8e2f5" });
    i.box(2, 2, 12, 12, 12, 2, "#d9c27a", { noOutline: true });
    i.box(4, 9, 14, 1, 1, 6, "#2f8a3e", { noOutline: true });
    i.box(10, 13, 14, 1, 1, 8, "#2f8a3e", { noOutline: true });
    i.line([2, 15, 25], [6, 15, 19], "#d6f3ff");
  },
  /** Your clarinet on its stand, with a music stand. */
  clarinet(i) {
    i.box(5, 6, 0, 5, 5, 1, "#2b2b2e");
    i.line([5, 6, 1], [7.5, 8.5, 6], "#55555a");
    i.line([10, 6, 1], [7.5, 8.5, 6], "#55555a");
    i.line([7.5, 11, 1], [7.5, 8.5, 6], "#55555a");
    i.box(6.5, 7.5, 1, 2.2, 2.2, 3, "#121214");
    i.box(7, 8, 4, 1.3, 1.3, 20, "#121214", { top: "#2a2a2e" });
    for (const z of [8, 11, 14, 17, 20]) i.blob([8.3, 9.3, z], 0.5, 0.5, "#d8dde2");
    i.box(7.1, 8.1, 24, 1.1, 1.1, 2, STEEL, { noOutline: true });
    i.line([12, 3, 0], [12, 3, 18], "#3a3a3e");
    i.quad([[10.5, 1, 17], [13.5, 1, 22], [13.5, 7, 22], [10.5, 7, 17]], "#f7f4ea", "#7d7468");
    for (let k = 0; k < 3; k++) i.line([11 + k, 2, 18 + k * 1.5], [11 + k, 6, 18 + k * 1.5], "#55555a");
  },
  arcade: drawArcade,
  desk(i) {
    for (const [x, y] of [[1, 2], [28, 2], [1, 12], [28, 12]]) i.box(x, y, 0, 2, 2, 17, "#9aa0a6");
    i.box(0, 1, 17, 31, 14, 2, "#e8e4da", { top: "#f1ede4" });
    i.box(10, 3, 19, 12, 2, 1, "#1d1d21");
    i.box(15, 3, 20, 2, 2, 3, "#1d1d21");
    i.box(8, 3, 23, 16, 2, 10, "#1d1d21");
    i.quad([[9, 5, 24], [23, 5, 24], [23, 5, 32], [9, 5, 32]], "#3a8ee6");
    i.line([10, 5, 31], [14, 5, 25], "#6fb0f0");
    i.box(10, 9, 19, 11, 3, 0.8, "#2b2b2e");
    for (let k = 0; k < 5; k++) px(i, [11 + k * 2, 10.5, 19.9], "#55555a");
    i.box(23, 9, 19, 3, 3, 0.6, "#2b2b2e");
    i.box(26, 2, 19, 4, 9, 12, "#222226");
    px(i, [30, 6, 27], "#ff3df2");
    px(i, [30, 6, 25], "#3dfff2");
  },
  /** Beige leather desk chair: chrome star base, seat, arms, then a shaped backrest on a post, so nothing shows through it. Faces -Y. */
  chair(i) {
    const leather = "#d9c19a", hi = "#ead6b2", lo = "#b99c70";
    for (const [x, y] of [[3, 8], [13, 8], [8, 3], [8, 13], [4.5, 12.5]]) {
      i.line([8, 8, 1], [x, y, 0.6], STEEL);
      i.blob([x, y, 0.5], 0.8, 0.6, "#2b2b2e");
    }
    i.cylinder(8, 8, 0.6, 1, 6.5, STEEL, undefined, "");
    i.box(3, 3, 7, 10, 9, 3, leather, { top: hi });
    i.box(4, 4, 10, 8, 7, 1.2, hi, { top: "#f2e2c4", noOutline: true });
    for (const [x, y] of [[6, 6], [10, 6], [8, 9], [6, 12], [10, 12]]) px(i, [x, y, 11.25], lo);
    for (const x of [2, 12.5]) {
      i.box(x + 0.4, 10, 7, 0.8, 0.8, 4.5, "#7a4b2a", { noOutline: true });
      i.box(x, 4, 11.5, 1.6, 8, 1.2, "#7a4b2a", { top: "#8f5c35" });
    }
    // post up the back, then the backrest: narrower, rounded top, tufted
    i.box(7.3, 14, 7, 1.4, 1, 5, STEEL, { noOutline: true });
    i.box(3.5, 14, 12, 9, 2.4, 13, leather, { top: hi });
    i.box(4.5, 14.2, 25, 7, 2, 2, leather, { top: hi });
    for (const [x, z] of [[6, 16], [10, 16], [8, 19], [6, 22], [10, 22]]) px(i, [x, 16.4, z], lo);
    i.line([4, 16.4, 13], [12, 16.4, 13], lo);
  },
  /** Rack at the back, bench clearly in front of it: no overlap. Long side along Y. */
  gymbench(i) {
    for (const x of [1, 13]) {
      i.box(x - 1, 0, 0, 4, 5, 1.5, "#3a3a3e");
      i.box(x, 1.5, 1.5, 2, 2, 22, "#55555a");
      i.box(x - 0.5, 3.5, 20, 3, 1.2, 1.2, "#2b2b2e", { noOutline: true });
    }
    i.line([-4, 2.5, 22], [20, 2.5, 22], STEEL);
    for (const x of [-2.5, 18.5]) {
      i.circle(onX(x), 2.5, 22, 4.4, "#1d1d1f", "#000000");
      i.circle(onX(x), 2.5, 22, 2.8, "#c0392b");
      i.circle(onX(x), 2.5, 22, 0.8, STEEL);
    }
    for (const [x, y] of [[5, 13], [10, 13], [5, 28], [10, 28]]) i.box(x, y, 0, 1.5, 1.5, 6.5, "#3a3a3e");
    i.box(4, 12, 6.5, 8, 19, 3, "#1d1d1f", { top: "#2b2b2f" });
    i.line([4.5, 13, 9.5], [11.5, 13, 9.5], "#3a3a40");
  },
  treadmill(i) {
    i.box(1, 3, 0, 14, 28, 4, "#2b2b2e", { top: "#3a3a3f" });
    i.box(3, 5, 4, 10, 24, 0.01, "#1a1a1d", { noOutline: true });
    i.box(2, 2, 4, 2, 2, 20, "#55555a");
    i.box(12, 2, 4, 2, 2, 20, "#55555a");
    i.box(1, 1, 22, 14, 4, 5, "#2b2b2e");
    i.quad([[3, 5, 27.05], [13, 5, 27.05], [13, 2, 27.05], [3, 2, 27.05]], "#101418");
    px(i, [5, 4, 27.1], "#4dff88", 3, 1);
    px(i, [10, 4, 27.1], "#ff9f1c", 1, 1);
  },
  /** Carved X-shaped rehal holding an open mushaf. */
  rehal(i) {
    const w = "#7a4b2a", w2 = "#8f5c35";
    // two boards crossing like an X (seen from the side), spine along Y
    prism(i, [[2.5, 0], [4.5, 0], [13.5, 12.5], [11.8, 13.5]], 4, 12, w, { side: w2, outline: "#3d2414" });
    prism(i, [[11.5, 0], [13.5, 0], [4.2, 13.5], [2.5, 12.5]], 4.6, 11.4, w, { side: w2, outline: "#3d2414" });
    // carving: a little star cut-out on each board
    for (const [x, z] of [[6, 4], [10, 4]]) i.circle(onY(12), x, z, 1, "#3d2414", undefined, 8);
    // open Quran resting in the V: green cover, cream pages, a gold line of text on each page
    const L = (x: number, z: number, y: number): P3 => [x, y, z];
    i.quad([L(2.5, 13.8, 3.5), L(8, 8.4, 3.5), L(8, 8.4, 12.5), L(2.5, 13.8, 12.5)], "#1f6b45", "#0f3a26");
    i.quad([L(8, 8.4, 3.5), L(13.5, 13.8, 3.5), L(13.5, 13.8, 12.5), L(8, 8.4, 12.5)], "#1f6b45", "#0f3a26");
    i.quad([L(3, 13.9, 4.2), L(8, 9, 4.2), L(8, 9, 11.8), L(3, 13.9, 11.8)], "#f8f1db", "#cbbd94");
    i.quad([L(8, 9, 4.2), L(13, 13.9, 4.2), L(13, 13.9, 11.8), L(8, 9, 11.8)], "#efe4c4", "#cbbd94");
    for (let k = 0; k < 4; k++) {
      i.line(L(4 + k, 12.9 - k, 5), L(4 + k, 12.9 - k, 11), k === 0 ? "#c9a227" : "#5a4a2a");
      i.line(L(12 - k, 12.9 - k, 5), L(12 - k, 12.9 - k, 11), k === 0 ? "#c9a227" : "#5a4a2a");
    }
  },
  fan(i) {
    i.disc(8, 8, 0, 3.5, "#2b2b2e", "#111111");
    i.box(7.5, 7.5, 1, 1, 1, 21, "#c9ccd2", { noOutline: true });
    i.box(5, 6, 22, 6, 4, 5, "#2b2b2e");
    i.circle(onX(11), 8, 27, 6.5, "#e8eef2", "#7d8a94", 24);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      i.line([11, 8, 27], [11, 8 + Math.cos(a) * 6.4, 27 + Math.sin(a) * 6.4], "#aab5bd");
    }
    i.circle(onX(11), 8, 27, 1.5, "#2b2b2e");
  },
  coffeetable(i) {
    for (const [x, y] of [[2, 2], [12, 2], [2, 12], [12, 12]]) i.box(x, y, 0, 2, 2, 7, "#5a3a22");
    i.box(1, 1, 7, 14, 14, 2, "#7a4b2a", { top: "#8a5a33" });
    for (const k of [3, 7, 11]) i.line([1.5, k, 9.05], [14.5, k + 1, 9.05], "#7f5230");
  },
  /** Globe on a walnut stand with a brass meridian ring. */
  globe(i) {
    i.cylinder(8, 8, 0, 3.6, 1.5, WALNUT);
    i.cylinder(8, 8, 1.5, 0.7, 4, "#c9a227", undefined, "");
    const [cx, cy] = i.proj([8, 8, 13]);
    const s = i.s, R = 5.2 * s;
    // sphere with a lit upper-left
    i.r.ellipse(cx, cy, R + 1, R + 1, "#0d2f52");
    i.r.ellipse(cx, cy, R, R, "#2a6fb0");
    i.r.ellipse(cx - 0.8 * s, cy - 0.8 * s, R * 0.82, R * 0.82, "#3a86c8");
    // continents, kept inside the ball
    const land = "#5aa95a", land2 = "#3f8f45";
    for (const [dx, dy, rx, ry, c] of [
      [-2.2, -1.6, 1.8, 1.3, land], [-1.4, 1.2, 1.1, 1.9, land2], [1.6, -2.2, 2, 1, land], [2.4, 0.4, 1.1, 1.6, land2], [0.4, 3.2, 1.4, 0.7, "#e8e8e8"],
    ] as [number, number, number, number, string][])
      i.r.ellipse(cx + dx * s, cy + dy * s, rx * s, ry * s, c);
    i.r.ellipse(cx - 2 * s, cy - 2.6 * s, 1.3 * s, 0.8 * s, "#ffffff70");
    // brass meridian: half ring on the left, tilted, joining the stem
    for (let a = 0.35 * Math.PI; a < 1.65 * Math.PI; a += 0.02) {
      const x = cx + Math.cos(a + 0.25) * (R + 1.6 * s), y = cy + Math.sin(a + 0.25) * (R + 1.6 * s);
      i.r.rect(Math.floor(x), Math.floor(y), s, s, "#c9a227");
    }
    i.r.rect(Math.floor(cx - 0.5 * s), Math.floor(cy - R - 1.5 * s), s, s, "#e8c25a");
  },
  /** Cognac leather armchair facing away (-Y): base, seat cushion, arms, then the backrest on top of everything behind it. */
  armchair(i) {
    const c = "#8a4b2a", top = "#a35f38", lo = "#6f3b20";
    for (const [x, y] of [[2.5, 2.5], [12.5, 2.5], [2.5, 12], [12.5, 12]]) i.box(x, y, 0, 1, 1, 3, WALNUT, { noOutline: true });
    i.box(2, 2, 3, 12, 10.5, 5, c, { top });
    i.box(4, 2.5, 8, 8, 9, 2.5, "#9c5631", { top: "#b86a40" });
    i.line([4.5, 7, 10.55], [11.5, 7, 10.55], lo);
    i.box(1.5, 2, 8, 2.5, 10.5, 6, c, { top });
    i.box(12, 2, 8, 2.5, 10.5, 6, c, { top });
    i.box(1.5, 12.5, 3, 13, 3, 12, c, { top });
    i.box(1.5, 12.2, 15, 13, 3.6, 2.4, "#9c5631", { top: "#b86a40" });
    for (const x of [4, 8, 12]) px(i, [x, 15.5, 11], lo);
    i.line([2, 15.5, 7], [14, 15.5, 7], lo);
  },
  wardrobe(i) {
    i.box(1, 1, 0, 30, 13, 42, "#e8e2d4", { top: "#f2ede1" });
    i.line([16, 14, 1], [16, 14, 41], "#b9b09c");
    i.line([14, 14, 18], [14, 14, 26], "#8a7f68");
    i.line([18, 14, 18], [18, 14, 26], "#8a7f68");
    i.line([1, 14, 3], [31, 14, 3], "#cfc6b2");
  },
  sideboard(i) {
    for (const [x, y] of [[2, 3], [29, 3], [2, 11], [29, 11]]) i.box(x, y, 0, 1, 1, 3, "#3b2416", { noOutline: true });
    i.box(1, 2, 3, 30, 11, 14, "#6b4426", { top: "#7a4b2a" });
    for (const x of [8, 16, 24]) i.line([x, 13, 4], [x, 13, 16], "#4a2f1c");
    for (const x of [6, 12, 20, 28]) i.line([x, 13, 9], [x, 13, 11], "#c9a227");
  },
  majlis(i) {
    i.box(0, 1, 0, 32, 14, 4, "#7a1f2b", { top: "#9e2a39" });
    i.box(0, 1, 4, 32, 4, 9, "#7a1f2b", { top: "#9e2a39" });
    for (let x = 2; x < 30; x += 7) i.box(x, 5, 4, 5, 5, 3, "#c9a227", { top: "#e2c04a" });
    for (let x = 1; x < 32; x += 3) px(i, [x, 15, 2], "#e2c04a");
  },
  dresser(i) {
    i.box(1, 2, 0, 30, 11, 18, "#e8e2d4", { top: "#f2ede1" });
    for (const z of [6, 12]) i.line([1, 13, z], [31, 13, z], "#b9b09c");
    for (const [x, z] of [[8, 3], [24, 3], [8, 9], [24, 9], [8, 15], [24, 15]]) i.blob([x, 13, z], 0.6, 0.6, "#c9a227");
    i.box(10, 2, 18, 12, 1.5, 18, "#c9a227");
    i.quad([[11.5, 3.5, 19.5], [20.5, 3.5, 19.5], [20.5, 3.5, 34.5], [11.5, 3.5, 34.5]], "#cfe6f2");
    i.line([13, 3.5, 31], [17, 3.5, 22], "#ffffff");
  },
  console(i) {
    // white console standing next to a black controller
    i.box(4, 5, 0, 8, 6, 1.5, "#1a1a1d");
    i.box(5, 4, 1.5, 5, 8, 11, "#f4f4f4", { top: "#ffffff" });
    i.line([10, 6, 3], [10, 6, 11], "#3a8ee6");
    i.blob([12, 12, 0.8], 1.6, 0.8, "#2b2b2e");
    px(i, [12, 12, 1.4], "#3a8ee6");
  },
  /** Table for four: far chairs, the table, then the near chairs, all inside the 2×2 footprint. */
  dining(i) {
    diningChair(i, 13.5, 2, "-y");
    diningChair(i, 2, 13.5, "-x");
    for (const [x, y] of [[9, 9], [22, 9], [9, 22], [22, 22]]) i.box(x, y, 0, 1.6, 1.6, 12, "#5a3a22");
    i.box(7, 7, 12, 18, 18, 2, "#8a5a33", { top: "#9a6a3e" });
    i.quad([[14, 7.5, 14.05], [18, 7.5, 14.05], [18, 24.5, 14.05], [14, 24.5, 14.05]], "#f2efe6");
    for (const [x, y] of [[16, 10.5], [10.5, 16], [21.5, 16], [16, 21.5]]) i.disc(x, y, 14.1, 1.8, "#ffffff", "#c9c4b6");
    i.cylinder(16, 16, 14.1, 1, 4, "#3d6fb6");
    i.blob([16, 16, 19], 1.4, 1, "#e85d75");
    diningChair(i, 25, 13.5, "+x");
    diningChair(i, 13.5, 25, "+y");
  },
  island(i) {
    i.box(1, 3, 0, 30, 10, 20, "#2b3a4a", { top: "#efefea" });
    i.line([1, 13, 20], [31, 13, 20], "#b9b9b4");
    for (const x of [8, 16, 24]) i.line([x, 13, 2], [x, 13, 18], "#22303d");
    for (const x of [6, 22]) {
      i.box(x + 1, 15, 0, 1, 1, 12, STEEL, { noOutline: true });
      i.cylinder(x + 1.5, 15.5, 12, 2.4, 1.6, "#d9c19a");
    }
  },
  telescope(i) {
    i.line([4, 4, 0], [8, 8, 10], "#3a3a3e");
    i.line([12, 4, 0], [8, 8, 10], "#3a3a3e");
    i.line([8, 13, 0], [8, 8, 10], "#3a3a3e");
    i.box(7, 7, 10, 2, 2, 2, "#2b2b2e");
    i.box(3, 6, 12, 12, 3, 3, "#f4f4f4", { top: "#ffffff" });
    i.box(14, 5.5, 11.5, 2, 4, 4, "#2b2b2e");
    i.circle(onX(16), 7.5, 13.5, 1.2, "#3a6fb0");
  },
  fireplace(i) {
    i.box(0, 1, 0, 32, 10, 22, "#e8e2d4", { top: "#f2ede1" });
    i.quad([[4, 11, 3], [28, 11, 3], [28, 11, 16], [4, 11, 16]], "#1a1a1d", "#55555a");
    i.box(-1, 0, 22, 34, 12, 2, "#5a3a22");
    for (const x of [8, 14, 20]) i.box(x, 7, 3, 5, 2, 1.5, "#6b4426", { noOutline: true });
  },
  vending(i) {
    i.box(1, 1, 0, 14, 14, 44, "#c0392b", { top: "#d64541" });
    i.quad([[2, 15, 14], [11, 15, 14], [11, 15, 40], [2, 15, 40]], "#bfe3f2", "#7aa7bd");
    for (let z = 18; z < 40; z += 6) for (let x = 3; x < 11; x += 3) i.box(x, 12, z, 2, 2, 3, ["#f1c40f", "#3498db", "#2ecc71", "#e67e22"][(x + z) % 4], { noOutline: true });
    i.quad([[12, 15, 24], [14.5, 15, 24], [14.5, 15, 36], [12, 15, 36]], "#2b2b2e");
    i.quad([[2, 15, 4], [11, 15, 4], [11, 15, 9], [2, 15, 9]], "#1a1a1d");
    i.line([2.5, 15, 39], [6, 15, 30], "#e6f6fd");
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
    for (const [x, y] of [[4, 4], [24, 4], [44, 4], [4, 28], [24, 28], [44, 28]]) i.disc(x, y, 15.1, 1.4, "#111111");
    for (const [x, y, c] of [[30, 14, "#f1c40f"], [32, 16, "#c0392b"], [32, 12, "#2e86c1"], [34, 14, "#111111"], [14, 16, "#ffffff"]] as [number, number, string][])
      i.blob([x, y, 15.6], 0.9, 0.9, c);
    i.line([8, 22, 16], [28, 6, 18], "#c8a26a");
  },
  hottub(i) {
    i.box(1, 1, 0, 30, 30, 10, "#6b4426", { top: "#7a4b2a" });
    i.quad([[4, 4, 10.05], [28, 4, 10.05], [28, 28, 10.05], [4, 28, 10.05]], "#5fd3e8");
    for (const [x, y] of [[8, 9], [20, 14], [12, 22], [24, 24]]) i.disc(x, y, 10.1, 1, "#bff2fb");
  },
  yogamat(i) {
    i.box(3, 2, 0, 10, 28, 0.6, "#7e57c2", { top: "#9575cd" });
    i.cylinder(8, 29.5, 0, 2, 0.01, "#5e35b1");
    i.box(3, 28, 0, 10, 3, 2, "#5e35b1");
  },
  bike(i) {
    i.box(4, 5, 0, 24, 6, 2, "#2b2b2e");
    const plane = onY(9);
    for (const cx of [7, 25]) {
      i.circle(plane, cx, 8, 6, "#1d1d1f", undefined, 24);
      i.circle(plane, cx, 8, 4.8, "#cfd5db", undefined, 24);
      i.circle(plane, cx, 8, 1, "#2b2b2e");
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
  kilim(i) {
    i.box(1, 1, 0, 30, 30, 0, "#a33b2a", { top: "#a33b2a" });
    for (let k = 0; k < 4; k++) i.quad([[4 + k * 6, 6, 0], [7 + k * 6, 3, 0], [10 + k * 6, 6, 0], [7 + k * 6, 9, 0]], "#f2d24b");
    i.box(4, 12, 0, 24, 8, 0, "#1d3557", { top: "#1d3557", noOutline: true });
    for (let k = 0; k < 6; k++) i.quad([[6 + k * 4, 16, 0], [8 + k * 4, 14, 0], [10 + k * 4, 16, 0], [8 + k * 4, 18, 0]], "#e8e2d4");
    for (let k = 0; k < 4; k++) i.quad([[4 + k * 6, 25, 0], [7 + k * 6, 22, 0], [10 + k * 6, 25, 0], [7 + k * 6, 28, 0]], "#f2d24b");
  },
  persian(i) {
    i.box(1, 1, 0, 46, 30, 0, "#7a1f2b", { top: "#7a1f2b" });
    i.box(4, 4, 0, 40, 24, 0, "#9e2a39", { top: "#9e2a39", noOutline: true });
    i.quad([[24, 8, 0], [34, 16, 0], [24, 24, 0], [14, 16, 0]], "#1d3557");
    i.quad([[24, 11, 0], [30, 16, 0], [24, 21, 0], [18, 16, 0]], "#e2c28a");
    i.quad([[24, 14, 0], [26, 16, 0], [24, 18, 0], [22, 16, 0]], "#7a1f2b");
    for (const [x, y] of [[8, 8], [40, 8], [8, 24], [40, 24]]) i.quad([[x, y - 2, 0], [x + 2, y, 0], [x, y + 2, 0], [x - 2, y, 0]], "#e2c28a");
  },
  /** Prayer beads in a little brass dish. */
  tasbih(i) {
    i.cylinder(8, 8, 0, 4, 1.4, "#c9a227", "#b08a1c");
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      i.blob([8 + Math.cos(a) * 2.6, 8 + Math.sin(a) * 2.6, 1.8], 0.55, 0.45, k % 5 === 0 ? "#e8e2d4" : "#1f6b45");
    }
    i.blob([11, 10.5, 1.6], 0.5, 0.9, "#c9a227");
  },
  pizza(i) {
    i.box(2, 3, 0, 12, 12, 2, "#c8a26a");
    i.quad([[4, 5, 2], [9, 5, 2], [9, 10, 2], [4, 10, 2]], "#e0b34a");
    px(i, [5, 6, 2], "#c0392b");
  },
  clothes(i) {
    i.quad([[2, 3, 0], [12, 2, 0], [14, 9, 0], [5, 12, 0]], "#3d6fb6", "#22406b");
    i.quad([[6, 8, 0], [13, 10, 0], [10, 15, 0], [4, 14, 0]], "#e1e1e1", "#8a8a8a");
  },
  can(i) {
    i.cylinder(8, 8, 0, 1.6, 4, "#c0392b");
  },
};

export { octagon, BLACK };
