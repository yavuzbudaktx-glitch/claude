export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerName = (typeof PRAYERS)[number];

export const PRAYER_LABELS: Record<PrayerName, string> = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

export interface Meal {
  at: number;
  note: string;
  onPlan: boolean;
}

export interface DayLog {
  date: string;
  prayers: Record<PrayerName, boolean>;
  wake: "pending" | "ok" | "late";
  wokeAt?: number;
  diet: "pending" | "on" | "cheat";
  meals: Meal[];
  urgesResisted: number;
  relapses: number;
  custom: Record<string, boolean>;
  /** The day's 3 quest ids, picked when the day starts. */
  quests?: string[];
  /** Quest ids already paid out for this day. */
  questsDone?: string[];
}

export interface CustomHabit {
  id: string;
  name: string;
  createdDate: string;
  archived?: boolean;
}

/** Any catalog id (see catalog.ts). */
export type ItemId = string;

export interface OwnedItem {
  uid: string;
  itemId: ItemId;
  acquiredAt: number;
  /** Clean days left before a relapse lock lifts. 0 = usable. */
  lockDaysLeft: number;
}

export interface Streaks {
  prayers: number;
  wake: number;
  clean: number;
  diet: number;
  /** Days where everything was done. */
  perfect: number;
  custom: Record<string, number>;
}

export interface LifetimeStats {
  prayers: number;
  fajr: number;
  fullPrayerDays: number;
  cleanDays: number;
  urges: number;
  wakeOnTime: number;
  dietDays: number;
  mealsOnPlan: number;
  perfectDays: number;
  quests: number;
  bought: number;
}

export interface GameEvent {
  at: number;
  text: string;
  coins?: number;
  kind: "good" | "bad" | "info";
}

/** Things the UI should celebrate once, then dismiss. */
export type InboxEntry =
  | { kind: "badge"; id: string; at: number }
  | { kind: "level"; level: number; at: number }
  | { kind: "unlock"; id: ItemId; at: number };

export interface Settings {
  /** "HH:MM" */
  wakeTarget: string;
  wakeGraceMin: number;
  notifications: boolean;
  sound: boolean;
}

/** One equipped choice per style slot. */
export interface Equipped {
  outfit: ItemId;
  wallpaper: ItemId;
  floor: ItemId;
  rug: ItemId;
  room: ItemId;
  paint: ItemId;
}

export interface GameState {
  version: 2;
  startDate: string;
  /** Last calendar date whose misses/rewards have been applied. */
  lastSettled: string | null;
  days: Record<string, DayLog>;
  coins: number;
  xp: number;
  streaks: Streaks;
  best: Streaks;
  stats: LifetimeStats;
  customHabits: CustomHabit[];
  inventory: OwnedItem[];
  equipped: Equipped;
  badges: Record<string, number>;
  inbox: InboxEntry[];
  /** Catalog ids the player has already seen (for "NEW" tags). */
  seen: ItemId[];
  /** Room goes dark and messy after a relapse or a day with zero prayers. */
  gloomy: boolean;
  settings: Settings;
  log: GameEvent[];
}
