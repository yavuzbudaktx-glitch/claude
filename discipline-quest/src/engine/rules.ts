import type { ItemId } from "./types";

/** Strict-mode economy. Rewards land when you act; misses land at end of day. */
export const RULES = {
  prayer: { coins: 5, xp: 10, missCoins: 10 },
  allPrayersBonus: { coins: 10, xp: 15 },
  wake: { coins: 15, xp: 20, missCoins: 20 },
  diet: { coins: 15, xp: 20, missCoins: 20, checkInFromHour: 18 },
  urge: { coins: 5, xp: 5, maxPerDay: 5 },
  cleanDay: { coins: 10, xp: 15 },
  relapse: { coins: 100, lockDays: 7 },
  custom: { coins: 5, xp: 5, missCoins: 5 },
  wakeEarliestHour: 4,
  carCleanDays: 30,
  ponyPrayerDays: 14,
  logLimit: 200,
} as const;

export interface ShopItem {
  id: ItemId;
  name: string;
  price: number | null;
  blurb: string;
}

export const ITEMS: Record<ItemId, ShopItem> = {
  plant: { id: "plant", name: "Potted Plant", price: 40, blurb: "Something alive in here." },
  lamp: { id: "lamp", name: "Floor Lamp", price: 60, blurb: "Warm light for late Isha." },
  bookshelf: { id: "bookshelf", name: "Bookshelf", price: 120, blurb: "Read more, scroll less." },
  tv: { id: "tv", name: "Retro TV", price: 150, blurb: "Earned screen time." },
  sofa: { id: "sofa", name: "Sofa", price: 200, blurb: "Rest is part of discipline." },
  aquarium: { id: "aquarium", name: "Aquarium", price: 250, blurb: "Calm fish, calm mind." },
  arcade: { id: "arcade", name: "Arcade Cabinet", price: 400, blurb: "High score: your streak." },
  car: { id: "car", name: "Red Convertible", price: null, blurb: `Unlocks at ${RULES.carCleanDays} clean days.` },
  pony: { id: "pony", name: "Pony", price: null, blurb: `Unlocks at ${RULES.ponyPrayerDays} days of all 5 prayers.` },
};

export const SHOP_ORDER: ItemId[] = ["plant", "lamp", "bookshelf", "tv", "sofa", "aquarium", "arcade"];

/** Level n needs 50*n*(n-1) total XP: 0, 100, 300, 600, ... */
export function levelFor(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  const base = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, into: xp - base, need: next - base };
}
