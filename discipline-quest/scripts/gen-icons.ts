import { mkdirSync, writeFileSync } from "node:fs";
import { Raster } from "../src/game/raster";
import { renderPortrait } from "../src/game/sprites/portrait";
import { toPNG } from "./png";

/** App icon: the portrait on the app's blue, pixel-scaled. */
function icon(size: number, pad: number, grid = 48) {
  const canvas = new Raster(grid, grid);
  canvas.rect(0, 0, grid, grid, "#2f6fb0");
  canvas.rect(0, 0, grid, Math.round(grid / 3), "#3b7cc0");
  const p = renderPortrait();
  canvas.blit(p, Math.floor((grid - p.w) / 2), grid - p.h + pad);
  return toPNG(canvas, Math.round(size / grid));
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192, 0));
writeFileSync("public/icons/icon-512.png", icon(512, 0, 64));
writeFileSync("public/icons/icon-maskable-512.png", icon(512, 4, 64));
writeFileSync("public/icons/apple-touch-icon.png", icon(192, 0));
console.log("icons written");
