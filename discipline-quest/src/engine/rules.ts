/** Strict-mode economy. Rewards land when you act; misses land at end of day. */
export const RULES = {
  prayer: { coins: 5, xp: 10, missCoins: 10 },
  allPrayersBonus: { coins: 10, xp: 15 },
  wake: { coins: 15, xp: 20, missCoins: 20 },
  diet: { coins: 15, xp: 20, missCoins: 20, checkInFromHour: 18 },
  urge: { coins: 5, xp: 5, maxPerDay: 5 },
  cleanDay: { coins: 10, xp: 15 },
  perfectDay: { coins: 20, xp: 30 },
  relapse: { coins: 100, lockDays: 7 },
  custom: { coins: 5, xp: 5, missCoins: 5 },
  wakeEarliestHour: 4,
  carCleanDays: 30,
  goldPaintCleanDays: 90,
  ponyRefund: 150,
  logLimit: 200,
} as const;

/** Level n needs 50*n*(n-1) total XP: 0, 100, 300, 600, ... */
export function levelFor(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  const base = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, into: xp - base, need: next - base };
}

const TITLES = ["Rookie", "Committed", "Steady", "Focused", "Disciplined", "Iron Will", "Unshakable", "Steadfast", "Legend"];
export function titleFor(level: number): string {
  return TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 2))];
}
