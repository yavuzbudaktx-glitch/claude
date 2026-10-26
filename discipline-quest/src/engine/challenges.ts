import { addDays, daysBetween, minutesOfDay, parseKey } from "./dates";
import { PRAYERS, type DayLog, type GameState } from "./types";

/**
 * Monthly challenges: pick one of three offers each month. "auto" ones are measured from what you
 * already log; "tick" ones you mark yourself, once a day. Failing costs nothing; winning pays coins,
 * XP and that month's rare item.
 */
export interface ChallengeDef {
  id: string;
  name: string;
  desc: string;
  kind: "auto" | "tick";
  group: "Prayer" | "Mornings" | "Gym" | "Quran" | "Clean" | "Diet" | "Overall" | "Screens" | "Body" | "Mind" | "Deen" | "Habits";
  /** Target for a full month. Ignored when `all` is set (then every day counts). */
  target: number;
  /** Every day from when you started counts (e.g. Fajr every day). */
  all?: boolean;
  /** Counted in weeks: a week counts once it has a tick (or meets the rule). */
  weekly?: boolean;
  unit: string;
  /** auto: how much one day contributes. */
  perDay?: (d: DayLog, s: GameState) => number;
}

const allFive = (d: DayLog) => PRAYERS.every((p) => d.prayers[p]);

const A = (
  id: string, name: string, group: ChallengeDef["group"], desc: string, target: number, unit: string,
  perDay: ChallengeDef["perDay"], extra: Partial<ChallengeDef> = {},
): ChallengeDef => ({ id, name, desc, kind: "auto", group, target, unit, perDay, ...extra });
const T = (id: string, name: string, group: ChallengeDef["group"], desc: string, target: number, extra: Partial<ChallengeDef> = {}): ChallengeDef => ({
  id, name, desc, kind: "tick", group, target, unit: extra.weekly ? "weeks" : "days", ...extra,
});

export const CHALLENGES: ChallengeDef[] = [
  // ---- measured from your logs ----
  A("prayers-25", "Five a Day", "Prayer", "All 5 prayers on 25 days this month.", 25, "days", (d) => (allFive(d) ? 1 : 0)),
  A("fajr-all", "Fajr Every Day", "Prayer", "Don't miss a single Fajr this month.", 0, "days", (d) => (d.prayers.fajr ? 1 : 0), { all: true }),
  A("jumuah-all", "Every Jumu'ah", "Prayer", "Pray Jumu'ah every Friday this month.", 0, "Fridays", (d) => (d.prayers.dhuhr ? 1 : 0), { all: true }),
  A("prayers-100", "100 Prayers", "Prayer", "Check off 100 prayers this month.", 100, "prayers", (d) => PRAYERS.filter((p) => d.prayers[p]).length),
  A("wake-22", "Early Riser", "Mornings", "Up on time on 22 days.", 22, "days", (d) => (d.wake === "ok" ? 1 : 0)),
  A("wake-0800", "Before Eight", "Mornings", "Checked in awake before 08:00 on 15 days.", 15, "days", (d) => (d.wokeAt && minutesOfDay(new Date(d.wokeAt)) < 480 ? 1 : 0)),
  A("bed-20", "Lights Out", "Mornings", "In bed on time on 20 nights.", 20, "nights", (d) => (d.bed === "ok" ? 1 : 0)),
  A("gym-16", "Sixteen Sessions", "Gym", "16 gym visits this month.", 16, "visits", (d) => (d.gym ? 1 : 0)),
  A("gymweeks-4", "Four Full Weeks", "Gym", "Hit 4 gym visits in 4 different weeks.", 4, "weeks", undefined, { weekly: true }),
  A("quran-20", "Daily Quran", "Quran", "Reach your Quran goal on 20 days.", 20, "days", (d, s) => ((d.quranPages ?? 0) >= s.settings.quranGoal ? 1 : 0)),
  A("quran-150", "150 Pages", "Quran", "Read 150 pages of Quran this month.", 150, "pages", (d) => d.quranPages ?? 0),
  A("khatm", "Khatm in a Month", "Quran", "Read the whole Quran (604 pages) this month. Hard.", 604, "pages", (d) => d.quranPages ?? 0),
  A("clean-all", "Clean Month", "Clean", "No relapse all month. Every clean day counts.", 0, "days", (d) => (d.relapses === 0 ? 1 : 0), { all: true }),
  A("urges-20", "Urge Slayer", "Clean", "Beat 20 urges with the urge timer.", 20, "urges", (d) => d.urgesResisted),
  A("diet-22", "On Plan", "Diet", "Diet on plan on 22 days.", 22, "days", (d) => (d.diet === "on" ? 1 : 0)),
  A("perfect-10", "Ten Perfect Days", "Overall", "All prayers, up on time, on plan and clean: 10 days.", 10, "days", (d) => (allFive(d) && d.wake === "ok" && d.diet === "on" && d.relapses === 0 ? 1 : 0)),
  A("quests-15", "Quest Hunter", "Overall", "Finish all three daily quests on 15 days.", 15, "days", (d) => (d.quests?.length && d.quests.every((q) => d.questsDone?.includes(q)) ? 1 : 0)),

  // ---- you tick these yourself ----
  T("no-social-isha", "Offline After Isha", "Screens", "No social media after Isha.", 20),
  T("no-phone-bed", "No Phone in Bed", "Screens", "The phone stays out of bed.", 20),
  T("phone-out", "Phone Out of the Bedroom", "Screens", "Charge it in another room overnight.", 18),
  T("no-scroll", "No Scrolling", "Screens", "No YouTube Shorts, Reels or TikTok.", 20),
  T("screen-2h", "Two Hours Max", "Screens", "Under 2 hours of screen time for fun.", 18),
  T("no-gaming-weekdays", "Weekday Focus", "Screens", "No gaming Monday to Friday.", 18),
  T("no-sugar", "Sugar Free", "Body", "No added sugar.", 20),
  T("no-energy", "No Energy Drinks", "Body", "Not a single can.", 22),
  T("no-fastfood", "No Fast Food", "Body", "Cook it or skip it.", 22),
  T("cold-shower", "Cold Showers", "Body", "End every shower cold.", 20),
  T("steps-10k", "10k Steps", "Body", "Walk 10,000 steps.", 18),
  T("water-3l", "Three Litres", "Body", "Drink 3 litres of water.", 20),
  T("stretch-10", "Ten-Minute Stretch", "Body", "Stretch for 10 minutes.", 20),
  T("pushups-50", "50 Push-ups", "Body", "50 push-ups, any sets.", 20),
  T("read-10", "Ten Pages", "Mind", "Read 10 pages of a (non-Quran) book.", 20),
  T("learn-20", "Learn Something", "Mind", "20 minutes learning a skill.", 18),
  T("journal", "One Line a Day", "Mind", "Write one line about your day.", 22),
  T("clarinet-15", "Clarinet Practice", "Mind", "Practise clarinet for 15 minutes.", 16),
  T("adhkar", "Morning & Evening Adhkar", "Deen", "Say the morning and evening adhkar.", 20),
  T("sunnah", "Sunnah Prayer", "Deen", "Pray a sunnah, like 2 rak'ah before Fajr.", 20),
  T("sadaqah", "Weekly Sadaqah", "Deen", "Give some sadaqah every week.", 4, { weekly: true }),
  T("call-parents", "Call Your Parents", "Deen", "Call your parents every week.", 4, { weekly: true }),
  T("make-bed", "Make Your Bed", "Habits", "Make your bed in the morning.", 24),
  T("no-swearing", "Clean Mouth", "Habits", "No swearing all day.", 20),
];

export const CHALLENGE_BY_ID: Record<string, ChallengeDef> = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

export const monthOf = (date: string) => date.slice(0, 7);
export const monthStart = (month: string) => `${month}-01`;
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}
export const daysInMonth = (month: string) => Number(monthEnd(month).slice(8));

function hash(str: string) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Three offers for a month: one measured, one you tick, one of either; never last month's. */
export function offersFor(month: string, lastId?: string): ChallengeDef[] {
  const pool = CHALLENGES.filter((c) => c.id !== lastId);
  const rank = (c: ChallengeDef) => hash(`${month}:${c.id}`);
  const sorted = [...pool].sort((a, b) => rank(a) - rank(b));
  const auto = sorted.find((c) => c.kind === "auto")!;
  const tick = sorted.find((c) => c.kind === "tick")!;
  const third = sorted.find((c) => c !== auto && c !== tick)!;
  return [auto, tick, third];
}

/** Dates in the challenge window: from the day you took it to the end of the month. */
export const challengeDays = (month: string, startedOn: string) => daysBetween(startedOn > monthStart(month) ? startedOn : monthStart(month), monthEnd(month));

const mondayOfKey = (key: string) => addDays(key, -((parseKey(key).getDay() + 6) % 7));

/** The target, scaled down when you start partway through the month. */
export function targetFor(def: ChallengeDef, month: string, startedOn: string): number {
  const days = challengeDays(month, startedOn);
  if (def.all) return def.id === "jumuah-all" ? Math.max(1, days.filter((d) => parseKey(d).getDay() === 5).length) : days.length;
  const share = days.length / daysInMonth(month);
  return Math.max(1, Math.ceil(def.target * share));
}

/** Progress so far (only days up to `today` count). */
export function progressOf(s: GameState, def: ChallengeDef, month: string, startedOn: string, ticks: string[], today: string): number {
  const days = challengeDays(month, startedOn).filter((d) => d <= today);
  if (def.kind === "tick") {
    const hit = ticks.filter((t) => days.includes(t));
    return def.weekly ? new Set(hit.map(mondayOfKey)).size : hit.length;
  }
  if (def.id === "gymweeks-4") {
    const weeks = new Set(days.map(mondayOfKey));
    let n = 0;
    for (const m of weeks) {
      let visits = 0;
      for (let i = 0; i < 7; i++) if (s.days[addDays(m, i)]?.gym) visits++;
      if (visits >= 4) n++;
    }
    return n;
  }
  if (def.id === "clean-all" && days.some((d) => (s.days[d]?.relapses ?? 0) > 0)) return 0;
  const pool = def.id === "jumuah-all" ? days.filter((d) => parseKey(d).getDay() === 5) : days;
  return pool.reduce((n, d) => n + (s.days[d] ? (def.perDay?.(s.days[d], s) ?? 0) : 0), 0);
}
