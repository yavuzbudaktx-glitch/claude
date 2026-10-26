import type { Iso, P3 } from "./iso";
import { shade } from "./raster";

type At = (u: number, z: number) => P3;

/** 3×5 pixel font for posters and neon. */
const FONT: Record<string, string[]> = {
  A: ["010", "101", "111", "101", "101"], B: ["110", "101", "110", "101", "110"], C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"], E: ["111", "100", "110", "100", "111"], F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"], H: ["101", "101", "111", "101", "101"], I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"], K: ["101", "101", "110", "101", "101"], L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"], N: ["101", "111", "111", "111", "101"], O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"], Q: ["010", "101", "101", "011", "001"], R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"], T: ["111", "010", "010", "010", "010"], U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"], W: ["101", "101", "111", "111", "101"], X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"], Z: ["111", "001", "010", "100", "111"], "5": ["111", "100", "110", "001", "110"],
  "!": ["1", "1", "1", "0", "1"], ",": ["0", "0", "0", "1", "1"], "'": ["1", "1", "0", "0", "0"],
};

/** Write text on a wall: each font pixel is one world unit, letters 4 apart. */
export function neonText(iso: Iso, at: At, u0: number, zTop: number, text: string, color: string, glow?: string) {
  let u = u0;
  for (const ch of text) {
    if (ch === " ") {
      u += 3;
      continue;
    }
    const glyph = FONT[ch];
    if (!glyph) continue;
    glyph.forEach((row, ry) =>
      [...row].forEach((bit, rx) => {
        if (bit !== "1") return;
        if (glow) iso.blob(at(u + rx + 0.5, zTop - ry - 0.5), 1.1, 1.1, glow);
      }),
    );
    glyph.forEach((row, ry) => [...row].forEach((bit, rx) => bit === "1" && iso.dot(at(u + rx, zTop - ry), color)));
    u += glyph[0].length + 1;
  }
}

export const textWidth = (text: string) => [...text].reduce((w, ch) => w + (ch === " " ? 3 : (FONT[ch]?.[0].length ?? 0) + 1), -1);

/** Pointed (Ottoman-style) arch outline from u0 to u1, straight sides up to zs, apex at za. */
function archPoints(at: At, u0: number, u1: number, z0: number, zs: number, za: number): P3[] {
  const mid = (u0 + u1) / 2;
  const pts: P3[] = [at(u0, z0), at(u0, zs)];
  for (let t = 0.1; t <= 1.001; t += 0.1) pts.push(at(u0 + (mid - u0) * (1 - Math.cos((t * Math.PI) / 2)), zs + (za - zs) * Math.sin((t * Math.PI) / 2)));
  for (let t = 0.9; t >= -0.001; t -= 0.1) pts.push(at(u1 - (u1 - mid) * (1 - Math.cos((t * Math.PI) / 2)), zs + (za - zs) * Math.sin((t * Math.PI) / 2)));
  pts.push(at(u1, z0));
  return pts;
}

/** Equirectangular world, one cell per world unit. */
const WORLD = [
  "...........##.........#####......",
  "..######..####...##############..",
  ".#########..##..################.",
  "..########.....####.############.",
  "...######......#####..#########..",
  "....####.......######..######....",
  ".....###.......######...###.##...",
  "......###.......#####....#..#....",
  ".......####.....####.........##..",
  ".......#####.....###........###..",
  "........####.....##.......#####..",
  "........###...............####...",
  "........##.......................",
  ".........#.......................",
];

/** Bodybuilder flexing, front double biceps. */
const FLEX = [
  ".....##.....",
  ".....##.....",
  "##..####..##",
  "###.####.###",
  ".##########.",
  "..########..",
  "...######...",
  "...######...",
  "....####....",
  "....#..#....",
  "...##..##...",
  "...#....#...",
  "..##....##..",
];

/** Every wall decoration, drawn from its left edge `u0` on whichever wall it hangs. */
export function drawWallItem(iso: Iso, id: string, at: At, wall: "L" | "R", u0: number, locked: boolean) {
  const g = (c: string) => (locked ? greyOf(c) : c);
  const Q = (a: number, z0: number, b: number, z1: number, fill: string, edge?: string) =>
    iso.quad([at(a, z0), at(b, z0), at(b, z1), at(a, z1)], g(fill), edge ? g(edge) : undefined);
  const LN = (a: number, z0: number, b: number, z1: number, c: string) => iso.line(at(a, z0), at(b, z1), g(c));
  const PX = (u: number, z: number, c: string, w = 1, h = 1) => iso.dot(at(u, z), g(c), w, h);
  const CIRC = (cu: number, cz: number, rr: number, c: string, edge?: string, n = 24) => iso.circle(at, cu, cz, rr, g(c), edge ? g(edge) : undefined, n);
  /** A box sticking out of the wall: along the wall `w`, out of the wall `d`, height `h`. */
  const BX = (u: number, z: number, w: number, d: number, h: number, c: string, top?: string) =>
    wall === "R" ? iso.box(u, 0, z, w, d, h, g(c), top ? { top: g(top) } : {}) : iso.box(0, u, z, d, w, h, g(c), top ? { top: g(top) } : {});
  const out = (u: number, d: number, z: number): P3 => (wall === "R" ? [u, d, z] : [d, u, z]);
  const TEXT = (u: number, z: number, text: string, c: string, glow?: string) => neonText(iso, at, u, z, text, g(c), glow ? g(glow) : undefined);
  const u = u0;
  switch (id) {
    case "clock":
      CIRC(u + 7, 56, 6.5, "#f5f5f5", "#333333");
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        PX(u + 7 + Math.cos(a) * 5.2 - 0.5, 56 + Math.sin(a) * 5.2 + 0.5, k % 3 ? "#9a9a9a" : "#333333");
      }
      LN(u + 7, 56, u + 7, 60.5, "#222222");
      LN(u + 7, 56, u + 10, 56, "#c0392b");
      break;
    case "nozero":
      Q(u, 34, u + 18, 58, "#16161a", "#000000");
      TEXT(u + 2, 55, "NO", "#ffffff");
      TEXT(u + 2, 48, "ZERO", "#ffd23f");
      TEXT(u + 2, 41, "DAYS", "#ffffff");
      break;
    case "nazar": {
      // a cord with blue beads, then the glass eye: dark blue, white, light blue, black, with a shine
      LN(u + 6, 64, u + 6, 54, "#7a5f12");
      for (const zz of [61.5, 58.5]) CIRC(u + 6, zz, 0.9, "#2e86de", undefined, 10);
      CIRC(u + 6, 47, 6.2, "#0f2f8f", "#081a52");
      CIRC(u + 6, 47, 4.7, "#f4f8ff");
      CIRC(u + 6, 47, 3.3, "#4aa8f0");
      CIRC(u + 6, 47, 1.7, "#0b0b12");
      PX(u + 3.6, 49.8, "#ffffff");
      LN(u + 2.4, 48, u + 3.4, 50.6, "#cfe4ff");
      // tassel
      LN(u + 6, 40.8, u + 6, 37, "#2e86de");
      LN(u + 5.5, 37.5, u + 5, 35, "#2e86de");
      LN(u + 6.5, 37.5, u + 7, 35, "#2e86de");
      break;
    }
    case "calligraphy":
      Q(u, 34, u + 28, 54, "#c9a227", "#7a5f12");
      Q(u + 2, 36, u + 26, 52, "#123d2b");
      LN(u + 4, 42, u + 23, 42, "#e8c25a");
      LN(u + 6, 42, u + 6, 48, "#e8c25a");
      LN(u + 11, 42, u + 11, 46, "#e8c25a");
      LN(u + 15, 42, u + 15, 49, "#e8c25a");
      LN(u + 19, 42, u + 21, 47, "#e8c25a");
      LN(u + 8, 39, u + 17, 39, "#e8c25a");
      PX(u + 12, 44, "#e8c25a");
      break;
    case "corkboard":
      Q(u, 34, u + 24, 54, "#7a4b2a", "#4a2f1c");
      Q(u + 1.5, 35.5, u + 22.5, 52.5, "#c49a6c");
      for (const [a, z, c] of [[3, 44, "#ffe066"], [11, 46, "#9be7ff"], [16, 38, "#ffadad"], [5, 37, "#caffbf"]] as [number, number, string][]) {
        Q(u + a, z, u + a + 5, z + 5, c);
        LN(u + a + 1, z + 3, u + a + 4, z + 3, "#8a7f68");
        PX(u + a + 2, z + 4.5, "#d63031");
      }
      break;
    case "mirror":
      Q(u, 24, u + 14, 62, "#c9a227", "#7a5f12");
      Q(u + 1.5, 25.5, u + 12.5, 60.5, "#cfe6f2");
      LN(u + 3, 40, u + 8, 55, "#ffffff");
      LN(u + 5, 34, u + 10, 50, "#e8f5fb");
      break;
    case "dartboard":
      CIRC(u + 7, 48, 6.6, "#1a1a1a");
      for (let k = 0; k < 20; k++) {
        const a0 = (k / 20) * Math.PI * 2, a1 = ((k + 1) / 20) * Math.PI * 2;
        iso.quad([at(u + 7, 48), at(u + 7 + Math.cos(a0) * 5.4, 48 + Math.sin(a0) * 5.4), at(u + 7 + Math.cos(a1) * 5.4, 48 + Math.sin(a1) * 5.4)], g(k % 2 ? "#f1e6c8" : "#1a1a1a"));
      }
      CIRC(u + 7, 48, 1.4, "#2e8b57");
      CIRC(u + 7, 48, 0.7, "#d63031");
      LN(u + 9, 50, u + 12, 53, "#f39c12");
      break;
    case "madinah":
      Q(u, 30, u + 22, 58, "#f5f5f5", "#555555");
      Q(u + 2, 32, u + 20, 56, "#9fd0ef");
      Q(u + 2, 32, u + 20, 40, "#e9dfc9");
      iso.quad(archPoints(at, u + 6.5, u + 15.5, 40, 42, 49), g("#2e9e57"));
      Q(u + 16, 40, u + 18, 54, "#e9dfc9");
      LN(u + 11, 49, u + 11, 51.5, "#d4af37");
      break;
    case "istanbul": {
      Q(u, 32, u + 30, 56, "#3a2a20", "#1d140f");
      Q(u + 1.5, 46, u + 28.5, 54.5, "#f6b26b");
      Q(u + 1.5, 39, u + 28.5, 46, "#e07a5f");
      Q(u + 1.5, 33.5, u + 28.5, 39, "#3d5a80");
      const dark = "#2a1f2d";
      Q(u + 3, 39, u + 13, 42, dark);
      iso.quad(archPoints(at, u + 5, u + 11, 42, 42, 46), g(dark));
      LN(u + 4, 39, u + 4, 47, dark);
      LN(u + 12, 39, u + 12, 47, dark);
      Q(u + 19, 39, u + 22, 49, dark);
      iso.quad(archPoints(at, u + 18.5, u + 22.5, 49, 49, 53), g(dark));
      LN(u + 24, 39, u + 28, 39, dark);
      CIRC(u + 25, 50, 1.6, "#ffe6a8");
      break;
    }
    case "bluemosque":
      Q(u, 32, u + 24, 56, "#f5f5f5", "#555555");
      Q(u + 1.5, 33.5, u + 22.5, 54.5, "#b9dcf2");
      Q(u + 4, 33.5, u + 20, 40, "#7f93b5");
      iso.quad(archPoints(at, u + 7, u + 17, 40, 41, 47), g("#7f93b5"));
      for (const m of [3, 6, 18, 21]) LN(u + m, 33.5, u + m, 50, "#6a7ea0");
      PX(u + 11.5, 47.5, "#d4af37");
      break;
    case "plantshelf": {
      // floating walnut shelf with three pots; the pothos trails down
      BX(u, 42, 24, 5, 1.6, "#6b4426", "#7a4f2c");
      const pots: [number, string][] = [[2, "#e8e2d4"], [10, "#c0623a"], [18, "#2b2b2e"]];
      for (const [a, c] of pots) BX(u + a, 43.6, 4, 3.6, 4, c);
      // pothos (left): vines hanging over the edge
      for (const [du, len] of [[2.5, 13], [4, 9], [5.5, 16]] as [number, number][])
        for (let k = 0; k < len; k += 1.4) iso.blob(out(u + du + Math.sin(k * 0.7) * 0.8, 4.2, 46 - k), 0.9, 0.7, g(k % 2.8 < 1.4 ? "#3aa34b" : "#6cc96f"));
      // small snake plant (middle)
      for (const [du, h] of [[11, 9], [12, 11], [13, 8]] as [number, number][]) iso.line(out(u + du, 2, 47.6), out(u + du, 2, 47.6 + h), g("#2f6b34"));
      // succulent (right)
      for (let k = 0; k < 6; k++) iso.blob(out(u + 19 + (k % 3) * 0.9, 2.2, 48.6 + Math.floor(k / 3) * 1.1), 1, 0.7, g(k % 2 ? "#8fbf8a" : "#6aa86a"));
      break;
    }
    case "worldmap": {
      Q(u, 32, u + 36, 56, "#2b2b2e", "#111111");
      Q(u + 1.5, 33.5, u + 34.5, 54.5, "#1f5f99");
      for (let z = 37; z < 54; z += 4) LN(u + 1.5, z, u + 34.5, z, "#2a6ba5");
      for (let a = 5; a < 34; a += 5) LN(u + a, 33.5, u + a, 54.5, "#2a6ba5");
      WORLD.forEach((row, r) =>
        [...row].forEach((ch, c) => {
          if (ch !== "#") return;
          const z = 53.5 - r * 1.4;
          PX(u + 2 + c, z, r < 2 ? "#dfe8ec" : (r + c) % 3 ? "#6fbf73" : "#5aa95e", 1, 1.4);
        }),
      );
      // pins: Istanbul, Makkah, home
      for (const [a, z, c] of [[21, 48.5, "#e74c3c"], [22.5, 45.6, "#f1c40f"], [8, 48.5, "#ffffff"]] as [number, number, string][]) PX(u + a, z, c);
      break;
    }
    case "shelf":
      BX(u, 44, 14, 5, 2, "#7a4b2a");
      BX(u + 2, 46, 3, 3, 5, "#e0b33a");
      BX(u + 7, 46, 2, 2, 7, "#c9ccd2");
      BX(u + 10, 46, 3, 3, 4, "#cd7f32");
      break;
    case "guitar":
      LN(u + 6, 44, u + 6, 64, "#3a2a20");
      Q(u + 5, 62, u + 7, 66, "#2b2b2e");
      CIRC(u + 6, 36, 5, "#c27c3a", "#5a3415");
      CIRC(u + 6, 43, 3.6, "#c27c3a", "#5a3415");
      CIRC(u + 6, 39, 1.4, "#1d140f");
      LN(u + 6, 32, u + 6, 46, "#e8e2d4");
      break;
    case "ioniqposter": {
      // the Ioniq 5 from behind at night: boxy white hatch, black glass, the full-width
      // black band with the parametric pixel tail lights glowing red, and their reflection
      Q(u, 30, u + 26, 60, "#07090d", "#000000");
      Q(u + 1, 31, u + 25, 35, "#10131a");
      for (const a of [5, 8, 18, 21]) LN(u + a, 33.5, u + a + 0.6, 31.5, "#5a0f12");
      Q(u + 5.5, 34.5, u + 8.5, 37, "#0d0d0f");
      Q(u + 17.5, 34.5, u + 20.5, 37, "#0d0d0f");
      Q(u + 4, 36.5, u + 22, 39, "#2b2f36");
      Q(u + 4, 39, u + 22, 49, "#eef1f4");
      Q(u + 4, 39, u + 5, 49, "#d4d9de");
      Q(u + 21, 39, u + 22, 49, "#d4d9de");
      Q(u + 5, 49, u + 21, 50.5, "#d9dde2");
      Q(u + 6, 50.5, u + 20, 55.5, "#141a22");
      Q(u + 6, 55.5, u + 20, 56.5, "#0d0d0f");
      LN(u + 7, 55, u + 11, 51, "#2d3846");
      Q(u + 4.5, 43, u + 21.5, 46.5, "#0f1114");
      const lights: [number, number][] = [[0, 0], [1.3, 0], [2.6, 0], [0, 1.3], [1.3, 1.3], [0, 2.6]];
      for (const side of [0, 1])
        for (const [du, dz] of lights) {
          const pu = side ? u + 20.3 - du : u + 4.9 + du, pz = 43.4 + dz;
          iso.blob(at(pu + 0.5, pz + 0.5), 1.4, 1.4, g("#ff1f1f30"));
          PX(pu, pz, "#ff3a3a", 1, 1);
        }
      for (let a = 8.5; a < 17.5; a += 1.3) PX(u + a, 44.7, "#7a1418", 0.8, 0.6);
      PX(u + 12.6, 47.6, "#c9ccd2", 0.8, 0.8);
      TEXT(u + 3.5, 58.8, "IONIQ", "#eef1f4");
      PX(u + 23, 54.8, "#eef1f4", 1, 1);
      break;
    }
    case "vinylwall":
      for (let k = 0; k < 6; k++) {
        const cu = u + 5 + (k % 3) * 10, cz = 54 - Math.floor(k / 3) * 11;
        CIRC(cu, cz, 4.4, "#141414", "#000000");
        CIRC(cu, cz, 3, "#1d1d1d");
        CIRC(cu, cz, 1.6, ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71", "#ff4fc3", "#ecf0f1"][k]);
      }
      break;
    case "neon":
      Q(u, 38, u + 26, 56, "#1b1b24", "#0d0d12");
      TEXT(u + 3, 53, "DISCI", "#ffd1f2", "#ff4fc355");
      TEXT(u + 3, 46, "PLINE", "#ffd1f2", "#ff4fc355");
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
      PX(u + 37, 29.5, "#ff3b3b");
      break;

    // ---- faith ----
    case "quranshelf": {
      BX(u, 40, 22, 5, 1.6, "#6b4426", "#7a4f2c");
      const books: [number, number, string][] = [[1, 9, "#1f6b45"], [3, 10, "#7a1f2b"], [5, 8.5, "#1d3557"], [7, 9.5, "#1f6b45"]];
      for (const [a, h, c] of books) {
        BX(u + a, 41.6, 1.8, 4, h, c);
        iso.line(out(u + a + 0.9, 4, 43), out(u + a + 0.9, 4, 41.6 + h - 1.5), g("#c9a227"));
      }
      // mushaf on a small stand, front cover facing out
      BX(u + 12, 41.6, 8, 3, 1, "#7a4b2a");
      iso.quad([out(u + 12.5, 3.5, 42.6), out(u + 19.5, 3.5, 42.6), out(u + 19.5, 2, 52), out(u + 12.5, 2, 52)], g("#1f6b45"), g("#0f3a26"));
      iso.quad([out(u + 14, 3.2, 44.5), out(u + 18, 3.2, 44.5), out(u + 18, 2.4, 50), out(u + 14, 2.4, 50)], g("#c9a227"));
      iso.quad([out(u + 14.8, 3.1, 45.5), out(u + 17.2, 3.1, 45.5), out(u + 17.2, 2.5, 49), out(u + 14.8, 2.5, 49)], g("#1f6b45"));
      break;
    }
    case "mihrab": {
      iso.quad(archPoints(at, u, u + 26, 18, 48, 66), g("#c9a227"), g("#7a5f12"));
      iso.quad(archPoints(at, u + 2, u + 24, 20, 48, 63), g("#0f4d33"));
      iso.quad(archPoints(at, u + 5, u + 21, 20, 46, 58), g("#1f6b45"));
      // tile stars
      for (let z = 23; z < 44; z += 5)
        for (let a = 7; a < 20; a += 4) {
          PX(u + a, z, "#e8c25a");
          PX(u + a + 2, z + 2.5, "#3fa37a");
        }
      // hanging lamp
      LN(u + 13, 57, u + 13, 50, "#c9a227");
      iso.quad(archPoints(at, u + 11, u + 15, 45, 47, 50), g("#e8c25a"), g("#7a5f12"));
      PX(u + 12.5, 46, "#fff3c4");
      break;
    }
    case "ayatkursi": {
      Q(u, 32, u + 30, 60, "#c9a227", "#7a5f12");
      Q(u + 1.5, 33.5, u + 28.5, 58.5, "#0f4d33");
      CIRC(u + 15, 46, 10, "#13603f", "#e8c25a", 32);
      // flowing thuluth-like strokes around the circle, and a centre knot
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const r1 = 7.5, r2 = 9;
        LN(u + 15 + Math.cos(a) * r1, 46 + Math.sin(a) * r1, u + 15 + Math.cos(a + 0.25) * r2, 46 + Math.sin(a + 0.25) * r2, "#e8c25a");
        PX(u + 15 + Math.cos(a + 0.12) * 6, 46 + Math.sin(a + 0.12) * 6, "#e8c25a");
      }
      LN(u + 10, 46, u + 20, 46, "#e8c25a");
      LN(u + 12, 43, u + 12, 50, "#e8c25a");
      LN(u + 15, 42, u + 15, 51, "#e8c25a");
      LN(u + 18, 43, u + 19.5, 49, "#e8c25a");
      for (const [a, z] of [[4, 36], [26, 36], [4, 56], [26, 56]]) PX(u + a - 0.5, z, "#e8c25a");
      break;
    }

    // ---- gym ----
    case "p-lightweight":
      Q(u, 30, u + 26, 58, "#ffd23f", "#8a6a00");
      Q(u + 1.5, 31.5, u + 24.5, 56.5, "#ffe066");
      TEXT(u + 3, 54, "LIGHT", "#1a1a1a");
      TEXT(u + 1.5, 47, "WEIGHT", "#1a1a1a");
      TEXT(u + 3.5, 40, "BABY!", "#c0392b");
      LN(u + 3, 33.5, u + 23, 33.5, "#1a1a1a");
      break;
    case "p-anatomy": {
      Q(u, 30, u + 20, 60, "#f2ead8", "#8a7f68");
      const m = "#c0392b", d = "#8e2a20", sk = "#e6b8a2";
      iso.quad([at(u + 8.5, 56), at(u + 11.5, 56), at(u + 11.5, 53), at(u + 8.5, 53)], g(sk));
      Q(u + 5, 44, u + 15, 52, m, d);
      LN(u + 10, 44, u + 10, 52, d);
      LN(u + 5, 48.5, u + 15, 48.5, d);
      for (const z of [37, 39.5, 42]) {
        Q(u + 7.5, z, u + 9.7, z + 2, m, d);
        Q(u + 10.3, z, u + 12.5, z + 2, m, d);
      }
      Q(u + 2.5, 41, u + 5, 51, m, d);
      Q(u + 15, 41, u + 17.5, 51, m, d);
      Q(u + 6.5, 31.5, u + 9.5, 37, m, d);
      Q(u + 10.5, 31.5, u + 13.5, 37, m, d);
      break;
    }
    case "p-silhouette": {
      Q(u, 30, u + 22, 60, "#2a1a3a", "#120a1a");
      const bands = ["#ff9f43", "#ff7f50", "#e85d75", "#9b4dca", "#4b3a8a"];
      bands.forEach((c, k) => Q(u + 1.5, 31.5 + k * 5.4, u + 20.5, 31.5 + (k + 1) * 5.4, c));
      CIRC(u + 11, 40, 4, "#ffd27a");
      FLEX.forEach((row, r) => [...row].forEach((ch, c) => ch === "#" && PX(u + 5 + c, 52 - r * 1.5, "#120a14", 1, 1.5)));
      break;
    }
    case "p-nopain":
      Q(u, 38, u + 28, 58, "#16141a", "#0a090c");
      TEXT(u + 6, 55, "STAY", "#ffd6d6", "#ff2a2a66");
      TEXT(u + 6, 47.5, "HARD", "#ffd6d6", "#ff2a2a66");
      LN(u + 3, 40.5, u + 25, 40.5, "#ff2a2a");
      break;
    case "gymmirror":
      Q(u, 6, u + 48, 64, "#1d1d20", "#000000");
      Q(u + 1.5, 7.5, u + 46.5, 62.5, "#b9d6e2");
      for (const [a, b] of [[6, 18], [10, 22], [26, 38], [31, 42]]) LN(u + a, 10, u + b, 60, "#dbeef5");
      LN(u + 16, 7.5, u + 16, 62.5, "#1d1d20");
      LN(u + 32, 7.5, u + 32, 62.5, "#1d1d20");
      break;
  }
}

export function greyOf(c: string) {
  const v = parseInt(c.slice(1, 3), 16) * 0.3 + parseInt(c.slice(3, 5), 16) * 0.59 + parseInt(c.slice(5, 7), 16) * 0.11;
  const h = Math.round(v * 0.55).toString(16).padStart(2, "0");
  return `#${h}${h}${h}${c.length > 7 ? c.slice(7, 9) : ""}`;
}

export { shade };
