import { ITEMS, ROOM_SIZE, isWallItem, tierOf, type RoomTier } from "./catalog";
import type { GameState, ItemId, WallPlaced } from "./types";

/** Fixed things on the walls: windows (by room size) and the Kaaba frame. [wall, from, to] in world units. */
export function reservedOnWalls(tier: RoomTier): { wall: "L" | "R"; u0: number; u1: number; kind: "window" | "kaaba" | "door" }[] {
  const out: { wall: "L" | "R"; u0: number; u1: number; kind: "window" | "kaaba" | "door" }[] = [{ wall: "L", u0: 40, u1: 66, kind: "kaaba" }];
  switch (tier) {
    case "studio":
      out.push({ wall: "R", u0: 70, u1: 110, kind: "window" });
      break;
    case "apartment":
      out.push({ wall: "R", u0: 70, u1: 110, kind: "window" }, { wall: "L", u0: 124, u1: 152, kind: "window" });
      break;
    case "penthouse":
      out.push({ wall: "R", u0: 56, u1: 136, kind: "window" }, { wall: "L", u0: 124, u1: 152, kind: "window" });
      break;
    case "loft":
      out.push({ wall: "R", u0: 56, u1: 176, kind: "window" }, { wall: "L", u0: 140, u1: 184, kind: "window" });
      break;
    case "villa":
      out.push({ wall: "R", u0: 60, u1: 200, kind: "window" }, { wall: "L", u0: 140, u1: 184, kind: "window" }, { wall: "L", u0: 204, u1: 236, kind: "door" });
      break;
  }
  return out;
}

export const wallWidth = (id: ItemId) => ITEMS[id]?.wallWidth ?? 16;

export type WallCheck = "ok" | "outside" | "overlap";

export function checkWall(s: GameState, w: WallPlaced): WallCheck {
  const tier = tierOf(s.equipped.room);
  const len = ROOM_SIZE[tier] * 16;
  const width = wallWidth(w.itemId);
  if (w.u < 4 || w.u + width > len - 2) return "outside";
  const clash = (a0: number, a1: number) => w.u < a1 + 2 && w.u + width > a0 - 2;
  if (reservedOnWalls(tier).some((r) => r.wall === w.wall && clash(r.u0, r.u1))) return "overlap";
  for (const o of s.wallPlacements) {
    if (o.itemId === w.itemId || o.wall !== w.wall) continue;
    if (clash(o.u, o.u + wallWidth(o.itemId))) return "overlap";
  }
  return "ok";
}

/** Where things used to hang, so old saves look the same. */
const DEFAULT_WALL: Record<string, [WallPlaced["wall"], number]> = {
  clock: ["R", 40],
  shelf: ["R", 114],
  neon: ["R", 132],
  madinah: ["L", 10],
  calligraphy: ["L", 82],
};

/** Hang a newly owned decoration somewhere free (or leave it stored if the walls are full). */
export function autoWall(s: GameState, itemId: ItemId): WallPlaced | null {
  if (!isWallItem(itemId) || s.wallPlacements.some((w) => w.itemId === itemId)) return null;
  const tries: WallPlaced[] = [];
  const d = DEFAULT_WALL[itemId];
  if (d) tries.push({ itemId, wall: d[0], u: d[1] });
  const len = ROOM_SIZE[tierOf(s.equipped.room)] * 16;
  for (let u = 6; u < len; u += 4) for (const wall of ["R", "L"] as const) tries.push({ itemId, wall, u });
  return tries.find((t) => checkWall(s, t) === "ok") ?? null;
}

/** Wall items visible in the current room (a smaller room can hide ones placed further along). */
export function visibleWall(s: GameState): WallPlaced[] {
  const len = ROOM_SIZE[tierOf(s.equipped.room)] * 16;
  return s.wallPlacements.filter((w) => w.u + wallWidth(w.itemId) <= len - 2);
}
