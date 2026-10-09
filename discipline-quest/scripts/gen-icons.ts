import { mkdirSync, writeFileSync } from "node:fs";
import { Raster } from "../src/game/raster";
import { renderAvatar } from "../src/game/sprites/avatar";
import { toPNG } from "./png";

/** App icon: the avatar's head and shoulders on the app's blue, pixel-scaled. */
function icon(size: number, padFrac: number) {
  const avatar = renderAvatar("front", "idle");
  const crop = new Raster(24, 26);
  for (let y = 0; y < 26; y++) crop.data.set(avatar.data.subarray(y * 24 * 4, (y + 1) * 24 * 4), y * 24 * 4);
  const grid = 32;
  const canvas = new Raster(grid, grid);
  canvas.rect(0, 0, grid, grid, "#2f6fb0");
  canvas.rect(0, grid - 8, grid, 8, "#26598e");
  const pad = Math.round(grid * padFrac);
  canvas.blit(crop, Math.floor((grid - 24) / 2), grid - 26 + Math.max(0, pad - 4));
  return toPNG(canvas, Math.round(size / grid));
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192, 0));
writeFileSync("public/icons/icon-512.png", icon(512, 0));
writeFileSync("public/icons/icon-maskable-512.png", icon(512, 0.1));
writeFileSync("public/icons/apple-touch-icon.png", icon(192, 0));
console.log("icons written");
