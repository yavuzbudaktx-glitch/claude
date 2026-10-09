import type { ItemId } from "@/engine/types";
import { AVATAR_FOOT, type Facing, type Pose } from "./sprites/avatar";
import { FIXED, ITEM_SLOTS, MESS, tileScreen, type PieceId, type Placement } from "./furniture";

export interface AvatarView {
  fx: number;
  fy: number;
  facing: Facing;
  pose: Pose;
  mirror: boolean;
}

export interface SceneInput {
  owned: { itemId: ItemId; locked: boolean }[];
  gloomy: boolean;
  avatar: AvatarView;
}

export type Drawable =
  | { kind: "piece"; id: PieceId; locked: boolean; x: number; y: number; depth: number }
  | { kind: "avatar"; view: AvatarView; x: number; y: number; depth: number }
  | { kind: "shadow"; x: number; y: number; depth: number };

/** Painter's-order list of everything in the room. Positions are where the sprite's anchor lands. */
export function sceneDrawables(input: SceneInput): Drawable[] {
  const out: Drawable[] = [];
  const place = (p: Placement, locked = false) => {
    const [x, y] = tileScreen(p.tx, p.ty, p.billboard);
    const depth = p.flat ? -100 + p.tx + p.ty : p.tx + p.w - 1 + (p.ty + p.d - 1) + (p.billboard ? 0.5 : 0);
    out.push({ kind: "piece", id: p.id, locked, x, y, depth });
  };
  FIXED.forEach((p) => place(p));
  if (input.gloomy) MESS.forEach((p) => place(p));
  for (const o of input.owned) place(ITEM_SLOTS[o.itemId], o.locked);

  const a = input.avatar;
  const [x, y] = tileScreen(a.fx, a.fy, true);
  out.push({ kind: "shadow", x, y, depth: -50 });
  out.push({ kind: "avatar", view: a, x: x - AVATAR_FOOT.x, y: y - AVATAR_FOOT.y, depth: a.fx + a.fy + 0.6 });
  return out.sort((p, q) => p.depth - q.depth);
}
