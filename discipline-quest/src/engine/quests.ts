import { PRAYERS, type DayLog, type GameState } from "./types";

export interface QuestDef {
  id: string;
  text: string;
  coins: number;
  xp: number;
  done: (d: DayLog, s: GameState) => boolean;
  /** Only offer when this holds (e.g. you have custom habits). */
  when?: (s: GameState) => boolean;
}

const onPlanMeals = (d: DayLog) => d.meals.filter((m) => m.onPlan).length;
const hourOf = (t?: number) => (t ? new Date(t).getHours() + new Date(t).getMinutes() / 60 : 99);

export const QUESTS: QuestDef[] = [
  { id: "fajr-wake", text: "Pray Fajr and check in awake on time", coins: 20, xp: 20, done: (d) => d.prayers.fajr && d.wake === "ok" },
  { id: "all-five", text: "Pray all 5 prayers", coins: 25, xp: 25, done: (d) => PRAYERS.every((p) => d.prayers[p]) },
  { id: "dhuhr-asr", text: "Pray Dhuhr and Asr", coins: 15, xp: 15, done: (d) => d.prayers.dhuhr && d.prayers.asr },
  { id: "maghrib-isha", text: "Pray Maghrib and Isha", coins: 15, xp: 15, done: (d) => d.prayers.maghrib && d.prayers.isha },
  { id: "early-bird", text: "Check in awake before 08:00", coins: 25, xp: 25, done: (d) => d.wake === "ok" && hourOf(d.wokeAt) < 8 },
  { id: "meals-2", text: "Log 2 on-plan meals", coins: 15, xp: 15, done: (d) => d.diet !== "cheat" && onPlanMeals(d) >= 2 },
  { id: "meals-3", text: "Log 3 on-plan meals", coins: 25, xp: 25, done: (d) => d.diet !== "cheat" && onPlanMeals(d) >= 3 },
  { id: "breakfast", text: "Log an on-plan meal before noon", coins: 15, xp: 15, done: (d) => d.diet !== "cheat" && d.meals.some((m) => m.onPlan && hourOf(m.at) < 12) },
  { id: "diet-checkin", text: "Do the evening diet check-in", coins: 15, xp: 15, done: (d) => d.diet === "on" },
  { id: "urge", text: "Beat an urge with the urge timer", coins: 20, xp: 20, done: (d) => d.urgesResisted > 0 && d.relapses === 0 },
  { id: "gym", text: "Go to the gym today", coins: 20, xp: 20, done: (d) => !!d.gym },
  { id: "quran-goal", text: "Read your daily Quran pages", coins: 15, xp: 15, done: (d, s) => (d.quranPages ?? 0) >= s.settings.quranGoal },
  { id: "quran-5", text: "Read 5 pages of Quran", coins: 25, xp: 25, done: (d) => (d.quranPages ?? 0) >= 5 },
  { id: "bed", text: "Check in for bed on time tonight", coins: 20, xp: 20, done: (d) => d.bed === "ok" },
  { id: "fast", text: "Fast today", coins: 20, xp: 20, done: (d) => !!d.fasted, when: (s) => s.settings.ramadan },
  {
    id: "habits",
    text: "Finish all your own habits",
    coins: 20,
    xp: 20,
    done: (d, s) => s.customHabits.filter((h) => !h.archived && h.createdDate <= d.date).every((h) => d.custom[h.id]),
    when: (s) => s.customHabits.some((h) => !h.archived),
  },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Three quests per day, stable for the whole day. */
export function questsFor(date: string, s: GameState): QuestDef[] {
  const pool = QUESTS.filter((q) => !q.when || q.when(s));
  return pool
    .map((q) => ({ q, k: hash(date + q.id) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 3)
    .map((x) => x.q);
}
