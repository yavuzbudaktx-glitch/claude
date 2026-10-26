import type { GameState } from "./types";
import { levelFor } from "./rules";

export type BadgeFamily = "prayer" | "purity" | "wake" | "diet" | "general";

export interface BadgeDef {
  id: string;
  name: string;
  family: BadgeFamily;
  desc: string;
  /** Icon glyph drawn on the badge (see game/sprites/badges.ts). */
  glyph: "crescent" | "sun" | "shield" | "flame" | "plate" | "star" | "car" | "scroll" | "crown" | "bag" | "fist" | "drop";
  coins: number;
  xp: number;
  /** [current, target] for the progress bar. */
  progress: (s: GameState) => [number, number];
}

const lvl = (s: GameState) => levelFor(s.xp).level;
const owned = (s: GameState) => s.inventory.length;
const B = (
  id: string, name: string, family: BadgeFamily, glyph: BadgeDef["glyph"], desc: string,
  coins: number, xp: number, progress: BadgeDef["progress"],
): BadgeDef => ({ id, name, family, glyph, desc, coins, xp, progress });

export const BADGES: BadgeDef[] = [
  B("first-prayer", "First Step", "prayer", "crescent", "Check off your first prayer.", 10, 10, (s) => [s.stats.prayers, 1]),
  B("fajr-7", "Dawn Riser", "prayer", "sun", "Pray Fajr 7 times.", 30, 30, (s) => [s.stats.fajr, 7]),
  B("fajr-40", "Fajr Warrior", "prayer", "sun", "Pray Fajr 40 times.", 120, 100, (s) => [s.stats.fajr, 40]),
  B("prayers-7", "Five a Day", "prayer", "crescent", "All 5 prayers, 7 days in a row.", 60, 60, (s) => [s.best.prayers, 7]),
  B("prayers-30", "Steadfast", "prayer", "crescent", "All 5 prayers, 30 days in a row.", 200, 200, (s) => [s.best.prayers, 30]),
  B("prayers-100", "Pillar", "prayer", "crown", "All 5 prayers, 100 days in a row.", 600, 500, (s) => [s.best.prayers, 100]),
  B("prayers-500", "500 Prayers", "prayer", "scroll", "Check off 500 prayers in total.", 300, 250, (s) => [s.stats.prayers, 500]),

  B("clean-7", "One Week Free", "purity", "shield", "7 days porn-free in a row.", 70, 70, (s) => [s.best.clean, 7]),
  B("clean-30", "Thirty Strong", "purity", "shield", "30 days porn-free in a row.", 200, 200, (s) => [s.best.clean, 30]),
  B("clean-40", "Forty Days", "purity", "shield", "40 days in a row. A new habit.", 250, 250, (s) => [s.best.clean, 40]),
  B("clean-90", "Rewired", "purity", "crown", "90 days in a row. Reboot complete.", 600, 500, (s) => [s.best.clean, 90]),
  B("clean-365", "One Year", "purity", "crown", "365 days in a row.", 2000, 1500, (s) => [s.best.clean, 365]),
  B("urges-10", "Urge Surfer", "purity", "fist", "Beat 10 urges.", 50, 50, (s) => [s.stats.urges, 10]),
  B("urges-50", "Unbreakable", "purity", "fist", "Beat 50 urges.", 200, 150, (s) => [s.stats.urges, 50]),

  B("wake-7", "Morning Person", "wake", "sun", "Up on time 7 days in a row.", 60, 60, (s) => [s.best.wake, 7]),
  B("wake-30", "Clockwork", "wake", "sun", "Up on time 30 days in a row.", 200, 200, (s) => [s.best.wake, 30]),
  B("wake-100", "100 Mornings", "wake", "star", "Up on time 100 times.", 300, 250, (s) => [s.stats.wakeOnTime, 100]),

  B("diet-7", "Clean Week", "diet", "plate", "On diet 7 days in a row.", 60, 60, (s) => [s.best.diet, 7]),
  B("diet-30", "Lean Month", "diet", "plate", "On diet 30 days in a row.", 200, 200, (s) => [s.best.diet, 30]),
  B("meals-50", "Meal Logger", "diet", "drop", "Log 50 on-plan meals.", 100, 100, (s) => [s.stats.mealsOnPlan, 50]),

  B("perfect-1", "Perfect Day", "general", "star", "Do everything in one day.", 50, 50, (s) => [s.stats.perfectDays, 1]),
  B("perfect-7", "Perfect Week", "general", "star", "7 perfect days in a row.", 300, 300, (s) => [s.best.perfect, 7]),
  B("quests-10", "Quest Taker", "general", "scroll", "Finish 10 daily quests.", 50, 50, (s) => [s.stats.quests, 10]),
  B("quests-100", "Quest Master", "general", "scroll", "Finish 100 daily quests.", 300, 250, (s) => [s.stats.quests, 100]),
  B("level-5", "Level 5", "general", "star", "Reach level 5.", 50, 0, (s) => [lvl(s), 5]),
  B("level-10", "Level 10", "general", "crown", "Reach level 10.", 150, 0, (s) => [lvl(s), 10]),
  B("collector-5", "Decorator", "general", "bag", "Own 5 items.", 40, 40, (s) => [owned(s), 5]),
  B("collector-20", "Collector", "general", "bag", "Own 20 items.", 200, 150, (s) => [owned(s), 20]),
  B("ioniq", "Electric", "general", "car", "Unlock the Ioniq 5.", 100, 100, (s) => [s.inventory.some((i) => i.itemId === "ioniq5") ? 1 : 0, 1]),
];

export const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(BADGES.map((b) => [b.id, b]));
