import type { Iso, P3 } from "../iso";
import { shade } from "../raster";
import { STEEL, onX, onY, px, type Draw } from "./util";

/** A cluster of leaves: shaded blobs, darker underneath, lighter on top-left. */
function foliage(i: Iso, pts: [number, number, number, number][], base: string) {
  for (const [x, y, z, r] of pts) i.blob([x, y, z - r * 0.25], r * 1.05, r * 0.8, shade(base, -0.35));
  for (const [x, y, z, r] of pts) i.blob([x, y, z], r, r * 0.75, base);
  for (const [x, y, z, r] of pts) i.blob([x - r * 0.25, y + r * 0.1, z + r * 0.3], r * 0.45, r * 0.3, shade(base, 0.25));
}

/** Terracotta pot with a rim and soil. */
function pot(i: Iso, cx: number, cy: number, r: number, h: number, color = "#c0623a", soil = "#4a3222") {
  i.cylinder(cx, cy, 0, r * 0.85, h - 1.2, color, soil);
  i.cylinder(cx, cy, h - 1.6, r, 1.6, shade(color, 0.08), soil);
}

/** One flat leaf on a stalk: a quad between two points with a width, plus its midrib. */
function leaf(i: Iso, from: P3, to: P3, w: number, color: string) {
  const [x1, y1, z1] = from, [x2, y2, z2] = to;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w, ny = (dx / len) * w;
  const mid: P3 = [(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2 + 1];
  i.quad([from, [mid[0] + nx, mid[1] + ny, mid[2]], to, [mid[0] - nx, mid[1] - ny, mid[2]]], color, shade(color, -0.4));
  i.line(from, to, shade(color, -0.25));
}

export const LIVING: Record<string, Draw> = {
  /** Fern: small pot, arching fronds. */
  plant(i) {
    pot(i, 8, 8, 3.6, 6);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const tip: P3 = [8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, 8 + (k % 3)];
      const midp: P3 = [8 + Math.cos(a) * 3.5, 8 + Math.sin(a) * 3.5, 11.5];
      i.line([8, 8, 6], midp, "#2f7a38");
      i.line(midp, tip, "#2f7a38");
      for (let t = 0.25; t < 1; t += 0.15) {
        const p: P3 = [midp[0] + (tip[0] - midp[0]) * t, midp[1] + (tip[1] - midp[1]) * t, midp[2] + (tip[2] - midp[2]) * t];
        i.blob(p, 0.9 - t * 0.4, 0.5, t > 0.6 ? "#6cc96f" : "#3f9a4a");
      }
    }
  },
  /** Snake plant: white pot, tall striped blades. */
  snakeplant(i) {
    i.cylinder(8, 8, 0, 4, 8, "#eeeae0", "#4a3222");
    const blades: [number, number, number, number][] = [[6, 7, 28, -1], [9, 6, 32, 0.5], [10, 9, 24, 1], [7, 10, 22, -0.5], [8, 8, 30, 0], [11, 7, 20, 1.5]];
    for (const [x, y, h, lean] of blades) {
      const g = "#2f6b34";
      i.quad([[x - 1.4, y, 8], [x + 1.4, y, 8], [x + lean + 1, y, h - 4], [x + lean, y, h], [x + lean - 1, y, h - 4]], g, "#6f8a3a");
      for (let z = 11; z < h - 4; z += 3) i.line([x - 0.9, y, z], [x + 0.9, y, z + 0.8], "#4f8a50");
    }
  },
  /** Saguaro cactus in a terracotta pot, with ribs and spines. */
  cactus(i) {
    pot(i, 8, 8, 3.4, 5.5);
    const g = "#3c8d4a";
    i.cylinder(8, 8, 5, 2, 13, g, "#4fa95e", "#1f5a2a");
    i.blob([8, 8, 18], 2, 1.2, "#4fa95e");
    // arms: out then up
    i.box(4.5, 8.5, 9, 2, 1.6, 1.6, g, { noOutline: true });
    i.cylinder(4.6, 9, 9, 1.1, 6, g, "#4fa95e", "#1f5a2a");
    i.box(10, 7, 11, 2, 1.6, 1.6, g, { noOutline: true });
    i.cylinder(11.6, 7.5, 11, 1.1, 5, g, "#4fa95e", "#1f5a2a");
    for (let z = 7; z < 17; z += 2) {
      px(i, [8.8, 9.6, z], "#f2edcf");
      px(i, [9.8, 8, z + 1], "#f2edcf");
    }
    i.blob([8, 8, 18.8], 0.8, 0.5, "#ff7aa8");
  },
  /** Bonsai: shallow blue tray, twisted trunk, cloud-shaped pads. */
  bonsai(i) {
    i.box(2, 4, 0, 12, 8, 3, "#2f5d8a", { top: "#3a3a2a" });
    i.blob([5, 9, 3.2], 1, 0.5, "#8a8f7a");
    const trunk = "#5a3a22";
    const path: P3[] = [[8, 8, 3], [9, 8, 6], [7.5, 8, 8], [8.5, 8, 10.5], [6.5, 8, 12]];
    for (let k = 0; k < path.length - 1; k++) {
      i.line(path[k], path[k + 1], trunk);
      i.line([path[k][0] + 0.4, 8, path[k][2]], [path[k + 1][0] + 0.4, 8, path[k + 1][2]], shade(trunk, 0.2));
    }
    i.line([8.5, 8, 9], [11.5, 8, 10], trunk);
    i.line([8, 8, 4], [10, 8, 12], trunk);
    foliage(i, [[5, 8, 13, 3.6], [11.5, 8, 11.5, 3], [8.5, 8, 16.5, 3], [3.5, 8, 10, 2.2]], "#3f8f45");
  },
  /** Monstera: white pot, stalks, big split leaves. */
  monstera(i) {
    i.cylinder(8, 8, 0, 4.4, 9, "#e8e2d4", "#4a3222");
    const leaves: [P3, P3, number][] = [
      [[8, 8, 9], [1, 5, 20], 3.4], [[8, 8, 9], [14, 4, 24], 3.6], [[8, 8, 9], [5, 13, 27], 3.4], [[8, 8, 9], [12, 12, 18], 3], [[8, 8, 9], [8, 6, 31], 3.2],
    ];
    for (const [a, b, w] of leaves) {
      const tip: P3 = [b[0], b[1], b[2]];
      const base: P3 = [a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45, a[2] + (b[2] - a[2]) * 0.6];
      i.line(a, base, "#2e6b34");
      leaf(i, base, tip, w, "#2f8a3e");
      // the splits: little gaps cut across the leaf
      for (const t of [0.35, 0.6]) {
        const p: P3 = [base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, base[2] + (tip[2] - base[2]) * t + 1];
        i.line(p, [p[0] + 1.6, p[1] - 1.6, p[2] - 0.4], "#1e5a28");
      }
    }
  },
  /** Olive tree: tall pot, slim trunk, silvery canopy with olives. */
  olivetree(i) {
    i.cylinder(8, 8, 0, 4.6, 10, "#d9cfba", "#4a3222");
    i.line([8, 8, 10], [7, 8, 20], "#6b5a45");
    i.line([8.6, 8, 10], [7.6, 8, 20], "#857257");
    i.line([7.4, 8, 18], [10, 8, 24], "#6b5a45");
    foliage(i, [[6, 7, 26, 4], [10.5, 8, 27, 3.4], [8, 9, 31.5, 3.6], [4.5, 9, 30, 2.6], [11, 6, 31, 2.4]], "#7c9a5a");
    for (const [x, y, z] of [[6, 9, 25], [10, 9, 28], [8, 10, 30]]) i.blob([x, y, z], 0.5, 0.5, "#2f2a3a");
  },

  /** Budgie: domed wire cage on a stand, perch and seed cup inside. The bird itself is drawn by the room so it can fly. */
  budgie(i) {
    const brass = "#d9b23a", dim = "#a8862a";
    i.disc(8, 8, 0, 4, "#2b2b2e", "#111111");
    i.cylinder(8, 8, 0.5, 0.6, 13, brass, undefined, "");
    i.cylinder(8, 8, 13.5, 5.6, 1.6, "#f2efe6", "#e8dfc8", dim);
    const bars = 16, R = 5.2, z0 = 15, z1 = 27;
    const at = (k: number, z: number): P3 => [8 + Math.cos((k / bars) * Math.PI * 2) * R, 8 + Math.sin((k / bars) * Math.PI * 2) * R, z];
    // back bars first (dimmer), then perch and seed cup, then front bars
    const back = (k: number) => Math.cos((k / bars) * Math.PI * 2) + Math.sin((k / bars) * Math.PI * 2) < 0;
    for (let k = 0; k < bars; k++) if (back(k)) i.line(at(k, z0), at(k, z1), dim);
    i.line([5, 8, 20], [11, 8, 20], "#8a5a33");
    i.box(9.5, 10, z0, 1.6, 1.6, 1.4, "#3a86c8", { noOutline: true });
    for (let k = 0; k < bars; k++) if (!back(k)) i.line(at(k, z0), at(k, z1), brass);
    // dome: bars bending in to the hook
    for (let k = 0; k < bars; k += 2) {
      const a = at(k, z1);
      i.line(a, [8 + (a[0] - 8) * 0.55, 8 + (a[1] - 8) * 0.55, z1 + 3], brass);
      i.line([8 + (a[0] - 8) * 0.55, 8 + (a[1] - 8) * 0.55, z1 + 3], [8, 8, z1 + 4.5], brass);
    }
    for (const z of [z0, 21, z1]) {
      for (let k = 0; k < bars; k++) if (!back(k) || z === z1) i.line(at(k, z), at(k + 1, z), z === 21 ? dim : brass);
    }
    i.circle(onX(8), 8, z1 + 6, 1, "#00000000", brass, 10);
  },
  /** Hamster: blue tray, white wire top, a wheel, an orange tube and a water bottle. */
  hamster(i) {
    i.box(1, 3, 0, 14, 10, 4, "#2e86c1", { top: "#e8d9a8" });
    for (let k = 0; k < 7; k++) i.blob([3 + k * 1.7, 5 + (k % 3) * 2.5, 4.2], 0.6, 0.3, "#d8c48c");
    // wheel inside
    i.circle(onY(8), 10, 9, 3.6, "#f39c12", "#b9770e", 20);
    i.circle(onY(8), 10, 9, 2.7, "#f7c46c", undefined, 20);
    i.line([10, 8, 4], [10, 8, 9], "#b9770e");
    // wire cage: vertical bars on the visible faces, top bars
    const wire = "#f4f4f4";
    for (let x = 1; x <= 15; x += 1.4) i.line([x, 13, 4], [x, 13, 15], wire);
    for (let y = 3; y <= 13; y += 1.4) i.line([15, y, 4], [15, y, 15], wire);
    for (let x = 1; x <= 15; x += 1.4) i.line([x, 3, 15], [x, 13, 15], "#d9d9d9");
    i.line([1, 13, 15], [15, 13, 15], wire);
    i.line([15, 3, 15], [15, 13, 15], wire);
    i.line([1, 13, 10], [15, 13, 10], "#d9d9d9");
    // orange tube loop over the top
    for (let t = 0; t <= 1; t += 0.05) {
      const a = t * Math.PI;
      i.blob([3 + t * 7, 6, 15 + Math.sin(a) * 4], 1.1, 1.1, "#f08a24");
    }
    // water bottle on the side
    i.box(15, 6, 7, 0.8, 2, 7, "#9fd8f5", { noOutline: true });
    i.line([15.4, 7, 7], [14, 7, 6], STEEL);
  },
  /** Turtle: glass tank with a silver frame, water, gravel, a basking rock and a heat lamp. */
  turtle(i) {
    const frame = "#9aa0a6";
    i.box(1, 2, 0, 30, 12, 1.5, frame);
    i.box(1.5, 2.5, 1.5, 29, 11, 1.5, "#c9b48a", { noOutline: true });
    i.box(1.5, 2.5, 3, 29, 11, 7, "#3f9bc9", { top: "#7fd0ee", noOutline: true });
    // basking rock rising out of the water
    i.blob([24, 8, 11], 4.5, 2.4, "#7d7468");
    i.blob([23.5, 8, 11.6], 3.6, 1.6, "#9a8f80");
    // plants
    for (const x of [4, 6]) i.line([x, 9, 3], [x + 0.5, 9, 12], "#2f8a3e");
    // glass: faint faces and a bright frame
    i.box(1, 2, 1.5, 30, 12, 13, "#cfeaf522", { top: "#ffffff10", left: "#d8f0f830", right: "#b9dcf030", outline: frame });
    i.line([3, 14, 13], [8, 14, 4], "#ffffff");
    // heat lamp clipped on the rim
    i.box(26, 6, 14.5, 1, 1, 4, "#2b2b2e", { noOutline: true });
    i.cylinder(26.5, 6.5, 18, 2.2, 2.4, "#2b2b2e", "#3a3a3e");
    i.blob([26.5, 6.5, 17.7], 1.2, 0.5, "#ffb347");
  },
  /** Snake: wood-framed terrarium with a mesh lid, bark floor, a branch, a hide and a heat lamp. */
  snake(i) {
    const frame = "#2b2b2e";
    i.box(1, 2, 0, 30, 12, 2, frame);
    // back wall inside (cork)
    i.quad([[1.5, 2.5, 2], [30.5, 2.5, 2], [30.5, 2.5, 15], [1.5, 2.5, 15]], "#7a5a3a");
    for (let x = 3; x < 30; x += 4) i.line([x, 2.5, 3], [x + 1, 2.5, 14], "#6b4c30");
    i.box(1.5, 2.5, 2, 29, 11, 1.5, "#9a5a32", { top: "#a8683c", noOutline: true });
    for (let k = 0; k < 14; k++) px(i, [3 + k * 2, 4 + (k % 4) * 2.4, 3.6], "#7a4426");
    // half-log hide and water dish
    i.blob([23, 9, 4.5], 3.4, 1.8, "#6b4426");
    i.blob([23, 9.6, 4], 2, 1.1, "#2a1a10");
    i.disc(7, 10, 3.6, 1.8, "#9fd8f5", STEEL);
    // branch
    i.line([3, 6, 3.5], [14, 8, 12], "#5a3a22");
    i.line([3.5, 6, 3.5], [14.5, 8, 12], "#7a4f2c");
    i.line([10, 7, 9], [16, 5, 10], "#5a3a22");
    // glass, frame, mesh lid
    i.box(1, 2, 2, 30, 12, 13.5, "#e6f4fa18", { top: "#2b2b2e55", left: "#e6f4fa25", right: "#cfe8f225", outline: frame });
    for (let x = 2; x < 31; x += 1.5) i.line([x, 2, 15.5], [x, 14, 15.5], "#3a3a3e");
    i.line([1, 14, 2], [31, 14, 2], "#4a3a2a");
    i.line([3, 14, 13], [9, 14, 5], "#ffffff");
    // heat lamp
    i.cylinder(6, 6, 15.6, 2.4, 2.4, "#2b2b2e", "#3a3a3e");
    i.blob([6, 6, 15.4], 1.3, 0.5, "#ff9a3c");
  },
};
