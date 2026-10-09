import { mkdirSync, writeFileSync } from "node:fs";
import { Raster } from "../src/game/raster";
import { ALL_POSES, AVATAR_H, AVATAR_W, renderAvatar } from "../src/game/sprites/avatar";
import { toPNG } from "./png";

const sheet = new Raster((AVATAR_W + 4) * ALL_POSES.length, (AVATAR_H + 4) * 2);
(["front", "back"] as const).forEach((facing, row) =>
  ALL_POSES.forEach((pose, i) => sheet.blit(renderAvatar(facing, pose), i * (AVATAR_W + 4) + 2, row * (AVATAR_H + 4) + 2)),
);
mkdirSync(".preview", { recursive: true });
writeFileSync(".preview/avatar-sheet.png", toPNG(sheet, 6, [190, 210, 225]));
console.log("wrote .preview/avatar-sheet.png");
import { renderPony } from "../src/game/sprites/pony";
writeFileSync(".preview/pony.png", toPNG(renderPony(), 8, [190, 210, 225]));
import { buildBackground, buildPiece, ROOM_W, ROOM_H } from "../src/game/furniture";
import { sceneDrawables } from "../src/game/scene";
import { lockedCopy } from "../src/game/iso";

for (const [name, gloomy, hour] of [["room", false, 12], ["room-gloomy", true, 22]] as const) {
  const room = new Raster(ROOM_W, ROOM_H);
  room.blit(buildBackground(hour), 0, 0);
  const owned = (["plant", "lamp", "bookshelf", "tv", "sofa", "aquarium", "arcade", "car", "pony"] as const).map((itemId) => ({ itemId, locked: gloomy && itemId === "tv" }));
  for (const d of sceneDrawables({ owned, gloomy, avatar: { fx: 5, fy: 3, facing: "front", pose: gloomy ? "sad" : "pray", mirror: false } })) {
    if (d.kind === "piece") {
      const s = d.locked ? lockedCopy(buildPiece(d.id)) : buildPiece(d.id);
      room.blit(s.r, d.x - s.ax, d.y - s.ay);
    } else if (d.kind === "avatar") room.blit(renderAvatar(d.view.facing, d.view.pose), d.x, d.y, d.view.mirror);
  }
  writeFileSync(`.preview/${name}.png`, toPNG(room, 3, [40, 44, 60]));
}
