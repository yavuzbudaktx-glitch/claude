import type { Iso, P3 } from "../iso";
import { shade } from "../raster";
import { STEEL, WALNUT, onY, px, type Draw } from "./util";

const GOLD = "#e8b931";
const GOLD_HI = "#ffe48a";
const GOLD_LO = "#a87d14";

/** A small wooden plinth that prizes stand on. */
function plinth(i: Iso, h = 2.5) {
  i.box(3, 3, 0, 10, 10, h, WALNUT, { top: shade(WALNUT, 0.25) });
}

/** Monthly challenge prizes. */
export const RARE: Record<string, Draw> = {
  /** Ottoman lamp: brass dome with pierced stars on a short stand. */
  "rare-jan"(i) {
    i.cylinder(8, 8, 0, 3, 1.4, GOLD_LO, GOLD);
    i.cylinder(8, 8, 1.4, 0.6, 4, GOLD, undefined, "");
    const c: P3 = [8, 8, 10.5];
    i.blob(c, 5, 5.4, GOLD_LO);
    i.blob([7.6, 8, 11], 4.4, 4.8, GOLD);
    for (const [dx, dz] of [[-2, 1], [0, 3], [2, 1], [-1, -1.5], [1.5, -1.5], [0, 0.5]]) i.blob([8 + dx * 0.7, 8 - dx * 0.7, 10.5 + dz], 0.55, 0.55, "#fff1b8");
    i.blob([8, 8, 16.2], 0.8, 1.2, GOLD_HI);
  },
  /** Galata Tower: round stone tower, window band, conical roof. */
  "rare-feb"(i) {
    plinth(i, 1.5);
    i.cylinder(8, 8, 1.5, 3.4, 13, "#e3d6bd", "#d4c6aa");
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      if (Math.cos(a) + Math.sin(a) < 0) continue;
      i.box(8 + Math.cos(a) * 3.3 - 0.4, 8 + Math.sin(a) * 3.3 - 0.4, 11, 0.8, 0.8, 2, "#3a3a4a", { noOutline: true });
    }
    i.cylinder(8, 8, 14.5, 3.9, 1, "#cbbf9f");
    for (let k = 0; k < 10; k++) i.cylinder(8, 8, 15.5 + k * 0.9, 3.6 - k * 0.38, 0.9, "#4a5a72", undefined, "");
    i.blob([8, 8, 25], 0.4, 0.8, GOLD);
  },
  /** Gold tasbih on a green velvet cushion. */
  "rare-mar"(i) {
    i.box(3, 3, 0, 10, 10, 2.2, "#1f6b45", { top: "#2a8a5a" });
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      i.blob([8 + Math.cos(a) * 3.2, 8 + Math.sin(a) * 3.2, 2.6], 0.6, 0.5, k % 11 === 0 ? "#fff3c4" : GOLD);
    }
    i.blob([12, 11, 2.4], 0.6, 1.2, GOLD_LO);
  },
  /** Kaaba model on a marble base. */
  "rare-apr"(i) {
    i.box(2, 2, 0, 12, 12, 2, "#f1f1ed", { top: "#ffffff", outline: "#9a9a96" });
    i.box(4, 4, 2, 8, 8, 8, "#141414", { top: "#1f1f1f" });
    i.line([4, 12, 7.5], [12, 12, 7.5], GOLD);
    i.line([12, 4, 7.5], [12, 12, 7.5], GOLD);
    i.line([4, 12, 8.2], [12, 12, 8.2], GOLD_LO);
    i.line([12, 4, 8.2], [12, 12, 8.2], GOLD_LO);
    i.box(9, 12, 2.5, 1.6, 0.2, 3, GOLD, { noOutline: true });
  },
  /** A golden dumbbell trophy on a plinth. */
  "rare-may"(i) {
    plinth(i);
    i.line([4, 8, 6], [12, 8, 6], GOLD_HI);
    for (const x of [4.5, 11.5]) {
      i.circle(onY(8), x, 6, 3, GOLD_LO, undefined, 16);
      i.circle(onY(8.6), x, 6, 2.8, GOLD, undefined, 16);
      i.blob([x - 0.6, 8.6, 7.2], 0.6, 0.5, GOLD_HI);
    }
  },
  /** Golden rug: ivory border, gold field, a medallion. */
  "rare-aug"(i) {
    i.box(1, 1, 0, 30, 30, 0, "#f2ead4", { top: "#f2ead4", outline: "#a88a3a" });
    i.box(3.5, 3.5, 0, 25, 25, 0, GOLD, { top: GOLD, noOutline: true });
    i.quad([[16, 6, 0], [26, 16, 0], [16, 26, 0], [6, 16, 0]], "#f2ead4");
    i.quad([[16, 9, 0], [23, 16, 0], [16, 23, 0], [9, 16, 0]], "#7a1f2b");
    i.quad([[16, 12.5, 0], [19.5, 16, 0], [16, 19.5, 0], [12.5, 16, 0]], GOLD_HI);
    for (const [x, y] of [[5.5, 5.5], [26.5, 5.5], [5.5, 26.5], [26.5, 26.5]]) i.quad([[x, y - 1.5, 0], [x + 1.5, y, 0], [x, y + 1.5, 0], [x - 1.5, y, 0]], "#7a1f2b");
  },
  /** Tiny white Ioniq 5 on a display stand, red pixel light bar at the back. */
  "rare-sep"(i) {
    i.box(2, 4, 0, 12, 8, 1.2, "#2b2b2e", { top: "#3a3a3e" });
    i.box(3, 5, 2.2, 10, 6, 3, "#eef1f4", { top: "#ffffff" });
    i.box(4.5, 5.3, 5.2, 7, 5.4, 2, "#1b222c", { top: "#eef1f4" });
    for (const x of [4.5, 11]) for (const y of [5, 11]) i.blob([x, y, 2], 0.9, 0.9, "#111114");
    for (let y = 5.5; y < 11; y += 1) px(i, [3, y, 4.2], "#ff3030");
  },
  /** Turkish tea: tulip glasses on a silver tray, double teapot. */
  "rare-oct"(i) {
    i.disc(8, 8, 0, 5.5, "#c9ccd2", "#7d8a94");
    i.disc(8, 8, 0.2, 4.8, "#dfe2e6");
    i.cylinder(6, 6, 0.2, 1.8, 3, "#e8e8ec", "#f4f4f6");
    i.cylinder(6, 6, 3.2, 1.3, 2.4, "#c0392b", "#e8e8ec");
    i.blob([6, 6, 6.2], 0.5, 0.4, "#e8e8ec");
    for (const [x, y] of [[10, 7], [8, 11], [11, 10.5]]) {
      i.cylinder(x, y, 0.2, 0.9, 0.5, GOLD);
      i.cylinder(x, y, 0.7, 0.7, 2.6, "#b4231bcc", "#d0423a");
    }
  },
  /** Hourglass: walnut caps, glass bulbs, falling sand. */
  "rare-nov"(i) {
    i.cylinder(8, 8, 0, 3.4, 1.2, WALNUT);
    for (const [x, y] of [[5.8, 5.8], [10.2, 10.2], [10.2, 5.8]]) i.box(x - 0.3, y - 0.3, 1.2, 0.6, 0.6, 11, WALNUT, { noOutline: true });
    i.blob([8, 8, 4.4], 2.6, 3, "#cfe8f2aa");
    i.blob([8, 8, 9.6], 2.6, 3, "#cfe8f2aa");
    i.blob([8, 8, 3.4], 2, 1.6, "#e2b85a");
    i.blob([8, 8, 10.5], 1.4, 1, "#e2b85a");
    i.line([8, 8, 9.4], [8, 8, 4.6], "#e2b85a");
    i.cylinder(8, 8, 12.4, 3.4, 1.2, WALNUT);
    for (const [x, y] of [[5.8, 10.2]]) i.box(x - 0.3, y - 0.3, 1.2, 0.6, 0.6, 11, WALNUT, { noOutline: true });
  },
  /** Crystal globe: a glass world on a walnut stand. */
  "rare-dec"(i) {
    i.cylinder(8, 8, 0, 3, 2.2, WALNUT);
    i.cylinder(8, 8, 2.2, 1.8, 0.8, STEEL);
    const [cx, cy] = i.proj([8, 8, 8.2]);
    const s = i.s, R = 4.6 * s;
    i.r.ellipse(cx, cy, R + 1, R + 1, "#5a8fb8");
    i.r.ellipse(cx, cy, R, R, "#d8f0fb");
    for (const [dx, dy, rx, ry] of [[-1.8, -1, 1.5, 1], [1.4, 1.2, 1.6, 1.2], [0.6, -2.6, 1, 0.6]]) i.r.ellipse(cx + dx * s, cy + dy * s, rx * s, ry * s, "#a8d8ec");
    i.r.ellipse(cx - 1.8 * s, cy - 2 * s, 1.1 * s, 0.7 * s, "#ffffff");
    i.r.rect(Math.floor(cx + 2.4 * s), Math.floor(cy - 3.2 * s), s, s, "#ffffff");
  },
};
