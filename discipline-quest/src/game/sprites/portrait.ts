import { gridRaster } from "../raster";

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
  "...KHHHHsSSSBBBBBSSSSSBBBBBSSK..",
  "...KHHHHsSSSSSSSSSSSSSSSSSSSSK..",
  "...KHHHsSSSKKKKKSSSSSKKKKKSSSK..",
  "..KHHssrsSWWEEEWSSSSSWWEEWSSSK..",
  "..KHsrrsSSSsSSSSSSSSSSsSSSSSSK..",
  "..KHsrssSSSSSSSSSSSssSSSSSSSSK..",
  "...KHssSSSSSSSSSSSSrsSSSSSSSK...",
  "...KKsSSSSSSSSSSSSrrssSSSSSSK...",
  "....KsSSSSSSSSSSSSSSSSSSSSSK....",
  "....KTsSSSSSSSSTTMMMMTTSSSSSK...",
  "....KTTsSSSSSSSTSmmSTSSSSTK.....",
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

export const renderPortrait = () => gridRaster(PORTRAIT, COLORS);
export const PORTRAIT_ROWS = PORTRAIT;
