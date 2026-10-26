import { Raster, gridRaster, paintGrid, rgba, scale2x } from "../raster";

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
  "...KHHHHsSSSSSSSSSSSSSSSSSSSSK..",
  "...KHHHHsSSSSSSSSSSSSSSSSSSSSK..",
  "...KHHHsSSSSSSSSSSSSSSSSSSSSSK..",
  "..KHHssrsSSSSSSSSSSSSSSSSSSSSK..",
  "..KHsrrsSSSsSSSSSSSSSSsSSSSSSK..",
  "..KHsrssSSSSSSSSSSSssSSSSSSSSK..",
  "...KHssSSSSSSSSSSSSSSSSSSSSSK...",
  "...KKsSSSSSSSSSSSSSSSSSSSSSSK...",
  "....KsSSSSSSSSSSSSSSSSSSSSSK....",
  "....KTsSSSSSSSSTTSSSSTTSSSSSK...",
  "....KTTsSSSSSSSTSSSSTSSSSSTK....",
  "....KTTTsSSSSSSTTTTTTSSSSTTK....",
  ".....KTTTTSSSSSSSSSSSSSTTTK.....",
  "......KTTTTTSSSSSSSSTTTTTK......",
  ".......KKTTTTTTTTTTTTTTKK.......",
  "........KKKrsSSSSSSSSsrKKK......",
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

const FACE: Record<string, string> = {
  ...COLORS, L: "#2a1810", e: "#9a6a44", n: "#a06a50", G: "#f8dcc0", w: "#ffffff",
};

const EYE_L = ["..LLLLLL..", ".LLWWWWLL.", "LWWEEeEWWL", ".WWEEEEWW.", "..ssssss.."];
const EYE_R = ["..LLLLL.", ".LWWWWLL", "LWEEeEWL", ".WEEEEW.", "..ssss.."];
const BROW_L = ["...BBBBBBB", ".BBBBBBBBB", "BBBB......"];
const BROW_R = ["BBBBBBB..", "BBBBBBBB.", "......BBB"];
const NOSE = ["....s", "....s", "...ss", "...sr", "..srr", ".rnnr"];
const MOUTH = ["..MMMMMMMM..", ".MMMMMMMMMM.", "..mmmmmmmm..", "....mmmm...."];

/** 64×72 head-and-shoulders portrait for the header: the bust upscaled, with a hand-drawn 2× face. */
export function renderPortrait(): Raster {
  const r = scale2x(gridRaster(PORTRAIT, COLORS));
  const skin = [rgba(COLORS.S), rgba(COLORS.s)];
  const isSkin = (x: number, y: number) => {
    const i = (y * r.w + x) * 4;
    return r.data[i + 3] === 255 && skin.some(([a, b, c]) => r.data[i] === a && r.data[i + 1] === b && r.data[i + 2] === c);
  };
  // beard shadow on the jaw, chin and upper lip
  for (let y = 40; y < 60; y++)
    for (let x = 8; x < 58; x++) {
      if (!isSkin(x, y)) continue;
      const lip = y >= 43 && y <= 45 && x >= 30 && x <= 44;
      if (!(y >= 47 || lip || x < 16 || x > 50)) continue;
      const h = (Math.imul(x + 31, 73856093) ^ Math.imul(y + 17, 19349663)) >>> 0;
      r.set(x, y, h % 100 < 14 ? "#cfa784" : "#e0bb98");
    }
  for (const [x, y] of [[47, 37], [48, 37], [49, 37], [48, 36], [49, 36]]) if (isSkin(x, y)) r.set(x, y, FACE.G);
  paintGrid(r, BROW_L, FACE, 22, 27);
  paintGrid(r, BROW_R, FACE, 42, 27);
  paintGrid(r, EYE_L, FACE, 21, 31);
  paintGrid(r, EYE_R, FACE, 42, 31);
  paintGrid(r, NOSE, FACE, 35, 36);
  paintGrid(r, MOUTH, FACE, 31, 46);
  return r;
}
export const PORTRAIT_ROWS = PORTRAIT;
