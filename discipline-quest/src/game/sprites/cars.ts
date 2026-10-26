import { Iso, makeSprite, octagonOn, prism, type P3, type Sprite } from "../iso";
import { shade } from "../raster";

/**
 * Your three cars, drawn by extruding real side profiles (about 14 world units per metre).
 * Front points to +X (bottom-right on screen); the near side is the +Y face.
 */

const near = (y: number) => (u: number, z: number): P3 => [u, y, z];

function wheel(i: Iso, y: number, cx: number, r: number, rim: (i: Iso, plane: (u: number, z: number) => P3, cx: number, cz: number, r: number) => void, arch = "#1c1c1f") {
  const plane = near(y);
  i.quad(octagonOn(plane, cx, r + 0.6, r + 1.4), arch);
  i.quad(octagonOn(plane, cx, r, r), "#131315");
  rim(i, plane, cx, r, r * 0.68);
}

function farWheel(i: Iso, y: number, cx: number, r: number) {
  i.box(cx - r, y - 3, 0, r * 2, 3, r * 2, "#151517");
}

function dot(i: Iso, p: P3, c: string) {
  const [x, y] = i.proj(p);
  i.r.set(x, y, c);
}

// ---------- 2027 Hyundai Ioniq 5, all Atlas White ----------

function ioniqRim(i: Iso, plane: (u: number, z: number) => P3, cx: number, cz: number, r: number) {
  i.quad(octagonOn(plane, cx, cz, r), "#c2c7cd");
  i.quad(octagonOn(plane, cx, cz, r * 0.62), "#7d838a");
  // parametric pixel pattern
  for (const [du, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1.4, -1.4], [1.4, 1.4]]) dot(i, plane(cx + du, cz + dz), "#e9edf1");
  dot(i, plane(cx, cz), "#2b2d31");
}

export function drawIoniq(i: Iso) {
  const W = "#eef0f2";
  const glass = "#1f2a35";
  const L = 65, y0 = 3, y1 = 29;
  farWheel(i, y0 + 1, 13, 5.3);
  farWheel(i, y0 + 1, 54, 5.3);
  // body below the belt line: upright tail, flat sides, short clamshell hood
  prism(i, [[1, 3], [1, 15], [6, 15.5], [44, 15.5], [61, 13.8], [65, 12.5], [65, 4], [62, 2.5], [4, 2.5]], y0, y1, W, { outline: "#8d9399" });
  // greenhouse: near-vertical hatch, long flat white roof, raked windshield
  prism(i, [[3, 15.5], [5, 22.5], [39, 22.8], [48, 15.5]], y0 + 2, y1 - 2, W, { side: glass, front: "#3f5a70", slope: "#3f5a70", top: "#f7f8f9", outline: "#7d848b" });
  const s = near(y1 - 2);
  // body-colour C-pillar with the Ioniq kink, black B-pillar, roof edge
  i.quad([s(4.2, 15.6), s(5.4, 22.2), s(9.5, 22.2), s(12.5, 15.6)], W, "#8d9399");
  i.line(s(25, 15.6), s(25, 22.5), "#0e1318");
  i.line(s(39, 22.6), s(47.5, 15.6), "#0e1318");
  // lower black cladding with squared arches, the diagonal door crease, flush handles, mirror
  const b = near(y1);
  i.quad([b(1, 2.5), b(65, 2.5), b(65, 5.5), b(1, 5.5)], "#2a2c30");
  i.line(b(44, 7), b(16, 11.5), "#b9bfc5");
  i.line(b(22, 12.5), b(25, 12.5), "#8d9399");
  i.line(b(35, 12.5), b(38, 12.5), "#8d9399");
  i.box(43, y1, 14, 3, 2.5, 2, "#1d1f22");
  // pixel taillight wrapping the rear corner, charge flap
  i.quad([b(1, 12), b(4, 12), b(4, 14), b(1, 14)], "#d81f2e");
  i.quad([b(57, 9), b(59, 9), b(59, 11), b(57, 11)], "#dfe2e5", "#a6acb2");
  // front: black lamp band with the square pixel headlights, lower intake
  const f = (u: number, z: number): P3 => [65, u, z];
  i.quad([f(y0 + 1, 10), f(y1 - 1, 10), f(y1 - 1, 12.4), f(y0 + 1, 12.4)], "#17181b");
  for (const yy of [y0 + 2, y0 + 4, y0 + 6, y1 - 7, y1 - 5, y1 - 3])
    for (const zz of [10.6, 11.8]) dot(i, f(yy, zz), "#f4fbff");
  i.quad([f(y0 + 5, 4.5), f(y1 - 5, 4.5), f(y1 - 5, 7.5), f(y0 + 5, 7.5)], "#202226");
  wheel(i, y1 + 0.5, 13, 5.3, ioniqRim);
  wheel(i, y1 + 0.5, 54, 5.3, ioniqRim);
}

// ---------- 2016 Infiniti Q50, Hagane Blue with a black roof ----------

function q50Rim(i: Iso, plane: (u: number, z: number) => P3, cx: number, cz: number, r: number) {
  i.quad(octagonOn(plane, cx, cz, r), "#30343a");
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    i.line(plane(cx, cz), plane(cx + Math.cos(a) * r, cz + Math.sin(a) * r), "#b8bec5");
  }
  dot(i, plane(cx, cz), "#e5e8eb");
}

export function drawQ50(i: Iso) {
  const blue = "#2c4a7c";
  const glass = "#1a2230";
  const y0 = 3, y1 = 28;
  farWheel(i, y0 + 1, 14, 5);
  farWheel(i, y0 + 1, 54, 5);
  // low sedan body: short deck, long hood sweeping down to the nose
  prism(i, [[0, 4], [0, 12], [2, 14.2], [13, 14.6], [48, 14.6], [62, 12.8], [67, 10.5], [67, 4.5], [64, 2.5], [3, 2.5]], y0, y1, blue, { outline: "#14243f" });
  // fastback greenhouse with a black roof
  prism(i, [[11, 14.6], [22, 20.5], [40, 20.8], [50, 14.6]], y0 + 2, y1 - 2, "#141518", { side: glass, front: "#3c5470", slope: "#3c5470", top: "#1b1c20", outline: "#0b0c0f" });
  const s = near(y1 - 2);
  i.quad([s(12.5, 14.8), s(21.5, 20), s(25, 20), s(22, 14.8)], "#141518");
  i.line(s(31, 14.8), s(31, 20.6), "#0b0c0f");
  // chrome window trim, Infiniti shoulder line, handles, mirror
  i.line(s(12, 14.8), s(22, 20.3), "#c9ced4");
  i.line(s(22, 20.3), s(40, 20.6), "#c9ced4");
  i.line(s(40, 20.6), s(49, 14.8), "#c9ced4");
  const b = near(y1);
  i.line(b(6, 11.5), b(58, 11), shade(blue, 0.35));
  i.line(b(25, 12.5), b(28, 12.5), "#c9ced4");
  i.line(b(37, 12.5), b(40, 12.5), "#c9ced4");
  i.box(46, y1, 14, 3, 2.5, 2, blue);
  i.quad([b(0, 10), b(4, 10), b(3, 12), b(0, 12)], "#b0182a");
  // front: double-arch grille with chrome, slanted "eye" headlights
  const f = (u: number, z: number): P3 => [67, u, z];
  i.quad([f(y0 + 8, 4.5), f(y1 - 8, 4.5), f(y1 - 7, 9.5), f(y0 + 7, 9.5)], "#15171a", "#c9ced4");
  for (let z = 5.5; z < 9.5; z += 1.5) i.line(f(y0 + 8, z), f(y1 - 8, z), "#3a3e45");
  i.quad([f(y0 + 1, 9.5), f(y0 + 6, 10), f(y0 + 6, 11), f(y0 + 1, 10.5)], "#e8f2ff", "#9aa6b5");
  i.quad([f(y1 - 6, 10), f(y1 - 1, 9.5), f(y1 - 1, 10.5), f(y1 - 6, 11)], "#e8f2ff", "#9aa6b5");
  wheel(i, y1 + 0.5, 14, 5, q50Rim, "#1a2235");
  wheel(i, y1 + 0.5, 54, 5, q50Rim, "#1a2235");
}

// ---------- 2016 Mini Cooper, cream with black bonnet stripes ----------

function miniRim(i: Iso, plane: (u: number, z: number) => P3, cx: number, cz: number, r: number) {
  i.quad(octagonOn(plane, cx, cz, r), "#c8cdd2");
  i.quad(octagonOn(plane, cx, cz, r * 0.55), "#8a9097");
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    dot(i, plane(cx + Math.cos(a) * r * 0.8, cz + Math.sin(a) * r * 0.8), "#5a6067");
  }
  dot(i, plane(cx, cz), "#1d1f22");
}

export function drawMini(i: Iso) {
  const cream = "#efe2c2";
  const glass = "#1c2531";
  const y0 = 3, y1 = 27;
  farWheel(i, y0 + 1, 10, 4.6);
  farWheel(i, y0 + 1, 44, 4.6);
  // short, upright body; hood drops toward the round lamps
  prism(i, [[0, 4], [0, 14], [1.5, 15], [38, 15], [50, 13], [53, 11], [53, 4.5], [51, 2.5], [2, 2.5]], y0, y1, cream, { outline: "#8f8463" });
  // upright greenhouse with the black "floating" roof
  prism(i, [[2, 15], [3, 20.5], [35, 20.5], [40, 15]], y0 + 1.5, y1 - 1.5, "#18191c", { side: glass, front: "#3b5269", slope: "#3b5269", top: "#202125", outline: "#0b0c0e" });
  const s = near(y1 - 1.5);
  i.line(s(14, 15.2), s(14, 20.4), "#0b0c0e");
  i.line(s(26, 15.2), s(26, 20.4), "#0b0c0e");
  // black bonnet stripes on the hood
  const hood = (y: number, w: number) => i.quad([[38.5, y, 15.05], [50, y, 13.05], [50, y + w, 13.05], [38.5, y + w, 15.05]], "#141416");
  hood(y0 + 7, 2.5);
  hood(y1 - 9.5, 2.5);
  i.quad([[50, y0 + 7, 13.02], [53, y0 + 7, 11.02], [53, y0 + 9.5, 11.02], [50, y0 + 9.5, 13.02]], "#141416");
  i.quad([[50, y1 - 9.5, 13.02], [53, y1 - 9.5, 11.02], [53, y1 - 7, 11.02], [50, y1 - 7, 13.02]], "#141416");
  // black arch trim, chrome handle, side scuttle, mirror, union-jack-ish tail lamp
  const b = near(y1);
  i.quad([b(2, 2.5), b(51, 2.5), b(51, 4.2), b(2, 4.2)], "#232427");
  i.line(b(24, 12.5), b(27, 12.5), "#d6dade");
  i.quad([b(42, 9), b(45, 9), b(45, 11), b(42, 11)], "#c9ced4", "#7d838a");
  i.box(36, y1, 14.5, 2.5, 2, 2, "#18191c");
  i.quad([b(0, 10), b(2.5, 10), b(2.5, 13), b(0, 13)], "#c0182a");
  // front: hexagon grille with chrome surround and round headlights
  const f = (u: number, z: number): P3 => [53, u, z];
  i.quad([f(y0 + 7, 4), f(y1 - 7, 4), f(y1 - 6, 7), f(y1 - 7, 9.5), f(y0 + 7, 9.5), f(y0 + 6, 7)], "#141416", "#d6dade");
  for (const yc of [y0 + 3.5, y1 - 3.5]) {
    i.quad(octagonOn(f, yc, 9.5, 2.6), "#d6dade");
    i.quad(octagonOn(f, yc, 9.5, 1.7), "#fff8de");
  }
  wheel(i, y1 + 0.5, 10, 4.6, miniRim);
  wheel(i, y1 + 0.5, 44, 4.6, miniRim);
}

export const CAR_DRAW: Record<string, (i: Iso) => void> = {
  "car-mini": drawMini,
  "car-q50": drawQ50,
  "car-ioniq5": drawIoniq,
};

export function carSprite(id: string): Sprite {
  return makeSprite((iso) => (CAR_DRAW[id] ?? drawMini)(iso), 240, 120, 150);
}
