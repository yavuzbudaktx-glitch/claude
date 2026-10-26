import { Raster, gridRaster, paintGrid, scale2x } from "../raster";

/** 32×36 head-and-shoulders portrait for the header, drawn from your photo. */
const PORTRAIT = [
  "............KKKKKKK.............",
  ".........KKKhhhhhhhKKK..........",
  ".......KKhhhhhhHHHhhhhhKK.......",
  "......KhhhhHHHHHHHHHHhhhhK......",
  ".....KhhHHHhhhHHHHHHHHHHhhK.....",
  "....KHHHHhhHHHHHHHhhhHHHHHHK....",
  "....KHHHhHHHHHHHHHHHHHHHhHHHK...",
  "...KHHHdHHHHHHhHHHHHHHHHHHHHHK..",
  "...KHHdHHHHHHHHHHHHHHHHHHHHHHK..",
  "...KHdHHHHHHHHHHHHHHHHHHHHHHHK..",
  "...KHdHHHHHHHHHHSSSSSSSHHHHHHK..",
  "...KHHHHHHHSSSSSSSSSSSSSSHHHHK..",
  "...KHHHHHHSSSSSSSSSSSSSSSSSHHK..",
  "...KHHHHHSSSSSSSSSSSSSSSSSSSHK..",
  "...KHHHHSSSSSSSSSSSSSSSSSSSSSK..",
  "...KHHHHSSSSSSSSSSSSSSSSSSSSSK..",
  "...KHHHSSSSSSSSSSSSSSSSSSSSSSK..",
  "..KHHSSSSSSSSSSSSSSSSSSSSSSSSK..",
  "..KHSSSSSSSSSSSSSSSSSSSSSSSSSK..",
  "..KHsSSSSSSSSSSSSSSSSSSSSSSSSK..",
  "...KHSSSSSSSSSSSSSSSSSSSSSSSK...",
  "...KKSSSSSSSSSSSSSSSSSSSSSSSK...",
  "....KSSSSSSSSSSSSSSSSSSSSSSK....",
  "....KSSSSSSSSSSSSSSSSSSSSSSSK...",
  "....KsSSSSSSSSSSSSSSSSSSSSsK....",
  "....KsSSSSSSSSSSSSSSSSSSSSsK....",
  ".....KsSSSSSSSSSSSSSSSSSSsK.....",
  "......KsSSSSSSSSSSSSSSSSsK......",
  ".......KKsSSSSSSSSSSSSsKK.......",
  "........KKKsSSSSSSSSSSsKKK......",
  ".........KsSSSSSSSSSSsK.........",
  ".....KKKKNNNNNNNNNNNNNNKKKK.....",
  "...KKCCCKNNNNNNZNNNNNNNKCCCKK...",
  "..KCCxCCCKNNNNNZNNNNNNKCCCxCCK..",
  ".KCCCCCxCCKNNNNZNNNNNKCCxCCCCCK.",
  "KCCxCCCCCCKNNNNZNNNNNKCCCCCCxCCK",
];

const COLORS: Record<string, string> = {
  K: "#25170f", H: "#3a271c", h: "#634634", d: "#24170f",
  S: "#f0c9a4", s: "#d9a882", r: "#bd8a66", B: "#2b1b12",
  W: "#fbf6ee", E: "#4a2a16", M: "#a8604f", m: "#c9826f", T: "#ddb596",
  N: "#17171b", Z: "#c9ccd2", C: "#4b4b51", x: "#67676e",
};

const FACE: Record<string, string> = { ...COLORS, E: "#2a1a10", W: "#ffffff", M: "#9a5040" };

// Classic Habbo: dot eyes with a glint, thin brows, a tiny nose, a small smile. Flat skin, no shading.
const EYE = ["WEE", "EEE", "EEE", "EEE"];
const BROW = ["BBBBBB"];
const NOSE = ["s.", "ss"];
const MOUTH = ["M......M", ".MMMMMM."];

/** 64×72 head-and-shoulders portrait for the header: the bust upscaled, with a clean 2× face. */
export function renderPortrait(): Raster {
  const r = scale2x(gridRaster(PORTRAIT, COLORS));
  paintGrid(r, BROW, FACE, 23, 28);
  paintGrid(r, BROW, FACE, 42, 28);
  paintGrid(r, EYE, FACE, 25, 32);
  paintGrid(r, EYE, FACE, 44, 32);
  paintGrid(r, NOSE, FACE, 36, 39);
  paintGrid(r, MOUTH, FACE, 32, 46);
  return r;
}
export const PORTRAIT_ROWS = PORTRAIT;
