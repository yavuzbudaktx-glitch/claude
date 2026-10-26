import { prism, type Iso, type P3 } from "../iso";
import { shade } from "../raster";
import { BLACK, STEEL, onX, onY, px, type Draw } from "./util";

const FRAME = "#2b2b2e";
const RED = "#c0392b";

/** A weight plate standing on a plane, with a hub. */
function plate(i: Iso, plane: (u: number, z: number) => P3, cu: number, cz: number, r: number, color = BLACK) {
  i.circle(plane, cu, cz, r, color, shade(color, -0.6), 20);
  i.circle(plane, cu, cz, r * 0.62, shade(color, 0.12), undefined, 16);
  i.circle(plane, cu, cz, r * 0.2, STEEL, undefined, 10);
}

/** Barbell along Y at height z with plates on both ends. */
function barbellY(i: Iso, x: number, y0: number, y1: number, z: number, color = BLACK, r = 4.4) {
  i.line([x, y0, z], [x, y1, z], STEEL);
  i.line([x + 0.4, y0, z + 0.4], [x + 0.4, y1, z + 0.4], "#eef0f2");
  for (const y of [y0 + 1.5, y1 - 1.5]) plate(i, onY(y), x, z, r, color);
}

/** Barbell along X. */
function barbellX(i: Iso, y: number, x0: number, x1: number, z: number, color = BLACK, r = 4.4) {
  i.line([x0, y, z], [x1, y, z], STEEL);
  for (const x of [x0 + 1.5, x1 - 1.5]) plate(i, onX(x), y, z, r, color);
}

/** A dumbbell lying along X at a point. */
function dumbbell(i: Iso, x: number, y: number, z: number, size: number) {
  i.line([x - size, y, z], [x + size, y, z], STEEL);
  for (const dx of [-size, size]) i.box(x + dx - 0.8, y - size * 0.45, z - size * 0.45, 1.6, size * 0.9, size * 0.9, "#2f2f33", { top: "#45454b" });
}

export const GYM: Record<string, Draw> = {
  /** Squat rack: two uprights on a base, J-hooks, safety arms, loaded bar. Long side along Y. */
  squatrack(i) {
    i.box(2, 0, 0, 12, 32, 1.2, "#3a3a3e", { top: "#45454b" });
    for (const y of [3, 27]) {
      i.box(6, y, 1.2, 2.5, 2.5, 46, FRAME, { top: "#3a3a3e" });
      for (let z = 6; z < 46; z += 3) px(i, [8.5, y + 1.2, z], "#55555a");
      i.box(8.5, y + 0.4, 33, 2.5, 1.7, 1.2, RED, { noOutline: true });
      i.box(8.5, y + 0.4, 18, 7, 1.7, 1.4, "#55555a");
    }
    i.box(6, 3, 47, 2.5, 26.5, 2, FRAME);
    barbellY(i, 9.5, -3, 35, 35, BLACK, 4.6);
    for (const y of [5.5, 26.5]) i.circle(onY(y), 9.5, 35, 2.8, "#c0392b", undefined, 16);
  },
  /** Full power rack: four posts, crossbars, pull-up bar, bar on hooks, plate pegs. 2×2. */
  powerrack(i) {
    i.box(1, 1, 0, 30, 30, 1, "#3a3a3e", { top: "#4a4a50" });
    for (const [x, y] of [[4, 4], [4, 26], [24, 4], [24, 26]]) i.box(x, y, 1, 2.5, 2.5, 52, FRAME, { top: "#3a3a3e" });
    i.box(4, 4, 52, 22.5, 2.5, 2, FRAME);
    i.box(4, 4, 52, 2.5, 24.5, 2, FRAME);
    barbellY(i, 9, -2, 34, 32, "#1d3557", 5);
    i.box(4, 26, 52, 22.5, 2.5, 2, FRAME);
    i.box(24, 4, 52, 2.5, 24.5, 2, FRAME);
    i.line([26.5, 6, 50], [26.5, 26, 50], STEEL);
    for (const y of [8, 22]) i.box(26.5, y, 16, 3, 1.5, 1.5, "#55555a", { noOutline: true });
    plate(i, onY(9.5), 28.5, 16, 5, RED);
    plate(i, onY(23.5), 28.5, 16, 4.2, "#2e86c1");
    i.box(10, 12, 1, 10, 8, 0.2, "#1d1d20", { noOutline: true });
  },
  /** Two-tier dumbbell rack with pairs from light to heavy. 2×1 along X. */
  dumbbellrack(i) {
    const side: [number, number][] = [[1, 0], [13, 0], [13, 3], [10, 19], [5, 19], [1, 11]];
    for (const x of [2, 28]) {
      i.quad(side.map(([y, z]) => [x, y, z] as P3), "#3a3a3e", "#111111");
      i.quad(side.map(([y, z]) => [x + 1.5, y, z] as P3), FRAME, "#111111");
    }
    // shelves (slanted toward +Y)
    i.quad([[2, 3, 10], [30, 3, 10], [30, 9, 8], [2, 9, 8]], "#3a3a3e", FRAME);
    i.quad([[2, 6, 18], [30, 6, 18], [30, 11, 16.5], [2, 11, 16.5]], "#3a3a3e", FRAME);
    let x = 4.5;
    for (const s of [1.2, 1.4, 1.6, 1.8, 2, 2.3]) {
      dumbbell(i, x, 6, 10.5 + s * 0.4, s);
      x += s * 2 + 2.6;
    }
    x = 5;
    for (const s of [1.1, 1.3, 1.5, 1.7, 1.9]) {
      dumbbell(i, x, 8.5, 18.5 + s * 0.4, s);
      x += s * 2 + 3;
    }
  },
  /** Three kettlebells, light to heavy. */
  kettlebells(i) {
    for (const [x, y, r, c] of [[4, 5, 2.2, "#2e86c1"], [10, 6, 2.7, "#f1c40f"], [7, 11.5, 3.2, BLACK]] as [number, number, number, string][]) {
      i.blob([x, y, r * 0.7], r, r * 0.95, shade(c, -0.3));
      i.blob([x - 0.2, y, r * 0.8], r * 0.85, r * 0.8, c);
      i.blob([x - r * 0.4, y, r * 1.2], r * 0.3, r * 0.2, shade(c, 0.35));
      for (let a = 0; a <= Math.PI; a += 0.12) i.dot([x + Math.cos(a) * r * 0.65, y, r * 1.45 + Math.sin(a) * r * 0.8], "#3a3a3e");
    }
  },
  /** A-frame plate tree with colour-coded bumper plates. */
  platetree(i) {
    i.box(2, 2, 0, 12, 12, 1.5, FRAME);
    i.box(7, 7, 1.5, 2, 2, 24, FRAME);
    const pegs: [number, number, string, number][] = [[5, 6, RED, 6], [11, 6, "#2e86c1", 5.5], [5, 15, "#f1c40f", 5], [11, 15, "#27ae60", 4.5]];
    for (const [y, z, c, r] of pegs) {
      i.line([8, y, z + 1], [8, y + 3, z + 1], STEEL);
      plate(i, onY(y < 8 ? y - 1 : y + 2), 8, z + 1, r, c);
    }
    i.box(6.5, 6.5, 25.5, 3, 3, 1, "#3a3a3e");
  },
  /** Office-style water cooler with a blue bottle. */
  watercooler(i) {
    i.box(4, 4, 0, 8, 8, 22, "#f2f2f2", { top: "#ffffff", right: "#d9d9d9" });
    i.box(12, 6, 13, 0.5, 4, 4, "#bfbfbf", { noOutline: true });
    px(i, [12.3, 6.8, 15], "#2e86c1");
    px(i, [12.3, 8.6, 15], "#e74c3c");
    i.box(12, 5.5, 6, 0.4, 5, 0.5, "#9a9a9a", { noOutline: true });
    i.cylinder(8, 8, 22, 3.4, 10, "#7fc8f2bb", "#a8dcf7", "#3a86c8");
    i.blob([7, 9, 28], 0.8, 2, "#ffffff80");
    i.box(4, 9, 8, 1, 3, 9, "#ffffff", { noOutline: true });
  },
  /** Heavy bag hanging from a freestanding stand: H base with plates, upright, boom over the bag. */
  punchbag(i) {
    i.box(0, 1, 0, 2.5, 14, 2, FRAME);
    i.box(0, 1, 0, 14, 2.5, 2, FRAME);
    i.box(0, 12.5, 0, 14, 2.5, 2, FRAME);
    for (const y of [3.5, 10.5]) plate(i, onY(y), 3, 4, 3, BLACK);
    i.box(0.5, 6.5, 2, 2.5, 2.5, 54, FRAME, { top: "#3a3a3e" });
    prism(i, [[1, 53], [13, 53], [13, 56], [1, 56]], 6.5, 9, FRAME, { side: "#3a3a3e" });
    i.line([11, 7.8, 53], [11, 7.8, 46], "#9aa0a6");
    i.line([10.5, 7.8, 46], [11.5, 7.8, 46], "#9aa0a6");
    i.cylinder(10, 8, 12, 4, 33, "#b0302c", "#c94540", "#5a1512");
    // leather straps: dark bands round the front half of the bag
    for (const z of [17, 38])
      for (let k = 0; k < 24; k++) {
        const a1 = (k / 24) * Math.PI * 2, a2 = ((k + 1) / 24) * Math.PI * 2;
        if (Math.cos(a1) + Math.sin(a1) + Math.cos(a2) + Math.sin(a2) < -0.2) continue;
        const p = (a: number, zz: number): P3 => [10 + Math.cos(a) * 4.05, 8 + Math.sin(a) * 4.05, zz];
        i.quad([p(a1, z), p(a2, z), p(a2, z + 1.4), p(a1, z + 1.4)], "#1d1d1f");
      }
    i.disc(10, 8, 45, 4, "#c94540", "#5a1512");
  },
  /** PA speaker with two woofers and a tweeter on the front (+X). */
  speaker(i) {
    i.box(4, 4, 0, 8, 8, 24, "#1a1a1d", { top: "#2b2b2e" });
    const f = onX(12);
    for (const z of [6, 14]) {
      i.circle(f, 8, z, 3.2, "#2b2b2e", "#000000", 20);
      i.circle(f, 8, z, 1.4, "#3a3a3e", undefined, 12);
    }
    i.circle(f, 8, 20.5, 1.3, "#55555a", undefined, 10);
    px(i, [12, 10.5, 22.5], "#4dff88");
  },
  /** Battle ropes from an anchor at the far end, laid in waves along Y. */
  battleropes(i) {
    i.box(5, 0, 0, 6, 3, 1.2, FRAME);
    i.box(6.5, 0.5, 1.2, 3, 2, 8, FRAME, { top: "#3a3a3e" });
    i.box(7, 2.5, 5, 2, 1.2, 1.6, STEEL, { noOutline: true });
    for (const off of [-2.2, 2.2]) {
      let prev: P3 = [8 + off * 0.3, 3, 6];
      for (let y = 4; y <= 30; y += 0.8) {
        const p: P3 = [8 + off + Math.sin(y * 0.45) * 1.4, y, Math.max(0.8, 6 - y * 0.25)];
        i.line(prev, p, "#c9b48a");
        i.line([prev[0] + 0.4, prev[1], prev[2]], [p[0] + 0.4, p[1], p[2]], "#a8925f");
        prev = p;
      }
      i.box(8 + off - 0.8, 29, 0, 1.6, 2.6, 1.6, "#1d1d1f", { noOutline: true });
    }
  },
  /** Rowing machine: long rail, sliding seat, fan housing, monitor arm, foot plates. 2×1 along X. */
  rower(i) {
    i.box(4, 6.5, 0, 26, 3, 2, "#3a3a3e");
    i.box(14, 6.5, 0, 1.5, 3, 4, FRAME);
    i.box(30, 6, 0, 1.5, 4, 3, FRAME);
    i.box(22, 5, 4, 5, 6, 1.6, BLACK, { top: "#2b2b2e" });
    i.box(14, 3.5, 2, 4, 9, 1, FRAME);
    i.box(15, 4, 3, 2, 3, 3, "#55555a", { noOutline: true });
    i.box(15, 9, 3, 2, 3, 3, "#55555a", { noOutline: true });
    i.cylinder(5, 8, 2, 5, 6, FRAME, "#3a3a3e");
    i.circle(onX(10), 8, 7, 3.8, "#1d1d20", "#55555a", 20);
    i.line([9, 8, 9], [12, 8, 18], FRAME);
    i.box(11, 6, 18, 2.5, 4, 3, "#1d1d20");
    i.quad([[13.5, 6.5, 18.5], [13.5, 9.5, 18.5], [13.5, 9.5, 20.5], [13.5, 6.5, 20.5]], "#3a8ee6");
    i.line([11, 6, 10], [11, 10, 10], STEEL);
  },
  /** 45° leg press: base, inclined rails, loaded sled, reclined seat. Long side along Y; you push up toward -Y. */
  legpress(i) {
    i.box(1, 1, 0, 14, 30, 2, FRAME);
    const rail = (x: number, c: string) => {
      for (const d of [0, 0.5, 1]) i.line([x + d, 30, 6], [x + d, 3, 34], c);
      i.box(x - 0.2, 2, 2, 1.6, 2, 32, FRAME, { noOutline: true });
    };
    rail(2.5, FRAME);
    // sled with plates, partway up the rails
    const t = 0.38, y = 30 - t * 27, z = 6 + t * 28;
    i.quad([[3, y - 4, z + 3], [13, y - 4, z + 3], [13, y + 1, z - 2], [3, y + 1, z - 2]], "#3a3a3e", FRAME);
    plate(i, onX(2), y - 1.5, z + 3, 4, RED);
    // reclined seat at the low end
    i.box(4, 22, 2, 8, 7, 5, "#1d1d1f", { top: "#2b2b2f" });
    i.quad([[4, 29, 7], [12, 29, 7], [12, 26, 21], [4, 26, 21]], "#1d1d1f", "#000000");
    i.quad([[12, 29, 7], [12.8, 29, 7], [12.8, 26, 21], [12, 26, 21]], "#2b2b2f");
    rail(12.5, "#3a3a3e");
    plate(i, onX(14), y - 1.5, z + 3, 4, RED);
  },
  /** Cable machine: tall frame, weight stack, pulleys, cables and a handle. 2×1 along X. */
  cable(i) {
    i.box(1, 2, 0, 30, 12, 1.5, "#3a3a3e");
    for (const x of [3, 27]) i.box(x, 6, 1.5, 2.5, 3, 52, FRAME, { top: "#3a3a3e" });
    i.box(3, 6, 52, 26.5, 3, 2.5, FRAME);
    i.box(13, 5, 1.5, 6, 5, 22, "#2b2b2e");
    for (let z = 2.5; z < 22; z += 2.2) i.box(13.2, 5.2, z, 5.6, 4.6, 1.6, "#55555a", { top: "#6a6a70", noOutline: true });
    px(i, [19, 9.8, 12], RED);
    i.line([16, 7.5, 24], [16, 7.5, 52], "#9aa0a6");
    i.circle(onY(9), 4.5, 50, 1.6, "#55555a", undefined, 12);
    i.circle(onY(9), 28.5, 50, 1.6, "#55555a", undefined, 12);
    i.line([4.5, 9, 50], [8, 13, 30], "#9aa0a6");
    i.line([28.5, 9, 50], [24, 13, 30], "#9aa0a6");
    i.box(7, 12.5, 28.5, 2, 1, 3, "#1d1d1f", { noOutline: true });
    i.box(23, 12.5, 28.5, 2, 1, 3, "#1d1d1f", { noOutline: true });
  },
  /** Foam roller lying on the floor. */
  foamroller(i) {
    prism(i, Array.from({ length: 16 }, (_, k) => [8 + Math.cos((k / 16) * Math.PI * 2) * 2.6, 2.6 + Math.sin((k / 16) * Math.PI * 2) * 2.6] as [number, number]), 2, 14, "#2e86c1", {
      side: "#3a96d1",
    });
    for (let y = 3; y < 14; y += 2) i.line([10.4, y, 3], [10.4, y + 1, 3.5], "#1f6b9a");
  },
  /** Chalk bowl on a pedestal. */
  chalkbowl(i) {
    i.cylinder(8, 8, 0, 3, 1.2, FRAME);
    i.cylinder(8, 8, 1.2, 1, 16, "#3a3a3e", undefined, "");
    i.cylinder(8, 8, 17, 4.2, 3, "#3a3a3e", "#f4f4f4");
    i.blob([7, 9, 20.3], 2, 0.8, "#ffffff");
  },
};
