// Shared keys + helpers for the dashboard settings page. Everything here is
// stored through PrefsProvider (usePref) so it syncs across devices, except
// the nutrition GOALS which live in the `body_profile` blob alongside the
// weight tracker (edited in two places, kept as one source of truth).

export type GymDay = "off" | "gym" | "A" | "B";
export type GymSchedule = Record<number, GymDay>; // keyed by JS getDay(): 0=Sun … 6=Sat

export const GYM_PREF_KEY = "hub.gym.v1";
export const ROLLOVER_PREF_KEY = "hub.nutrition.rolloverHour";
export const DEFAULT_ROLLOVER_HOUR = 5;

// A sensible starting split; the user reshapes it in settings.
export const DEFAULT_GYM: GymSchedule = { 0: "off", 1: "A", 2: "off", 3: "B", 4: "off", 5: "A", 6: "off" };

// Sunday-first to match JS getDay(); the settings UI reorders to Mon-first.
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_NARROW = ["S", "M", "T", "W", "T", "F", "S"];
// Monday-first display order (indexes into the Sunday-based arrays above).
export const MON_FIRST_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const GYM_CYCLE: GymDay[] = ["off", "gym", "A", "B"];

export function gymLabel(v: GymDay): string {
  if (v === "off") return "Rest day";
  if (v === "gym") return "Gym day";
  return `Workout ${v}`;
}

export function isGymDay(v: GymDay): boolean {
  return v !== "off";
}
