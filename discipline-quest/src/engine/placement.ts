import { GYM_SIZE, ITEMS, ROOM_SIZE, isGymTier, isPlaceable, tierOf } from "./catalog";
import type { GameState, ItemId, PlacedItem, Space } from "./types";

/** Room size in tiles (0 = you don't have that room yet). */
export function roomN(s: GameState, space: Space = "home"): number {
  if (space === "gym") return isGymTier(s.equipped.gym) ? GYM_SIZE[s.equipped.gym] : 0;
  return ROOM_SIZE[tierOf(s.equipped.room)];
}

export const spaceOf = (p: { space?: Space }): Space => p.space ?? "home";

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
export const isSmall = (id: ItemId) => !!ITEMS[id]?.small;
export const surfaceHeight = (id: ItemId) => ITEMS[id]?.surface ?? 0;

/** Placements that are inside this room. */
export function visiblePlacements(s: GameState, space: Space = "home"): PlacedItem[] {
  const n = roomN(s, space);
  return s.placements.filter((p) => {
    if (spaceOf(p) !== space) return false;
    const { w, d } = footprint(p.itemId, p.rot);
    return p.tx >= 0 && p.ty >= 0 && p.tx + w <= n && p.ty + d <= n;
  });
}

/** Floor tiles nobody can walk through: furniture on the floor (rugs and things standing on furniture don't count). */
export function blockedSet(placements: PlacedItem[]): Set<string> {
  const set = new Set<string>();
  for (const p of placements) if (!isFlat(p.itemId) && !p.on) for (const [x, y] of tilesOf(p)) set.add(`${x},${y}`);
  return set;
}

const key = ([x, y]: [number, number]) => `${x},${y}`;

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
  for (const id of ["bed", "kitchen"]) {
    const p = placements.find((q) => q.itemId === id);
    if (p && !tilesOf(p).some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`)))) return false;
  }
  return true;
}

/** The furniture a small item would stand on here, if its whole footprint fits on that one top. */
export function surfaceUnder(others: PlacedItem[], item: PlacedItem): PlacedItem | null {
  if (!isSmall(item.itemId)) return null;
  const mine = tilesOf(item).map(key);
  for (const o of others) {
    if (o.on || !surfaceHeight(o.itemId)) continue;
    const top = new Set(tilesOf(o).map(key));
    if (mine.every((t) => top.has(t))) return o;
  }
  return null;
}

export type PlaceCheck = "ok" | "outside" | "overlap" | "blocks-path";

/**
 * Can this item go here? `skip` ignores the item's own current spot while moving it.
 * Rugs only clash with rugs, small things can stand on furniture tops, and the way must stay clear.
 */
export function checkPlace(s: GameState, item: PlacedItem, skip?: ItemId): PlaceCheck {
  const space = spaceOf(item);
  const n = roomN(s, space);
  const { w, d } = footprint(item.itemId, item.rot);
  if (item.tx < 0 || item.ty < 0 || item.tx + w > n || item.ty + d > n) return "outside";
  const self = skip ?? item.itemId;
  // Things standing on the piece being moved travel with it.
  const others = visiblePlacements(s, space).filter((p) => p.itemId !== self && p.on !== self);
  const mine = tilesOf(item).map(key);
  const base = surfaceUnder(others, item);
  if (base) {
    const used = new Set(others.filter((p) => p.on === base.itemId).flatMap((p) => tilesOf(p).map(key)));
    return mine.some((t) => used.has(t)) ? "overlap" : "ok";
  }
  const flat = isFlat(item.itemId);
  const taken = new Set(others.filter((p) => !p.on && isFlat(p.itemId) === flat).flatMap((p) => tilesOf(p).map(key)));
  if (mine.some((t) => taken.has(t))) return "overlap";
  if (!walkable([...others, item], n)) return "blocks-path";
  return "ok";
}

/** The final record for a placement that passed checkPlace: marks what it stands on. */
export function settle(s: GameState, item: PlacedItem, skip?: ItemId): PlacedItem {
  const self = skip ?? item.itemId;
  const others = visiblePlacements(s, spaceOf(item)).filter((p) => p.itemId !== self && p.on !== self);
  const base = surfaceUnder(others, item);
  const out: PlacedItem = { itemId: item.itemId, tx: item.tx, ty: item.ty, rot: item.rot };
  if (spaceOf(item) !== "home") out.space = spaceOf(item);
  if (base) out.on = base.itemId;
  return out;
}

/** Where things go by default (also how old saves keep their look). */
export const PREFERRED: Record<string, [number, number]> = {
  bed: [0, 5], kitchen: [2, 0], prayerrug: [5, 3],
  plant: [0, 0], bookshelf: [1, 0], coffee: [5, 0], recordplayer: [6, 0], lamp: [7, 0],
  monstera: [7, 2], aquarium: [7, 3], tv: [0, 2], sofa: [2, 2], rehal: [5, 2],
  clarinet: [7, 5], arcade: [0, 4], desk: [8, 0], chair: [8, 1], gymbench: [9, 3], treadmill: [0, 8],
};

/** Where gym things go first in the gym room. */
const GYM_PREFERRED: Record<string, [number, number]> = {
  squatrack: [0, 1], dumbbellrack: [2, 0], gymbench: [3, 2], treadmill: [0, 5], bike: [5, 0], kettlebells: [4, 0],
  punchbag: [7, 3], rower: [5, 6], platetree: [1, 0], watercooler: [7, 0], speaker: [6, 0], battleropes: [7, 5],
};

/** Which room a newly owned item goes to. */
export function homeFor(s: GameState, itemId: ItemId): Space | null {
  const it = ITEMS[itemId];
  if (it?.space === "gym") return roomN(s, "gym") ? "gym" : null;
  if (it?.category === "fitness" && roomN(s, "gym")) return "gym";
  return "home";
}

/** Put a newly owned item somewhere sensible, or leave it in storage if the room is full (or not unlocked). */
export function autoPlace(s: GameState, itemId: ItemId, space?: Space): PlacedItem | null {
  if (!isPlaceable(itemId) || s.placements.some((p) => p.itemId === itemId)) return null;
  const where = space ?? homeFor(s, itemId);
  if (!where) return null;
  const n = roomN(s, where);
  const pref = (where === "gym" ? GYM_PREFERRED : PREFERRED)[itemId];
  const tag = where === "home" ? {} : { space: where };
  const tries: PlacedItem[] = [];
  if (pref) tries.push({ itemId, tx: pref[0], ty: pref[1], rot: 0, ...tag });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (const rot of [0, 1] as const) tries.push({ itemId, tx: x, ty: y, rot, ...tag });
  // Prefer the floor; small things only end up on furniture when you put them there.
  const floor = tries.find((t) => checkPlace(s, t) === "ok" && !surfaceUnder(visiblePlacements(s, where), t));
  return floor ? settle(s, floor) : null;
}
