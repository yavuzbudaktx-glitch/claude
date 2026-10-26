import { ITEMS, ROOM_SIZE, isPlaceable, tierOf } from "./catalog";
import type { GameState, ItemId, PlacedItem } from "./types";

export function roomN(s: GameState): number {
  return ROOM_SIZE[tierOf(s.equipped.room)];
}

export function footprint(itemId: ItemId, rot: 0 | 1): { w: number; d: number } {
  const [w, d] = ITEMS[itemId]?.size ?? [1, 1];
  return rot ? { w: d, d: w } : { w, d };
}

export function tilesOf(p: PlacedItem): [number, number][] {
  const { w, d } = footprint(p.itemId, p.rot);
  const out: [number, number][] = [];
  for (let x = p.tx; x < p.tx + w; x++) for (let y = p.ty; y < p.ty + d; y++) out.push([x, y]);
  return out;
}

export const isFlat = (id: ItemId) => !!ITEMS[id]?.flat;

/** Placements that are inside the current room. */
export function visiblePlacements(s: GameState): PlacedItem[] {
  const n = roomN(s);
  return s.placements.filter((p) => {
    const { w, d } = footprint(p.itemId, p.rot);
    return p.tx >= 0 && p.ty >= 0 && p.tx + w <= n && p.ty + d <= n;
  });
}

export function blockedSet(placements: PlacedItem[]): Set<string> {
  const set = new Set<string>();
  for (const p of placements) if (!isFlat(p.itemId)) for (const [x, y] of tilesOf(p)) set.add(`${x},${y}`);
  return set;
}

/** Walkable floor must stay one connected area, and the bed, kitchen and rug must be reachable. */
function walkable(placements: PlacedItem[], n: number): boolean {
  const blocked = blockedSet(placements);
  const free: string[] = [];
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) if (!blocked.has(`${x},${y}`)) free.push(`${x},${y}`);
  if (!free.length) return false;
  const seen = new Set([free[0]]);
  const q = [free[0]];
  while (q.length) {
    const [x, y] = q.shift()!.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (x + dx < 0 || y + dy < 0 || x + dx >= n || y + dy >= n || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      q.push(k);
    }
  }
  if (seen.size !== free.length) return false;
  for (const key of ["bed", "kitchen"]) {
    const p = placements.find((q) => q.itemId === key);
    if (p && !tilesOf(p).some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`)))) return false;
  }
  return true;
}

export type PlaceCheck = "ok" | "outside" | "overlap" | "blocks-path";

/** Can this item go here? `skip` ignores the item's own current spot while moving it. */
export function checkPlace(s: GameState, item: PlacedItem, skip?: ItemId): PlaceCheck {
  const n = roomN(s);
  const { w, d } = footprint(item.itemId, item.rot);
  if (item.tx < 0 || item.ty < 0 || item.tx + w > n || item.ty + d > n) return "outside";
  const others = visiblePlacements(s).filter((p) => p.itemId !== (skip ?? item.itemId));
  const taken = new Set(others.flatMap((p) => tilesOf(p).map(([x, y]) => `${x},${y}`)));
  if (tilesOf(item).some(([x, y]) => taken.has(`${x},${y}`))) return "overlap";
  if (!walkable([...others, item], n)) return "blocks-path";
  return "ok";
}

/** Where things go by default (also how old saves keep their look). */
export const PREFERRED: Record<string, [number, number]> = {
  bed: [0, 5], kitchen: [2, 0], prayerrug: [5, 3],
  plant: [0, 0], bookshelf: [1, 0], coffee: [5, 0], recordplayer: [6, 0], lamp: [7, 0],
  monstera: [7, 2], aquarium: [7, 3], tv: [0, 2], sofa: [2, 2], rehal: [5, 2], lantern: [6, 2],
  clarinet: [7, 5], arcade: [0, 4], desk: [8, 0], chair: [8, 1], gymbench: [9, 3], treadmill: [0, 8], trophycase: [0, 10],
};

/** Put a newly owned item somewhere sensible, or leave it in storage if the room is full. */
export function autoPlace(s: GameState, itemId: ItemId): PlacedItem | null {
  if (!isPlaceable(itemId) || s.placements.some((p) => p.itemId === itemId)) return null;
  const n = roomN(s);
  const pref = PREFERRED[itemId];
  const tries: PlacedItem[] = [];
  if (pref) tries.push({ itemId, tx: pref[0], ty: pref[1], rot: 0 });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (const rot of [0, 1] as const) tries.push({ itemId, tx: x, ty: y, rot });
  return tries.find((t) => checkPlace(s, t) === "ok") ?? null;
}
