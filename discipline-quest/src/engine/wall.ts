import { GYM_SIZE, ITEMS, ROOM_SIZE, isGymTier, isWallItem, tierOf, type GymTier, type RoomTier } from "./catalog";
import { roomN, spaceOf } from "./placement";
import type { GameState, ItemId, Space, WallPlaced } from "./types";

/** A room's shape key: a home tier or a gym tier. */
export type RoomKey = RoomTier | GymTier;

export const roomKeySize = (k: RoomKey) => (isGymTier(k) ? GYM_SIZE[k] : ROOM_SIZE[k]);

export function roomKeyOf(s: GameState, space: Space): RoomKey {
  return space === "gym" && isGymTier(s.equipped.gym) ? s.equipped.gym : tierOf(s.equipped.room);
}

type Reserved = { wall: "L" | "R"; u0: number; u1: number; kind: "window" | "kaaba" | "door" };

/** Fixed things on the walls: windows (by room size) and, at home, the Kaaba frame. In world units. */
export function reservedOnWalls(key: RoomKey): Reserved[] {
  if (isGymTier(key)) {
    switch (key) {
      case "gym-garage":
        return [{ wall: "R", u0: 64, u1: 104, kind: "window" }];
      case "gym-home":
        return [{ wall: "R", u0: 56, u1: 120, kind: "window" }];
      case "gym-pro":
        return [{ wall: "R", u0: 40, u1: 152, kind: "window" }];
    }
  }
  const out: Reserved[] = [{ wall: "L", u0: 40, u1: 66, kind: "kaaba" }];
  switch (key) {
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
  const space = spaceOf(w);
  const n = roomN(s, space);
  if (!n) return "outside";
  const len = n * 16;
  const width = wallWidth(w.itemId);
  if (w.u < 4 || w.u + width > len - 2) return "outside";
  const clash = (a0: number, a1: number) => w.u < a1 + 2 && w.u + width > a0 - 2;
  if (reservedOnWalls(roomKeyOf(s, space)).some((r) => r.wall === w.wall && clash(r.u0, r.u1))) return "overlap";
  for (const o of s.wallPlacements) {
    if (o.itemId === w.itemId || o.wall !== w.wall || spaceOf(o) !== space) continue;
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

/** Hang a newly owned decoration somewhere free (or leave it stored if the walls are full or the room is locked). */
export function autoWall(s: GameState, itemId: ItemId): WallPlaced | null {
  if (!isWallItem(itemId) || s.wallPlacements.some((w) => w.itemId === itemId)) return null;
  const space: Space = ITEMS[itemId]?.space ?? "home";
  const n = roomN(s, space);
  if (!n) return null;
  const tag = space === "home" ? {} : { space };
  const tries: WallPlaced[] = [];
  const d = DEFAULT_WALL[itemId];
  if (d && space === "home") tries.push({ itemId, wall: d[0], u: d[1] });
  for (let u = 6; u < n * 16; u += 4) for (const wall of ["R", "L"] as const) tries.push({ itemId, wall, u, ...tag });
  return tries.find((t) => checkWall(s, t) === "ok") ?? null;
}

/** Wall items visible in this room (a smaller room can hide ones placed further along). */
export function visibleWall(s: GameState, space: Space = "home"): WallPlaced[] {
  const len = roomN(s, space) * 16;
  return s.wallPlacements.filter((w) => spaceOf(w) === space && w.u + wallWidth(w.itemId) <= len - 2);
}
