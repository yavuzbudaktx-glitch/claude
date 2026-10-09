import { gridRaster } from "../raster";
import { PONY_PALETTE } from "./palette";

/** Side-view pony facing right, tan with a cream mane like the reference. */
export const PONY = [
  "..................K.K.....",
  ".................KBKBK....",
  "................KMBBBBK...",
  "...............KMMBBEBBK..",
  "..............KMMBBBBBBBK.",
  ".............KMMBBBBBBBBBK",
  "............KMMBBBKKBBBnnK",
  "...........KMMBBBK.KKBnnK.",
  "..........KMMBBBK...KKKK..",
  "..KKK....KmMBBBBK.........",
  ".KMMMKKKKBBBBBBBBK........",
  "KMMmKBBBBBBBBBBBBK........",
  "KMMKBBBBBBBBBBBBBK........",
  "KMmKBBBBBBBBBBBBsK........",
  "KMKsBBBBBBBBBBBssK........",
  ".KKsBBBBBBBBBBBsK.........",
  "..KsBBKKKKKKKKBBK.........",
  "..KBBK.......KBBK.........",
  "..KBBK.......KBBK.........",
  "..KBsK.......KBsK.........",
  "..KHHK.......KHHK.........",
  "..KKKK.......KKKK.........",
];

export const renderPony = () => gridRaster(PONY, PONY_PALETTE);
