import { ITEMS, ROOM_SIZE, tierOf } from "@/engine/catalog";
import { isLocked, owns } from "@/engine/engine";
import { footprint, visiblePlacements } from "@/engine/placement";
import type { GameState, PlacedItem } from "@/engine/types";
import { AVATAR_FOOT, type BodyStage, type Facing, type OutfitId, type Pose } from "./sprites/avatar";
import { MESS, WALL_ITEMS, roomSpec, tileScreen, type RoomSpec } from "./furniture";

export interface AvatarView {
  fx: number;
  fy: number;
  facing: Facing;
  pose: Pose;
  mirror: boolean;
  outfit: OutfitId;
  body: BodyStage;
  /** Lying in bed: only the head on the pillow is drawn. */
  asleep?: boolean;
  /** Draw order override (e.g. sitting inside the sofa). */
  depth?: number;
  /** Lift in pixels (standing on a treadmill). */
  lift?: number;
}

export interface CatView {
  fx: number;
  fy: number;
  pose: "sit" | "walk1" | "walk2";
  mirror: boolean;
}

export interface PlacedPiece {
  place: PlacedItem;
  w: number;
  d: number;
  /** Sprite key, may include a variant (rug design, kitchen against a wall). */
  key: string;
  locked: boolean;
  flat: boolean;
}

export interface RoomLayout {
  spec: RoomSpec;
  pieces: PlacedPiece[];
  wallItems: { id: string; locked: boolean }[];
  wallpaper: string;
  floor: string;
  gloomy: boolean;
}

export function pieceKey(s: GameState, p: PlacedItem): string {
  if (p.itemId === "prayerrug") return `prayerrug:${s.equipped.rug}`;
  if (p.itemId === "kitchen") return `kitchen:${(p.rot ? p.tx : p.ty) === 0 ? "wall" : ""}`;
  return p.itemId;
}

/** Everything the room shows for a game state. */
export function roomLayout(s: GameState): RoomLayout {
  const spec = roomSpec(tierOf(s.equipped.room));
  const pieces: PlacedPiece[] = visiblePlacements(s)
    .filter((p) => owns(s, p.itemId))
    .map((p) => {
      const { w, d } = footprint(p.itemId, p.rot);
      return { place: p, w, d, key: pieceKey(s, p), locked: isLocked(s, p.itemId), flat: !!ITEMS[p.itemId]?.flat };
    });
  if (s.gloomy)
    for (const m of MESS)
      if (m.tx < ROOM_SIZE[spec.tier] && m.ty < ROOM_SIZE[spec.tier])
        pieces.push({ place: { itemId: m.id, tx: m.tx, ty: m.ty, rot: 0 }, w: 1, d: 1, key: m.id, locked: false, flat: true });
  const wallItems = WALL_ITEMS.filter((id) => owns(s, id)).map((id) => ({ id, locked: isLocked(s, id) }));
  return { spec, pieces, wallItems, wallpaper: s.equipped.wallpaper, floor: s.equipped.floor, gloomy: s.gloomy };
}

export type Drawable =
  | { kind: "piece"; piece: PlacedPiece; x: number; y: number; depth: number }
  | { kind: "avatar"; view: AvatarView; x: number; y: number; depth: number }
  | { kind: "cat"; view: CatView; x: number; y: number; depth: number }
  | { kind: "shadow"; x: number; y: number; depth: number };

export function pieceDepth(p: PlacedPiece) {
  return p.flat ? -100 + p.place.tx + p.place.ty : p.place.tx + p.w - 1 + (p.place.ty + p.d - 1);
}

/** Painter's-order list of everything in the room. Positions are where each sprite's anchor lands. */
export function sceneDrawables(layout: RoomLayout, avatar: AvatarView, cat?: CatView): Drawable[] {
  const { spec } = layout;
  const out: Drawable[] = [];
  for (const piece of layout.pieces) {
    const [x, y] = tileScreen(spec, piece.place.tx, piece.place.ty);
    out.push({ kind: "piece", piece, x, y, depth: pieceDepth(piece) });
  }
  if (!avatar.asleep) {
    const [x, y] = tileScreen(spec, avatar.fx, avatar.fy, true);
    if (!avatar.lift) out.push({ kind: "shadow", x, y, depth: -50 });
    out.push({ kind: "avatar", view: avatar, x: x - AVATAR_FOOT.x, y: y - AVATAR_FOOT.y - (avatar.lift ?? 0), depth: avatar.depth ?? avatar.fx + avatar.fy + 0.6 });
  }
  if (cat) {
    const [x, y] = tileScreen(spec, cat.fx, cat.fy, true);
    out.push({ kind: "cat", view: cat, x, y, depth: cat.fx + cat.fy + 0.55 });
  }
  return out.sort((p, q) => p.depth - q.depth);
}
