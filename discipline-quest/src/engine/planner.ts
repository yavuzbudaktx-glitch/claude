import { CAR_UNLOCKS, CATALOG, ITEMS } from "./catalog";
import { owns } from "./engine";
import { addDays, dateKey } from "./dates";
import type { GameState, ItemId } from "./types";

/** A strong-but-not-perfect pace (incl. badge payouts), used until there are a few days of history. */
export const DEFAULT_RATE = { coins: 175, xp: 230 };

const xpForLevel = (l: number) => 50 * l * (l - 1);

export interface Plan {
  coinRate: number;
  xpRate: number;
  estimated: boolean;
  /** Days until every item, room and car is unlocked (no relapses). */
  daysAll: number;
  next: { id: ItemId; name: string; days: number }[];
  remainingCost: number;
}

/** Earning rate from the last 14 settled days of history. */
export function rates(s: GameState) {
  const keys = Object.keys(s.history).sort();
  if (keys.length < 3) return { coins: DEFAULT_RATE.coins, xp: DEFAULT_RATE.xp, estimated: true };
  const last = keys[keys.length - 1];
  const from = addDays(last, -14);
  const base = keys.find((k) => k >= from) ?? keys[0];
  const days = Math.max(1, keys.filter((k) => k > base).length);
  const a = s.history[base], b = s.history[last];
  return { coins: Math.max(1, (b.earned - a.earned) / days), xp: Math.max(1, (b.xp - a.xp) / days), estimated: false };
}

export function plan(s: GameState, now: Date): Plan {
  const r = rates(s);
  void now;
  const levelDays = (lvl: number) => Math.max(0, (xpForLevel(lvl) - s.xp) / r.xp);
  const items = CATALOG.filter((c) => c.price !== null && !owns(s, c.id));
  const remainingCost = items.reduce((n, c) => n + (c.price ?? 0), 0);
  const coinDays = Math.max(0, (remainingCost - Math.max(0, s.coins)) / r.coins);
  const maxLevel = Math.max(0, ...items.map((c) => levelDays(c.level)));
  const carDays = CAR_UNLOCKS.filter((u) => !owns(s, u.id)).map((u) => ({ id: u.id, days: Math.max(0, u.cleanDays - s.streaks.clean) }));
  const daysAll = Math.ceil(Math.max(coinDays, maxLevel, ...carDays.map((c) => c.days), 0));
  const next = [
    ...items.map((c) => ({ id: c.id, name: c.name, days: Math.ceil(Math.max(levelDays(c.level), Math.max(0, ((c.price ?? 0) - s.coins) / r.coins))) })),
    ...carDays.map((c) => ({ id: c.id, name: ITEMS[c.id].name, days: c.days })),
  ]
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);
  return { coinRate: Math.round(r.coins), xpRate: Math.round(r.xp), estimated: r.estimated, daysAll, next, remainingCost };
}

export const dayLabel = (now: Date, days: number) => {
  const d = new Date(now.getTime() + days * 86400_000);
  return days <= 0 ? "now" : dateKey(d);
};
