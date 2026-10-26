import { mkdirSync, writeFileSync } from "node:fs";
import { Raster } from "../src/game/raster";
import { ALL_OUTFITS, ALL_POSES, AVATAR_H, AVATAR_W, renderAvatar } from "../src/game/sprites/avatar";
import { toPNG } from "./png";

const cols = ALL_POSES.length + 1;
const sheet = new Raster((AVATAR_W + 2) * cols, (AVATAR_H + 2) * ALL_OUTFITS.length);
ALL_OUTFITS.forEach((fit, row) => {
  ALL_POSES.forEach((pose, i) => sheet.blit(renderAvatar("front", pose, fit), i * (AVATAR_W + 2) + 1, row * (AVATAR_H + 2) + 1));
  sheet.blit(renderAvatar("back", "idle", fit), ALL_POSES.length * (AVATAR_W + 2) + 1, row * (AVATAR_H + 2) + 1);
});
mkdirSync(".preview", { recursive: true });
writeFileSync(".preview/avatar-v2.png", toPNG(sheet, 4, [190, 210, 225]));
const big = new Raster(AVATAR_W, AVATAR_H);
big.blit(renderAvatar("front", "idle"), 0, 0);
writeFileSync(".preview/avatar-big.png", toPNG(big, 12, [190, 210, 225]));
