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
  gym?: boolean;
  quranPages?: number;
  /** Going-to-bed check-in for the night that starts on this date. */
  bed?: "pending" | "ok" | "late";
  bedAt?: number;
  fasted?: boolean;
  taraweeh?: boolean;
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

/** Where a wall decoration hangs: which wall (L = left, R = right) and how far along it (world units). */
export interface WallPlaced {
  itemId: ItemId;
  wall: "L" | "R";
  u: number;
}

/** Where a piece of furniture sits. rot 1 = mirrored (footprint w/d swapped). */
export interface PlacedItem {
  itemId: ItemId;
  tx: number;
  ty: number;
  rot: 0 | 1;
}

export interface Streaks {
  prayers: number;
  wake: number;
  clean: number;
  diet: number;
  /** Days where everything was done. */
  perfect: number;
  /** Weeks in a row with 4+ gym visits. */
  gymWeeks: number;
  quran: number;
  bed: number;
  /** Fridays in a row with Jumu'ah. */
  jumuah: number;
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
  /** Coins spent in the catalog (for earning-rate math). */
  spent: number;
  gym: number;
  gymWeeksDone: number;
  quranPages: number;
  khatms: number;
  bedOnTime: number;
  jumuah: number;
  fasts: number;
  taraweeh: number;
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
  | { kind: "unlock"; id: ItemId; at: number }
  | { kind: "body"; stage: number; up: boolean; at: number }
  | { kind: "khatm"; count: number; at: number };

export interface Settings {
  /** "HH:MM" */
  wakeTarget: string;
  wakeGraceMin: number;
  /** "HH:MM", latest on-time bedtime. */
  bedtime: string;
  quranGoal: number;
  ramadan: boolean;
  /** Room lights (only matters in the evening). Bedtime turns them off, waking up turns them on. */
  lights: boolean;
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
  car: ItemId;
}

export interface Body {
  /** 0..4 */
  stage: number;
  /** Progress toward stages; drops back when two weeks in a row are missed. */
  points: number;
  missedInRow: number;
}

export interface GameState {
  version: 4;
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
  placements: PlacedItem[];
  wallPlacements: WallPlaced[];
  equipped: Equipped;
  body: Body;
  /** First dates that new trackers can charge for (so starting mid-week or mid-day is fair). */
  since: { gym: string; quran: string; bed: string };
  badges: Record<string, number>;
  inbox: InboxEntry[];
  /** Catalog ids the player has already seen (for "NEW" tags). */
  seen: ItemId[];
  /** End-of-day totals for the earning-rate planner: earned = coins + spent. */
  history: Record<string, { earned: number; xp: number }>;
  /** Room goes dark and messy after a relapse or a day with zero prayers. */
  gloomy: boolean;
  settings: Settings;
  log: GameEvent[];
}
