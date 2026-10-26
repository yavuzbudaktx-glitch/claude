import { CATALOG, tierOf } from "@/engine/catalog";
import { isLocked, owns } from "@/engine/engine";
import type { GameState } from "@/engine/types";
import { AVATAR_FOOT, type Facing, type OutfitId, type Pose } from "./sprites/avatar";
import { FIXED, MESS, RUG_SLOT, WALL_ITEMS, itemSlot, roomSpec, tileScreen, type Placement, type RoomSpec } from "./furniture";

export interface AvatarView {
  fx: number;
  fy: number;
  facing: Facing;
  pose: Pose;
  mirror: boolean;
  outfit: OutfitId;
  /** Lying in bed: only the head on the pillow is drawn. */
  asleep?: boolean;
}

export interface CatView {
  fx: number;
  fy: number;
  pose: "sit" | "walk1" | "walk2";
  mirror: boolean;
}

export interface PlacedPiece {
  place: Placement;
  /** Sprite key, may include a variant (rug design, car paint). */
  key: string;
  locked: boolean;
}

export interface RoomLayout {
  spec: RoomSpec;
  pieces: PlacedPiece[];
  wallItems: { id: string; locked: boolean }[];
  wallpaper: string;
  floor: string;
  gloomy: boolean;
}

/** Everything the room shows for a game state. */
export function roomLayout(s: GameState): RoomLayout {
  const tier = tierOf(s.equipped.room);
  const spec = roomSpec(tier);
  const pieces: PlacedPiece[] = FIXED.map((p) => ({ place: p, key: p.id, locked: false }));
  pieces.push({ place: RUG_SLOT, key: `rug:${s.equipped.rug}`, locked: false });
  for (const item of CATALOG) {
    if (!owns(s, item.id) || WALL_ITEMS.includes(item.id)) continue;
    const place = itemSlot(item.id, tier);
    if (!place || place.tx + place.w > spec.n || place.ty + place.d > spec.n) continue;
    const key = item.id === "ioniq5" ? `ioniq5:${s.equipped.paint}` : item.id;
    pieces.push({ place, key, locked: isLocked(s, item.id) });
  }
  if (s.gloomy) for (const m of MESS) pieces.push({ place: m, key: m.id, locked: false });
  const wallItems = WALL_ITEMS.filter((id) => owns(s, id)).map((id) => ({ id, locked: isLocked(s, id) }));
  return { spec, pieces, wallItems, wallpaper: s.equipped.wallpaper, floor: s.equipped.floor, gloomy: s.gloomy };
}

export type Drawable =
  | { kind: "piece"; piece: PlacedPiece; x: number; y: number; depth: number }
  | { kind: "avatar"; view: AvatarView; x: number; y: number; depth: number }
  | { kind: "cat"; view: CatView; x: number; y: number; depth: number }
  | { kind: "shadow"; x: number; y: number; depth: number };

/** Painter's-order list of everything in the room. Positions are where each sprite's anchor lands. */
export function sceneDrawables(layout: RoomLayout, avatar: AvatarView, cat?: CatView): Drawable[] {
  const { spec } = layout;
  const out: Drawable[] = [];
  for (const piece of layout.pieces) {
    const p = piece.place;
    const [x, y] = tileScreen(spec, p.tx, p.ty);
    const depth = p.flat ? -100 + p.tx + p.ty : p.tx + p.w - 1 + (p.ty + p.d - 1);
    out.push({ kind: "piece", piece, x, y, depth });
  }
  if (!avatar.asleep) {
    const [x, y] = tileScreen(spec, avatar.fx, avatar.fy, true);
    out.push({ kind: "shadow", x, y, depth: -50 });
    out.push({ kind: "avatar", view: avatar, x: x - AVATAR_FOOT.x, y: y - AVATAR_FOOT.y, depth: avatar.fx + avatar.fy + 0.6 });
  }
  if (cat) {
    const [x, y] = tileScreen(spec, cat.fx, cat.fy, true);
    out.push({ kind: "cat", view: cat, x, y, depth: cat.fx + cat.fy + 0.55 });
  }
  return out.sort((p, q) => p.depth - q.depth);
}
