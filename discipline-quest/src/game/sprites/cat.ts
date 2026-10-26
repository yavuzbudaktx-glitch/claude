import { gridRaster, scale2x } from "../raster";

const C = { K: "#2a1a10", O: "#e08a3c", o: "#c06a24", W: "#f6efe4", E: "#2f6b2f", P: "#f2a0a0" };

/** Small orange tabby, facing right. Two walk frames and a sitting frame. */
const SIT = [
  "..K.K.......",
  ".KOKOK......",
  ".KOOOOK.....",
  ".KEOEOK.....",
  ".KOPOOK...K.",
  "..KWWK...KOK",
  ".KOOOOK..KOK",
  "KOoOoOOK.KK.",
  "KOOOOOOOKOK.",
  "KOoOOoOOOK..",
  ".KWKKKWKK...",
];
const WALK_A = [
  ".........K.K",
  "........KOKOK",
  "K.......KOOOK",
  "KOK.....KEOEK",
  ".KOKKKKKKOPOK",
  "..KOoOoOOOKK.",
  "..KOOOOOOOOK.",
  "..KOoOOoOOOK.",
  "..KWK.KWK.KWK",
  "..KK..KK..KK.",
];
const WALK_B = [
  ".........K.K",
  "........KOKOK",
  "........KOOOK",
  "KK......KEOEK",
  "KOKKKKKKKOPOK",
  ".KOOoOoOOOKK.",
  "..KOOOOOOOOK.",
  "..KOoOOoOOOK.",
  "...KWK.KWKKWK",
  "...KK..KK.KK.",
];

export const renderCat = (pose: "sit" | "walk1" | "walk2") => scale2x(gridRaster(pose === "sit" ? SIT : pose === "walk1" ? WALK_A : WALK_B, C));
