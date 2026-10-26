import { mkdirSync, writeFileSync } from "node:fs";
import { CATALOG } from "../src/engine/catalog";
import { buildPiece, hasPiece, wallItemPreview } from "../src/game/furniture";
import { Raster } from "../src/game/raster";
import { toPNG } from "./png";

mkdirSync(".preview", { recursive: true });
const sheet = (keys: string[], make: (k: string) => Raster, name: string, cell = 100, cols = 7) => {
  const r = new Raster(cell * cols, cell * Math.ceil(keys.length / cols));
  keys.forEach((k, i) => {
    const sp = make(k);
    r.blit(sp, (i % cols) * cell + Math.round((cell - sp.w) / 2), Math.floor(i / cols) * cell + Math.round((cell - sp.h) / 2));
  });
  writeFileSync(`.preview/${name}.png`, toPNG(r, 1, [215, 220, 230]));
};
const floor = CATALOG.filter((c) => c.size && hasPiece(c.id)).map((c) => (c.id === "kitchen" ? "kitchen:wall" : c.id));
const only = process.argv[2]?.split(",");
const pick = (ids: string[]) => (only ? ids.filter((k) => only.includes(k.split(":")[0])) : ids);
sheet(pick(floor), (k) => buildPiece(k).r, "items-floor", 170, 5);
const wall = CATALOG.filter((c) => c.wallWidth).map((c) => c.id);
sheet(pick(wall), (k) => wallItemPreview(k).r, "items-wall", 110, 6);
console.log(floor.length, "floor items,", wall.length, "wall items");
