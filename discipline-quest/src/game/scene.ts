import { ITEMS, ROOM_SIZE, tierOf } from "@/engine/catalog";
import { isLocked, owns } from "@/engine/engine";
import { footprint, surfaceHeight, visiblePlacements } from "@/engine/placement";
import type { GameState, PlacedItem, Space } from "@/engine/types";
import { roomKeyOf, visibleWall } from "@/engine/wall";
import { S } from "./iso";
import { AVATAR_FOOT, type BodyStage, type Facing, type OutfitId, type Pose } from "./sprites/avatar";
import { GYM_LOOK, MESS, roomSpec, tileScreen, type RoomSpec } from "./furniture";

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
  /** Lift in world units (standing on a treadmill). */
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
  /** Standing on furniture: how high its top is (world units). */
  lift: number;
}

export interface RoomLayout {
  space: Space;
  spec: RoomSpec;
  pieces: PlacedPiece[];
  wallItems: { id: string; wall: "L" | "R"; u: number; locked: boolean }[];
  curtains: boolean;
  ledStrip: boolean;
  wallpaper: string;
  floor: string;
  gloomy: boolean;
}

export function pieceKey(s: GameState, p: PlacedItem): string {
  if (p.itemId === "prayerrug") return `prayerrug:${s.equipped.rug}`;
  if (p.itemId === "kitchen") return `kitchen:${(p.rot ? p.tx : p.ty) === 0 ? "wall" : ""}`;
  return p.itemId;
}

/** Everything a room shows for a game state. */
export function roomLayout(s: GameState, space: Space = "home"): RoomLayout {
  const spec = roomSpec(roomKeyOf(s, space));
  const placements = visiblePlacements(s, space).filter((p) => owns(s, p.itemId));
  const pieces: PlacedPiece[] = placements.map((p) => {
    const { w, d } = footprint(p.itemId, p.rot);
    return {
      place: p,
      w,
      d,
      key: pieceKey(s, p),
      locked: isLocked(s, p.itemId),
      flat: !!ITEMS[p.itemId]?.flat,
      lift: p.on && placements.some((q) => q.itemId === p.on) ? surfaceHeight(p.on) : 0,
    };
  });
  if (s.gloomy && space === "home")
    for (const m of MESS)
      if (m.tx < ROOM_SIZE[tierOf(s.equipped.room)] && m.ty < ROOM_SIZE[tierOf(s.equipped.room)])
        pieces.push({ place: { itemId: m.id, tx: m.tx, ty: m.ty, rot: 0 }, w: 1, d: 1, key: m.id, locked: false, flat: true, lift: 0 });
  const wallItems = visibleWall(s, space)
    .filter((w) => owns(s, w.itemId))
    .map((w) => ({ id: w.itemId, wall: w.wall, u: w.u, locked: isLocked(s, w.itemId) }));
  const on = (id: string) => space === "home" && owns(s, id) && !isLocked(s, id);
  const look = space === "gym" ? GYM_LOOK[s.equipped.gym] : undefined;
  return {
    space,
    spec,
    pieces,
    wallItems,
    curtains: on("curtains"),
    ledStrip: on("ledstrip"),
    wallpaper: look?.wallpaper ?? s.equipped.wallpaper,
    floor: look?.floor ?? s.equipped.floor,
    gloomy: s.gloomy && space === "home",
  };
}

export type Drawable =
  | { kind: "piece"; piece: PlacedPiece; x: number; y: number; depth: number }
  | { kind: "avatar"; view: AvatarView; x: number; y: number; depth: number }
  | { kind: "cat"; view: CatView; x: number; y: number; depth: number }
  | { kind: "shadow"; x: number; y: number; depth: number };

export function pieceDepth(p: PlacedPiece) {
  if (p.flat) return -100 + p.place.tx + p.place.ty;
  return p.place.tx + p.w - 1 + (p.place.ty + p.d - 1) + (p.lift ? 0.05 : 0);
}

/** Painter's-order list of everything in the room. Positions are where each sprite's anchor lands. */
export function sceneDrawables(layout: RoomLayout, avatar: AvatarView, cat?: CatView): Drawable[] {
  const { spec } = layout;
  const out: Drawable[] = [];
  const base = new Map(layout.pieces.map((p) => [p.place.itemId, p]));
  for (const piece of layout.pieces) {
    const [x, y] = tileScreen(spec, piece.place.tx, piece.place.ty);
    // things on a surface draw right after it, whatever their own tile says
    const under = piece.place.on ? base.get(piece.place.on) : undefined;
    const depth = under ? pieceDepth(under) + 0.01 + (piece.place.tx + piece.place.ty) * 0.0001 : pieceDepth(piece);
    out.push({ kind: "piece", piece, x, y: y - piece.lift * S, depth });
  }
  if (!avatar.asleep) {
    const [x, y] = tileScreen(spec, avatar.fx, avatar.fy, true);
    if (!avatar.lift) out.push({ kind: "shadow", x, y, depth: -50 });
    out.push({ kind: "avatar", view: avatar, x: x - AVATAR_FOOT.x, y: y - AVATAR_FOOT.y - (avatar.lift ?? 0) * S, depth: avatar.depth ?? avatar.fx + avatar.fy + 0.6 });
  }
  if (cat) {
    const [x, y] = tileScreen(spec, cat.fx, cat.fy, true);
    out.push({ kind: "cat", view: cat, x, y, depth: cat.fx + cat.fy + 0.55 });
  }
  return out.sort((p, q) => p.depth - q.depth);
}
