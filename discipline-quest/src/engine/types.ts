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
}

export interface CustomHabit {
  id: string;
  name: string;
  createdDate: string;
  archived?: boolean;
}

export type ItemId =
  | "plant"
  | "lamp"
  | "bookshelf"
  | "tv"
  | "sofa"
  | "aquarium"
  | "arcade"
  | "car"
  | "pony";

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
  custom: Record<string, number>;
}

export interface GameEvent {
  at: number;
  text: string;
  coins?: number;
  kind: "good" | "bad" | "info";
}

export interface Settings {
  /** "HH:MM" */
  wakeTarget: string;
  wakeGraceMin: number;
  notifications: boolean;
}

export interface GameState {
  version: 1;
  startDate: string;
  /** Last calendar date whose misses/rewards have been applied. */
  lastSettled: string | null;
  days: Record<string, DayLog>;
  coins: number;
  xp: number;
  streaks: Streaks;
  best: Streaks;
  customHabits: CustomHabit[];
  inventory: OwnedItem[];
  /** Room goes dark and messy after a relapse or a day with zero prayers. */
  gloomy: boolean;
  settings: Settings;
  log: GameEvent[];
}
