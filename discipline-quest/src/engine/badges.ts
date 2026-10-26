import type { GameState } from "./types";
import { levelFor } from "./rules";

export type BadgeFamily = "prayer" | "purity" | "wake" | "diet" | "gym" | "quran" | "general";

export interface BadgeDef {
  id: string;
  name: string;
  family: BadgeFamily;
  desc: string;
  /** Icon glyph drawn on the badge (see game/sprites/badges.ts). */
  glyph: "crescent" | "sun" | "shield" | "flame" | "plate" | "star" | "car" | "scroll" | "crown" | "bag" | "fist" | "drop" | "dumbbell" | "book" | "moon";
  coins: number;
  xp: number;
  /** [current, target] for the progress bar. */
  progress: (s: GameState) => [number, number];
}

const lvl = (s: GameState) => levelFor(s.xp).level;
const owned = (s: GameState) => s.inventory.length;
const has = (s: GameState, id: string) => (s.inventory.some((i) => i.itemId === id) ? 1 : 0);
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
  B("jumuah-4", "Jumu'ah Regular", "prayer", "star", "Jumu'ah 4 Fridays in a row.", 80, 80, (s) => [s.best.jumuah, 4]),
  B("jumuah-20", "Front Row", "prayer", "crown", "Pray Jumu'ah 20 times.", 250, 200, (s) => [s.stats.jumuah, 20]),
  B("fasts-10", "Fasting", "prayer", "moon", "Fast 10 days in Ramadan mode.", 100, 100, (s) => [s.stats.fasts, 10]),
  B("fasts-30", "Full Ramadan", "prayer", "moon", "Fast 30 days.", 400, 300, (s) => [s.stats.fasts, 30]),
  B("taraweeh-20", "Night Prayer", "prayer", "moon", "Pray taraweeh 20 times.", 200, 150, (s) => [s.stats.taraweeh, 20]),

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
  B("bed-7", "Early Night", "wake", "moon", "In bed on time 7 nights in a row.", 60, 60, (s) => [s.best.bed, 7]),
  B("bed-30", "Sleep Schedule", "wake", "moon", "In bed on time 30 nights in a row.", 200, 200, (s) => [s.best.bed, 30]),

  B("diet-7", "Clean Week", "diet", "plate", "On diet 7 days in a row.", 60, 60, (s) => [s.best.diet, 7]),
  B("diet-30", "Lean Month", "diet", "plate", "On diet 30 days in a row.", 200, 200, (s) => [s.best.diet, 30]),
  B("meals-50", "Meal Logger", "diet", "drop", "Log 50 on-plan meals.", 100, 100, (s) => [s.stats.mealsOnPlan, 50]),

  B("gym-1", "First Rep", "gym", "dumbbell", "Go to the gym once.", 20, 20, (s) => [s.stats.gym, 1]),
  B("gym-weeks-4", "Consistent", "gym", "dumbbell", "4 gym weeks in a row (4× each).", 120, 120, (s) => [s.best.gymWeeks, 4]),
  B("gym-weeks-12", "Three Months Strong", "gym", "flame", "12 gym weeks in a row.", 400, 300, (s) => [s.best.gymWeeks, 12]),
  B("gym-100", "100 Sessions", "gym", "star", "Go to the gym 100 times.", 400, 300, (s) => [s.stats.gym, 100]),
  B("body-2", "Getting Fit", "gym", "fist", "Reach body stage 2.", 150, 150, (s) => [s.body.stage, 2]),
  B("body-4", "Built", "gym", "crown", "Reach the final body stage.", 500, 400, (s) => [s.body.stage, 4]),

  B("quran-50", "Reader", "quran", "book", "Read 50 pages of Quran.", 50, 50, (s) => [s.stats.quranPages, 50]),
  B("quran-streak-30", "Daily Recitation", "quran", "book", "Hit your Quran goal 30 days in a row.", 200, 200, (s) => [s.best.quran, 30]),
  B("khatm-1", "Khatm", "quran", "crown", "Finish the whole Quran (604 pages).", 500, 400, (s) => [s.stats.khatms, 1]),

  B("perfect-1", "Perfect Day", "general", "star", "Do everything in one day.", 50, 50, (s) => [s.stats.perfectDays, 1]),
  B("perfect-7", "Perfect Week", "general", "star", "7 perfect days in a row.", 300, 300, (s) => [s.best.perfect, 7]),
  B("quests-10", "Quest Taker", "general", "scroll", "Finish 10 daily quests.", 50, 50, (s) => [s.stats.quests, 10]),
  B("quests-100", "Quest Master", "general", "scroll", "Finish 100 daily quests.", 300, 250, (s) => [s.stats.quests, 100]),
  B("level-5", "Level 5", "general", "star", "Reach level 5.", 50, 0, (s) => [lvl(s), 5]),
  B("level-10", "Level 10", "general", "crown", "Reach level 10.", 150, 0, (s) => [lvl(s), 10]),
  B("level-20", "Level 20", "general", "crown", "Reach level 20.", 400, 0, (s) => [lvl(s), 20]),
  B("collector-5", "Decorator", "general", "bag", "Own 5 items.", 40, 40, (s) => [owned(s), 5]),
  B("collector-20", "Collector", "general", "bag", "Own 20 items.", 200, 150, (s) => [owned(s), 20]),
  B("q50", "Second Car", "general", "car", "Unlock the Q50 (30 clean days).", 100, 100, (s) => [has(s, "car-q50"), 1]),
  B("ioniq", "Electric", "general", "car", "Unlock the Ioniq 5 (90 clean days).", 300, 200, (s) => [has(s, "car-ioniq5"), 1]),
];

export const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(BADGES.map((b) => [b.id, b]));
