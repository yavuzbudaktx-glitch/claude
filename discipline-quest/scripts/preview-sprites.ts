import { mkdirSync, writeFileSync } from "node:fs";
import { CATALOG, DEFAULT_EQUIPPED } from "../src/engine/catalog";
import { createInitialState } from "../src/engine/engine";
import type { GameState } from "../src/engine/types";
import { buildBackground, buildPiece, hasPiece } from "../src/game/furniture";
import { lockedCopy } from "../src/game/iso";
import { Raster } from "../src/game/raster";
import { roomLayout, sceneDrawables } from "../src/game/scene";
import { renderAvatar } from "../src/game/sprites/avatar";
import { renderCat } from "../src/game/sprites/cat";
import { toPNG } from "./png";

mkdirSync(".preview", { recursive: true });

function richState(room: string, extra: Partial<GameState["equipped"]> = {}, gloomy = false): GameState {
  const s = createInitialState(new Date("2026-10-26T12:00:00"));
  s.inventory = CATALOG.filter((c) => !c.starter).map((c, k) => ({ uid: c.id, itemId: c.id, acquiredAt: k, lockDaysLeft: 0 }));
  s.equipped = { ...DEFAULT_EQUIPPED, room, ...extra };
  s.gloomy = gloomy;
  return s;
}

function render(s: GameState, hour: number, name: string) {
  const layout = roomLayout(s);
  const r = new Raster(layout.spec.W, layout.spec.H);
  r.blit(buildBackground({ spec: layout.spec, wallpaper: s.equipped.wallpaper, floor: s.equipped.floor, hour, wallItems: layout.wallItems }), 0, 0);
  const avatar = { fx: 4, fy: 4, facing: "front" as const, pose: "idle" as const, mirror: false, outfit: s.equipped.outfit as never };
  for (const d of sceneDrawables(layout, avatar, { fx: 3, fy: 4, pose: "sit", mirror: false })) {
    if (d.kind === "piece") {
      const sp = d.piece.locked ? lockedCopy(buildPiece(d.piece.key)) : buildPiece(d.piece.key);
      r.blit(sp.r, Math.round(d.x - sp.ax), Math.round(d.y - sp.ay));
    } else if (d.kind === "avatar") r.blit(renderAvatar(d.view.facing, d.view.pose, d.view.outfit), Math.round(d.x), Math.round(d.y));
    else if (d.kind === "cat") {
      const c = renderCat(d.view.pose);
      r.blit(c, Math.round(d.x - c.w / 2), Math.round(d.y - c.h + 2));
    }
  }
  writeFileSync(`.preview/${name}.png`, toPNG(r, 2, [40, 44, 60]));
}

render(richState("room-studio"), 12, "room-studio");
render(richState("room-apartment", { wallpaper: "wp-brick", floor: "fl-oak", rug: "rug-red", outfit: "fit-hoodie", paint: "paint-teal" }), 21, "room-apartment");
render(richState("room-penthouse", { wallpaper: "wp-zellige", floor: "fl-marble", rug: "rug-gold", outfit: "fit-thobe" }), 12, "room-penthouse");
render(richState("room-penthouse", { wallpaper: "wp-wood", floor: "fl-checker", rug: "rug-blue", outfit: "fit-suit", paint: "paint-gold" }), 22, "room-penthouse-night");

// catalog sheet
const ids = CATALOG.map((c) => (c.id === "ioniq5" ? "ioniq5:paint-white" : c.id)).filter((id) => hasPiece(id.split(":")[0]));
const cell = 110;
const sheet = new Raster(cell * 6, cell * Math.ceil(ids.length / 6));
ids.forEach((id, k) => {
  const sp = buildPiece(id);
  sheet.blit(sp.r, (k % 6) * cell + Math.round((cell - sp.r.w) / 2), Math.floor(k / 6) * cell + Math.round((cell - sp.r.h) / 2));
});
writeFileSync(".preview/catalog.png", toPNG(sheet, 2, [215, 220, 230]));
console.log("previews written");
