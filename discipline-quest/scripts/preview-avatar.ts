import { mkdirSync, writeFileSync } from "node:fs";
import { Raster } from "../src/game/raster";
import { ALL_OUTFITS, ALL_POSES, AVATAR_H, AVATAR_W, renderAvatar, type BodyStage } from "../src/game/sprites/avatar";
import { toPNG } from "./png";

mkdirSync(".preview", { recursive: true });
// every pose (coat)
const poses = new Raster((AVATAR_W + 2) * ALL_POSES.length, AVATAR_H + 2);
ALL_POSES.forEach((pose, i) => poses.blit(renderAvatar("front", pose, "fit-coat", 0), i * (AVATAR_W + 2) + 1, 1));
writeFileSync(".preview/avatar-poses.png", toPNG(poses, 3, [190, 210, 225]));
// body stages × outfits
const stages: BodyStage[] = [0, 1, 2, 3, 4];
const sheet = new Raster((AVATAR_W + 2) * stages.length, (AVATAR_H + 2) * ALL_OUTFITS.length);
ALL_OUTFITS.forEach((fit, row) => stages.forEach((st, i) => sheet.blit(renderAvatar("front", "idle", fit, st), i * (AVATAR_W + 2) + 1, row * (AVATAR_H + 2) + 1)));
writeFileSync(".preview/avatar-bodies.png", toPNG(sheet, 3, [190, 210, 225]));
