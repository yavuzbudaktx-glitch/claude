import { mkdirSync, writeFileSync } from "node:fs";
import { CATALOG, DEFAULT_EQUIPPED } from "../src/engine/catalog";
import { createInitialState } from "../src/engine/engine";
import { autoPlace } from "../src/engine/placement";
import { autoWall } from "../src/engine/wall";
import type { GameState } from "../src/engine/types";
import { buildBackground, buildPiece, hasPiece } from "../src/game/furniture";
import { lockedCopy } from "../src/game/iso";
import { Raster } from "../src/game/raster";
import { roomLayout, sceneDrawables } from "../src/game/scene";
import { renderAvatar, type BodyStage, type OutfitId } from "../src/game/sprites/avatar";
import { renderCat } from "../src/game/sprites/cat";
import { toPNG } from "./png";

mkdirSync(".preview", { recursive: true });

function richState(room: string, extra: Partial<GameState["equipped"]> = {}, gloomy = false): GameState {
  const s = createInitialState(new Date("2026-10-26T12:00:00"));
  s.equipped = { ...DEFAULT_EQUIPPED, room, ...extra };
  s.inventory = CATALOG.filter((c) => !c.starter).map((c, k) => ({ uid: c.id, itemId: c.id, acquiredAt: k, lockDaysLeft: 0 }));
  for (const c of CATALOG) {
    if (c.starter) continue;
    const spot = c.size ? autoPlace(s, c.id) : null;
    if (spot) s.placements.push(spot);
    const hang = autoWall(s, c.id);
    if (hang) s.wallPlacements.push(hang);
  }
  s.gloomy = gloomy;
  return s;
}

function render(s: GameState, hour: number, name: string, body: BodyStage = 0) {
  const layout = roomLayout(s);
  const r = new Raster(layout.spec.W, layout.spec.H);
  r.blit(buildBackground({ spec: layout.spec, wallpaper: s.equipped.wallpaper, floor: s.equipped.floor, hour, wallItems: layout.wallItems, curtains: layout.curtains, ledStrip: layout.ledStrip }), 0, 0);
  const avatar = { fx: 4, fy: 4, facing: "front" as const, pose: "idle" as const, mirror: false, outfit: s.equipped.outfit as OutfitId, body };
  for (const d of sceneDrawables(layout, avatar, { fx: 3, fy: 4, pose: "sit", mirror: false })) {
    if (d.kind === "piece") {
      const sp = d.piece.locked ? lockedCopy(buildPiece(d.piece.key)) : buildPiece(d.piece.key);
      const mirror = d.piece.place.rot === 1;
      r.blit(sp.r, Math.round(d.x - (mirror ? sp.r.w - 1 - sp.ax : sp.ax)), Math.round(d.y - sp.ay), mirror);
    } else if (d.kind === "avatar") r.blit(renderAvatar(d.view.facing, d.view.pose, d.view.outfit, d.view.body), Math.round(d.x), Math.round(d.y));
    else if (d.kind === "cat") {
      const c = renderCat(d.view.pose);
      r.blit(c, Math.round(d.x - c.w / 2), Math.round(d.y - c.h + 2));
    }
  }
  writeFileSync(`.preview/${name}.png`, toPNG(r, 2, [40, 44, 60]));
  return s;
}

render(richState("room-studio"), 12, "room-studio");
render(richState("room-apartment", { wallpaper: "wp-brick", floor: "fl-oak", rug: "rug-red", outfit: "fit-hoodie" }), 12, "room-apartment", 2);
render(richState("room-loft", { wallpaper: "wp-wood", floor: "fl-oak", rug: "rug-blue", outfit: "fit-gym" }), 12, "room-loft", 3);
const villa = render(richState("room-villa", { wallpaper: "wp-zellige", floor: "fl-marble", rug: "rug-gold", outfit: "fit-thobe" }), 21, "room-villa", 4);
console.log("villa placed:", villa.placements.length, "wall:", villa.wallPlacements.length);

// piece sheet (incl. variants)
const keys = ["kitchen:wall", "kitchen:wall-open", "arcade", "tv", "recordplayer", "clarinet", "gymbench", "sofa", "desk", "chair", "treadmill", "bookshelf", "coffee", "aquarium", "lamp", "plant", "monstera", "rehal", "lantern", "prayerrug:rug-blue", "bed"];
const cell = 110;
const sheet = new Raster(cell * 6, cell * Math.ceil(keys.length / 6));
keys.forEach((k, i) => {
  if (!hasPiece(k.split(":")[0])) return;
  const sp = buildPiece(k);
  sheet.blit(sp.r, (i % 6) * cell + Math.round((cell - sp.r.w) / 2), Math.floor(i / 6) * cell + Math.round((cell - sp.r.h) / 2));
});
writeFileSync(".preview/catalog.png", toPNG(sheet, 2, [215, 220, 230]));
console.log("previews written");
