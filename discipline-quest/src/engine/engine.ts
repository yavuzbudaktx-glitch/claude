import { BADGES } from "./badges";
import {
  CAR_UNLOCKS,
  CATALOG,
  DEFAULT_EQUIPPED,
  EQUIP_SLOT,
  GYM_TIERS,
  ITEMS,
  REMOVED_REFUNDS,
  STARTERS,
  TIER_ORDER,
  tierOf,
  type GymTier,
} from "./catalog";
import { addDays, dateKey, daysBetween, minutesOfDay, parseHM, parseKey } from "./dates";
import { PREFERRED, autoPlace, checkPlace, roomN, settle, spaceOf } from "./placement";
import { autoWall, checkWall } from "./wall";
import { QUEST_BY_ID, questsFor } from "./quests";
import { RULES, levelFor } from "./rules";
import {
  PRAYERS,
  PRAYER_LABELS,
  type Body,
  type CustomHabit,
  type DayLog,
  type GameEvent,
  type GameState,
  type ItemId,
  type LifetimeStats,
  type PlacedItem,
  type Space,
  type WallPlaced,
  type PrayerName,
  type Streaks,
} from "./types";

const emptyStreaks = (): Streaks => ({ prayers: 0, wake: 0, clean: 0, diet: 0, perfect: 0, gymWeeks: 0, quran: 0, bed: 0, jumuah: 0, custom: {} });
const emptyStats = (): LifetimeStats => ({
  prayers: 0, fajr: 0, fullPrayerDays: 0, cleanDays: 0, urges: 0, wakeOnTime: 0, dietDays: 0, mealsOnPlan: 0,
  perfectDays: 0, quests: 0, bought: 0, spent: 0, gym: 0, gymWeeksDone: 0, quranPages: 0, khatms: 0,
  bedOnTime: 0, jumuah: 0, fasts: 0, taraweeh: 0,
});
const emptyBody = (): Body => ({ stage: 0, points: 0, missedInRow: 0 });

export const BODY_THRESHOLDS = [0, 2, 5, 9, 14];
export const BODY_NAMES = ["Starting out", "Getting there", "Fit", "Athletic", "Built"];

/** Monday of the week containing this date. */
export function mondayOf(date: string): string {
  const d = parseKey(date);
  return addDays(date, -((d.getDay() + 6) % 7));
}
export const isFriday = (date: string) => parseKey(date).getDay() === 5;
export const isSunday = (date: string) => parseKey(date).getDay() === 0;

const defaultPlacements = (): PlacedItem[] =>
  (["bed", "kitchen", "prayerrug"] as const).map((id) => ({ itemId: id, tx: PREFERRED[id][0], ty: PREFERRED[id][1], rot: 0 as const }));

function freshSince(today: string) {
  return { gym: addDays(mondayOf(today), 7), quran: addDays(today, 1), bed: addDays(today, 1) };
}

export function createInitialState(now: Date): GameState {
  const today = dateKey(now);
  const s: GameState = {
    version: 5,
    startDate: today,
    lastSettled: addDays(today, -1),
    days: { [today]: emptyDay(today) },
    coins: 0,
    xp: 0,
    streaks: emptyStreaks(),
    best: emptyStreaks(),
    stats: emptyStats(),
    customHabits: [],
    inventory: [],
    placements: defaultPlacements(),
    wallPlacements: [],
    equipped: { ...DEFAULT_EQUIPPED },
    body: emptyBody(),
    since: freshSince(today),
    badges: {},
    inbox: [],
    seen: CATALOG.filter((c) => c.level <= 1).map((c) => c.id),
    history: {},
    gloomy: false,
    settings: { wakeTarget: "08:30", wakeGraceMin: 15, bedtime: "23:30", quranGoal: 2, ramadan: false, lights: true, notifications: false, sound: false },
    log: [{ at: now.getTime(), text: "Your room is ready. Stay disciplined.", kind: "info" }],
  };
  s.days[today].quests = questsFor(today, s).map((q) => q.id);
  return s;
}

export function emptyDay(date: string): DayLog {
  return {
    date,
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    wake: "pending",
    diet: "pending",
    meals: [],
    urgesResisted: 0,
    relapses: 0,
    custom: {},
    questsDone: [],
  };
}

const clone = <T>(v: T): T => structuredClone(v);

function earn(s: GameState, now: Date, coins: number, xp: number, text: string, kind: GameEvent["kind"]) {
  const before = levelFor(s.xp).level;
  s.coins += coins;
  s.xp = Math.max(0, s.xp + xp);
  s.log.unshift({ at: now.getTime(), text, coins, kind });
  if (s.log.length > RULES.logLimit) s.log.length = RULES.logLimit;
  const after = levelFor(s.xp).level;
  if (after > before) {
    s.inbox.push({ kind: "level", level: after, at: now.getTime() });
    s.log.unshift({ at: now.getTime(), text: `Reached level ${after}`, kind: "good" });
  }
}

function bumpBest(s: GameState) {
  const b = s.best as unknown as Record<string, number>;
  const c = s.streaks as unknown as Record<string, number>;
  for (const k of ["prayers", "wake", "clean", "diet", "perfect", "gymWeeks", "quran", "bed", "jumuah"]) b[k] = Math.max(b[k] ?? 0, c[k] ?? 0);
  for (const [id, v] of Object.entries(s.streaks.custom)) s.best.custom[id] = Math.max(s.best.custom[id] ?? 0, v);
}

export function activeCustom(s: GameState, date: string): CustomHabit[] {
  return s.customHabits.filter((h) => !h.archived && h.createdDate <= date);
}

export function owns(s: GameState, id: ItemId): boolean {
  return STARTERS.includes(id) || s.inventory.some((i) => i.itemId === id);
}

export function isLocked(s: GameState, id: ItemId): boolean {
  return s.inventory.some((i) => i.itemId === id && i.lockDaysLeft > 0);
}

/** Usable right now: owned and not relapse-locked. */
export function usable(s: GameState, id: ItemId): boolean {
  return owns(s, id) && !isLocked(s, id);
}

function grant(s: GameState, now: Date, id: ItemId, celebrate: boolean) {
  if (s.inventory.some((i) => i.itemId === id)) return;
  s.inventory.push({ uid: `${id}-${now.getTime()}`, itemId: id, acquiredAt: now.getTime(), lockDaysLeft: 0 });
  const spot = autoPlace(s, id);
  if (spot) s.placements.push(spot);
  const hang = autoWall(s, id);
  if (hang) s.wallPlacements.push(hang);
  if (celebrate) s.inbox.push({ kind: "unlock", id, at: now.getTime() });
}

/** Pay out any badges whose goal is now met. Badges are permanent. */
function awardBadges(s: GameState, now: Date) {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const b of BADGES) {
      if (s.badges[b.id]) continue;
      const [cur, target] = b.progress(s);
      if (cur < target) continue;
      s.badges[b.id] = now.getTime();
      s.inbox.push({ kind: "badge", id: b.id, at: now.getTime() });
      earn(s, now, b.coins, b.xp, `Badge earned: ${b.name}`, "good");
      changed = true;
    }
    if (!changed) break;
  }
}

/** Pay quests that are now complete and take back ones that no longer are (e.g. a prayer was unchecked). */
function syncQuests(s: GameState, date: string, now: Date) {
  const day = s.days[date];
  if (!day?.quests) return;
  day.questsDone ??= [];
  for (const id of day.quests) {
    const q = QUEST_BY_ID[id];
    if (!q) continue;
    const done = q.done(day, s);
    const paid = day.questsDone.includes(id);
    if (done && !paid) {
      day.questsDone.push(id);
      s.stats.quests++;
      earn(s, now, q.coins, q.xp, `Quest done: ${q.text}`, "good");
    } else if (!done && paid) {
      day.questsDone = day.questsDone.filter((x) => x !== id);
      s.stats.quests--;
      earn(s, now, -q.coins, -q.xp, `Quest undone: ${q.text}`, "info");
    }
  }
}

const quranCounts = (s: GameState, date: string) => date >= s.since.quran;

function isPerfect(s: GameState, day: DayLog) {
  return (
    PRAYERS.every((p) => day.prayers[p]) &&
    day.wake === "ok" &&
    day.diet === "on" &&
    day.relapses === 0 &&
    (!quranCounts(s, day.date) || (day.quranPages ?? 0) >= s.settings.quranGoal) &&
    activeCustom(s, day.date).every((h) => day.custom[h.id])
  );
}

export function gymCountInWeek(s: GameState, monday: string): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (s.days[addDays(monday, i)]?.gym) n++;
  return n;
}

export function stageFor(points: number): number {
  let st = 0;
  BODY_THRESHOLDS.forEach((t, i) => points >= t && (st = i));
  return st;
}

/** The first full gym week opens the gym room. */
function unlockGym(s: GameState, now: Date) {
  if (owns(s, "gym-garage")) return;
  s.equipped.gym = "gym-garage";
  grant(s, now, "gym-garage", true);
  // Fitness gear you already own moves over if it fits.
  for (const p of [...s.placements]) {
    if (ITEMS[p.itemId]?.category !== "fitness") continue;
    s.placements = s.placements.filter((q) => q.itemId !== p.itemId);
    const spot = autoPlace(s, p.itemId, "gym");
    s.placements.push(spot ?? p);
  }
  for (const i of s.inventory) {
    if (ITEMS[i.itemId]?.space !== "gym") continue;
    if (!s.placements.some((p) => p.itemId === i.itemId)) {
      const spot = autoPlace(s, i.itemId);
      if (spot) s.placements.push(spot);
    }
    if (!s.wallPlacements.some((w) => w.itemId === i.itemId)) {
      const hang = autoWall(s, i.itemId);
      if (hang) s.wallPlacements.push(hang);
    }
  }
}

/** Sunday night: did you make 4 gym visits this week? */
function settleGymWeek(s: GameState, monday: string, now: Date) {
  const count = gymCountInWeek(s, monday);
  const b = s.body;
  if (count >= RULES.gym.perWeek) {
    s.streaks.gymWeeks++;
    s.stats.gymWeeksDone++;
    b.missedInRow = 0;
    b.points++;
    earn(s, now, RULES.gym.weekCoins, RULES.gym.weekXp, `Gym week done: ${count} visits`, "good");
    unlockGym(s, now);
    const st = stageFor(b.points);
    if (st > b.stage) {
      b.stage = st;
      s.inbox.push({ kind: "body", stage: st, up: true, at: now.getTime() });
    }
  } else if (monday >= s.since.gym) {
    s.streaks.gymWeeks = 0;
    b.missedInRow++;
    earn(s, now, -RULES.gym.missWeekCoins, 0, `Gym week missed: ${count}/${RULES.gym.perWeek}`, "bad");
    if (b.missedInRow >= 2 && b.stage > 0) {
      b.stage--;
      b.points = BODY_THRESHOLDS[b.stage];
      b.missedInRow = 0;
      s.inbox.push({ kind: "body", stage: b.stage, up: false, at: now.getTime() });
      s.log.unshift({ at: now.getTime(), text: "Two missed gym weeks: your body slipped back a stage", kind: "bad" });
    }
  }
}

/** Apply end-of-day misses and streaks for one finished day. */
function settleDay(s: GameState, date: string, now: Date) {
  const day = s.days[date] ?? (s.days[date] = emptyDay(date));
  const missed = PRAYERS.filter((p) => !day.prayers[p]);

  if (missed.length === 0) {
    s.streaks.prayers++;
    s.stats.fullPrayerDays++;
  } else {
    s.streaks.prayers = 0;
    earn(s, now, -missed.length * RULES.prayer.missCoins, 0,
      `${date}: missed ${missed.map((p) => (p === "dhuhr" && isFriday(date) ? "Jumu'ah" : PRAYER_LABELS[p])).join(", ")}`, "bad");
  }
  if (isFriday(date)) {
    if (day.prayers.dhuhr) {
      s.streaks.jumuah++;
      s.stats.jumuah++;
    } else s.streaks.jumuah = 0;
  }

  if (day.wake === "ok") s.streaks.wake++;
  else if (day.wake === "pending") {
    s.streaks.wake = 0;
    earn(s, now, -RULES.wake.missCoins, 0, `${date}: never checked in awake`, "bad");
  }

  if (day.diet === "on") {
    s.streaks.diet++;
    s.stats.dietDays++;
  } else if (day.diet === "pending") {
    s.streaks.diet = 0;
    earn(s, now, -RULES.diet.missCoins, 0, `${date}: no diet check-in`, "bad");
  }

  // Quran is never charged: missing the goal only resets the streak.
  if (quranCounts(s, date)) {
    if ((day.quranPages ?? 0) >= s.settings.quranGoal) s.streaks.quran++;
    else s.streaks.quran = 0;
  }

  // Bedtime is a night thing, so yesterday's bed check-in is settled today.
  const prev = addDays(date, -1);
  if (prev >= s.since.bed && s.days[prev]) {
    const b = s.days[prev].bed ?? "pending";
    if (b === "ok") s.streaks.bed++;
    else {
      s.streaks.bed = 0;
      if (b === "pending") earn(s, now, -RULES.bed.missCoins, 0, `${prev}: no bedtime check-in`, "bad");
    }
  }

  if (day.relapses > 0) s.streaks.clean = 0;
  else {
    s.streaks.clean++;
    s.stats.cleanDays++;
    earn(s, now, RULES.cleanDay.coins, RULES.cleanDay.xp, `${date}: clean day #${s.streaks.clean}`, "good");
    for (const item of s.inventory) if (item.lockDaysLeft > 0) item.lockDaysLeft--;
  }

  for (const h of activeCustom(s, date)) {
    if (day.custom[h.id]) s.streaks.custom[h.id] = (s.streaks.custom[h.id] ?? 0) + 1;
    else {
      s.streaks.custom[h.id] = 0;
      earn(s, now, -RULES.custom.missCoins, 0, `${date}: missed "${h.name}"`, "bad");
    }
  }

  if (isPerfect(s, day)) {
    s.streaks.perfect++;
    s.stats.perfectDays++;
    earn(s, now, RULES.perfectDay.coins, RULES.perfectDay.xp, `${date}: perfect day!`, "good");
  } else s.streaks.perfect = 0;

  if (isSunday(date)) settleGymWeek(s, mondayOf(date), now);

  s.gloomy = day.relapses > 0 || missed.length === PRAYERS.length;

  for (const u of CAR_UNLOCKS) {
    if (s.streaks.clean >= u.cleanDays && !owns(s, u.id)) {
      grant(s, now, u.id, true);
      earn(s, now, 0, 100, `Unlocked the ${ITEMS[u.id].name}: ${u.cleanDays} clean days!`, "good");
    }
  }
  bumpBest(s);

  s.history[date] = { earned: s.coins + s.stats.spent, xp: s.xp };
  const keys = Object.keys(s.history).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete s.history[k];
}

/**
 * Settle every finished day since the last visit (absent days count as full misses)
 * and make sure today's log exists. Returns the same object if nothing changed.
 */
export function ensureToday(state: GameState, now: Date): GameState {
  const today = dateKey(now);
  const from = state.lastSettled ? addDays(state.lastSettled, 1) : state.startDate;
  const pending = daysBetween(from, addDays(today, -1));
  if (pending.length === 0 && state.days[today]?.quests) return state;
  const s = clone(state);
  for (const d of pending) settleDay(s, d, now);
  if (pending.length) s.lastSettled = pending[pending.length - 1];
  if (!s.days[today]) s.days[today] = emptyDay(today);
  if (!s.days[today].quests) s.days[today].quests = questsFor(today, s).map((q) => q.id);
  awardBadges(s, now);
  return s;
}

function withToday(state: GameState, now: Date, fn: (s: GameState, day: DayLog) => void): GameState {
  const s = clone(ensureToday(state, now));
  const today = dateKey(now);
  fn(s, s.days[today]);
  syncQuests(s, today, now);
  bumpBest(s);
  awardBadges(s, now);
  return s;
}

export function setPrayer(state: GameState, now: Date, p: PrayerName, done: boolean): GameState {
  return withToday(state, now, (s, day) => {
    if (day.prayers[p] === done) return;
    const wasAll = PRAYERS.every((x) => day.prayers[x]);
    day.prayers[p] = done;
    const isAll = PRAYERS.every((x) => day.prayers[x]);
    const sign = done ? 1 : -1;
    const jumuah = p === "dhuhr" && isFriday(day.date);
    const label = jumuah ? "Jumu'ah" : PRAYER_LABELS[p];
    s.stats.prayers += sign;
    if (p === "fajr") s.stats.fajr += sign;
    earn(s, now, sign * RULES.prayer.coins, sign * RULES.prayer.xp, done ? `Prayed ${label}` : `Unmarked ${label}`, done ? "good" : "info");
    if (jumuah) earn(s, now, sign * RULES.jumuah.coins, sign * RULES.jumuah.xp, done ? "Jumu'ah bonus" : "Jumu'ah bonus taken back", done ? "good" : "info");
    if (isAll && !wasAll) earn(s, now, RULES.allPrayersBonus.coins, RULES.allPrayersBonus.xp, "All 5 prayers today!", "good");
    if (wasAll && !isAll) earn(s, now, -RULES.allPrayersBonus.coins, -RULES.allPrayersBonus.xp, "Lost all-prayers bonus", "info");
  });
}

export type WakeWindow = "too-early" | "on-time" | "late" | "missed";

export function wakeWindow(state: GameState, now: Date): WakeWindow {
  const m = minutesOfDay(now);
  if (m < RULES.wakeEarliestHour * 60) return "too-early";
  if (m <= parseHM(state.settings.wakeTarget) + state.settings.wakeGraceMin) return "on-time";
  // A late check-in still counts as waking up until noon; after that the morning is gone.
  return m < RULES.wakeLatestHour * 60 ? "late" : "missed";
}

export function wakeCheckIn(state: GameState, now: Date): GameState {
  const win = wakeWindow(state, now);
  if (win === "too-early" || win === "missed") return state;
  return withToday(state, now, (s, day) => {
    if (day.wake !== "pending") return;
    day.wokeAt = now.getTime();
    s.settings.lights = true;
    if (win === "on-time") {
      day.wake = "ok";
      s.stats.wakeOnTime++;
      earn(s, now, RULES.wake.coins, RULES.wake.xp, "Up on time", "good");
    } else {
      day.wake = "late";
      s.streaks.wake = 0;
      earn(s, now, -RULES.wake.missCoins, 0, "Overslept", "bad");
    }
  });
}

// ---------- bedtime ----------

/** The night a bedtime check-in belongs to: before 04:00 counts as the previous evening. */
export function bedKey(now: Date): string {
  return dateKey(new Date(now.getTime() - RULES.wakeEarliestHour * 3600_000));
}

/** Minutes since noon-ish, so 00:30 sorts after 23:30. */
const nightMinutes = (m: number) => (m < 12 * 60 ? m + 24 * 60 : m);

export type BedWindow = "too-early" | "on-time" | "late";

export function bedWindow(state: GameState, now: Date): BedWindow {
  const raw = minutesOfDay(now);
  // Closed from the earliest wake-up (04:00) until the bed window opens (21:00).
  if (raw >= RULES.wakeEarliestHour * 60 && raw < RULES.bed.opensHour * 60) return "too-early";
  return nightMinutes(raw) <= nightMinutes(parseHM(state.settings.bedtime)) ? "on-time" : "late";
}

export function bedCheckIn(state: GameState, now: Date): GameState {
  const win = bedWindow(state, now);
  if (win === "too-early") return state;
  return withToday(state, now, (s) => {
    const k = bedKey(now);
    const day = s.days[k] ?? (s.days[k] = emptyDay(k));
    if (day.bed && day.bed !== "pending") return;
    day.bedAt = now.getTime();
    s.settings.lights = false;
    if (win === "on-time") {
      day.bed = "ok";
      s.stats.bedOnTime++;
      earn(s, now, RULES.bed.coins, RULES.bed.xp, "In bed on time", "good");
    } else {
      day.bed = "late";
      s.streaks.bed = 0;
      earn(s, now, -RULES.bed.missCoins, 0, "Late to bed", "bad");
    }
  });
}

/** Asleep in bed: from a bed check-in until the next wake-up, or before the morning wake-up check-in. */
export function isAsleep(s: GameState, now: Date): boolean {
  const today = dateKey(now);
  const night = s.days[bedKey(now)];
  if (night?.bedAt && night.bed && night.bed !== "pending") {
    if (bedKey(now) === today) return true;
    if ((s.days[today]?.wake ?? "pending") === "pending" && minutesOfDay(now) < RULES.wakeLatestHour * 60) return true;
  }
  const day = s.days[today];
  const deadline = parseHM(s.settings.wakeTarget) + s.settings.wakeGraceMin;
  return !!day && day.wake === "pending" && minutesOfDay(now) < deadline;
}

// ---------- diet ----------

export function dietCheckInOpen(now: Date): boolean {
  return now.getHours() >= RULES.diet.checkInFromHour;
}

export function dietCheckIn(state: GameState, now: Date): GameState {
  if (!dietCheckInOpen(now)) return state;
  return withToday(state, now, (s, day) => {
    if (day.diet !== "pending") return;
    day.diet = "on";
    earn(s, now, RULES.diet.coins, RULES.diet.xp, "Stayed on diet today", "good");
  });
}

export function logMeal(state: GameState, now: Date, note: string, onPlan: boolean): GameState {
  return withToday(state, now, (s, day) => {
    day.meals.push({ at: now.getTime(), note: note.trim() || (onPlan ? "On-plan meal" : "Cheat meal"), onPlan });
    if (onPlan) {
      s.stats.mealsOnPlan++;
      return;
    }
    if (day.diet === "cheat") return;
    if (day.diet === "on") earn(s, now, -RULES.diet.coins, -RULES.diet.xp, "Diet check-in revoked", "bad");
    day.diet = "cheat";
    s.streaks.diet = 0;
    earn(s, now, -RULES.diet.missCoins, 0, "Cheat meal: diet broken today", "bad");
  });
}

// ---------- purity ----------

export function resistUrge(state: GameState, now: Date): GameState {
  return withToday(state, now, (s, day) => {
    day.urgesResisted++;
    s.stats.urges++;
    if (day.urgesResisted <= RULES.urge.maxPerDay) earn(s, now, RULES.urge.coins, RULES.urge.xp, "Resisted an urge", "good");
    else s.log.unshift({ at: now.getTime(), text: "Resisted an urge", kind: "good" });
  });
}

export function relapse(state: GameState, now: Date): GameState {
  return withToday(state, now, (s, day) => {
    day.relapses++;
    s.streaks.clean = 0;
    s.gloomy = true;
    earn(s, now, -RULES.relapse.coins, 0, "Relapsed. Clean streak reset.", "bad");
    const victim = [...s.inventory].filter((i) => i.lockDaysLeft === 0).sort((a, b) => b.acquiredAt - a.acquiredAt)[0];
    if (victim) {
      victim.lockDaysLeft = RULES.relapse.lockDays;
      const slot = EQUIP_SLOT[ITEMS[victim.itemId]?.category];
      if (slot && s.equipped[slot] === victim.itemId) s.equipped[slot] = DEFAULT_EQUIPPED[slot];
      s.log.unshift({ at: now.getTime(), text: `${ITEMS[victim.itemId]?.name ?? victim.itemId} locked for ${RULES.relapse.lockDays} clean days`, kind: "bad" });
    }
  });
}

// ---------- gym, Quran, Ramadan ----------

export function setGym(state: GameState, now: Date, done: boolean): GameState {
  return withToday(state, now, (s, day) => {
    if (!!day.gym === done) return;
    day.gym = done;
    const sign = done ? 1 : -1;
    s.stats.gym += sign;
    earn(s, now, sign * RULES.gym.coins, sign * RULES.gym.xp, done ? "Went to the gym" : "Gym check-in removed", done ? "good" : "info");
  });
}

export function setQuranPages(state: GameState, now: Date, pages: number): GameState {
  return withToday(state, now, (s, day) => {
    const before = day.quranPages ?? 0;
    const after = Math.max(0, Math.min(604, Math.round(pages)));
    if (after === before) return;
    day.quranPages = after;
    s.stats.quranPages += after - before;
    const goal = s.settings.quranGoal;
    if (before < goal && after >= goal) earn(s, now, RULES.quran.coins, RULES.quran.xp, `Read ${after} pages of Quran`, "good");
    if (before >= goal && after < goal) earn(s, now, -RULES.quran.coins, -RULES.quran.xp, "Quran goal undone", "info");
    const khatms = Math.floor(s.stats.quranPages / 604);
    if (khatms > s.stats.khatms) {
      s.stats.khatms = khatms;
      s.inbox.push({ kind: "khatm", count: khatms, at: now.getTime() });
      earn(s, now, RULES.quran.khatmCoins, RULES.quran.khatmXp, `Khatm #${khatms}! You finished the Quran`, "good");
    }
  });
}

export function setFast(state: GameState, now: Date, done: boolean): GameState {
  return withToday(state, now, (s, day) => {
    if (!!day.fasted === done) return;
    day.fasted = done;
    const sign = done ? 1 : -1;
    s.stats.fasts += sign;
    earn(s, now, sign * RULES.ramadan.fastCoins, sign * RULES.ramadan.fastXp, done ? "Fasted today" : "Fast unmarked", done ? "good" : "info");
  });
}

export function setTaraweeh(state: GameState, now: Date, done: boolean): GameState {
  return withToday(state, now, (s, day) => {
    if (!!day.taraweeh === done) return;
    day.taraweeh = done;
    const sign = done ? 1 : -1;
    s.stats.taraweeh += sign;
    earn(s, now, sign * RULES.ramadan.taraweehCoins, sign * RULES.ramadan.taraweehXp, done ? "Prayed taraweeh" : "Taraweeh unmarked", done ? "good" : "info");
  });
}

// ---------- custom habits ----------

export function setCustom(state: GameState, now: Date, id: string, done: boolean): GameState {
  return withToday(state, now, (s, day) => {
    const h = s.customHabits.find((x) => x.id === id);
    if (!h || !!day.custom[id] === done) return;
    day.custom[id] = done;
    const sign = done ? 1 : -1;
    earn(s, now, sign * RULES.custom.coins, sign * RULES.custom.xp, `${done ? "Did" : "Unmarked"} "${h.name}"`, done ? "good" : "info");
  });
}

export function addCustomHabit(state: GameState, now: Date, name: string): GameState {
  const clean = name.trim();
  if (!clean) return state;
  return withToday(state, now, (s) => {
    s.customHabits.push({ id: `h${now.getTime().toString(36)}`, name: clean, createdDate: dateKey(now) });
  });
}

export function archiveCustomHabit(state: GameState, now: Date, id: string): GameState {
  return withToday(state, now, (s) => {
    const h = s.customHabits.find((x) => x.id === id);
    if (h) h.archived = true;
  });
}

// ---------- shop ----------

export function currentTierIndex(s: GameState): number {
  return TIER_ORDER.indexOf(tierOf(s.equipped.room));
}

export type BuyResult = "ok" | "debt" | "poor" | "owned" | "not-for-sale" | "level" | "tier" | "gym-visits" | "no-gym" | "gym-tier";

const gymIndex = (s: GameState) => GYM_TIERS.indexOf(s.equipped.gym as GymTier);

export function canBuy(state: GameState, id: ItemId): BuyResult {
  const item = ITEMS[id];
  if (!item || item.price === null) return "not-for-sale";
  if (owns(state, id)) return "owned";
  if (levelFor(state.xp).level < item.level) return "level";
  if (item.tier && currentTierIndex(state) < TIER_ORDER.indexOf(item.tier)) return "tier";
  if (item.category === "gymroom") {
    if (gymIndex(state) < 0) return "no-gym";
    if (GYM_TIERS.indexOf(id as GymTier) > gymIndex(state) + 1) return "gym-tier";
  }
  if (item.space === "gym" && gymIndex(state) < 0) return "no-gym";
  if (item.gymTier && gymIndex(state) < GYM_TIERS.indexOf(item.gymTier)) return "gym-tier";
  if (item.gymVisits && state.stats.gym < item.gymVisits) return "gym-visits";
  if (state.coins < 0) return "debt";
  if (state.coins < item.price) return "poor";
  return "ok";
}

export function buyItem(state: GameState, now: Date, id: ItemId): GameState {
  if (canBuy(state, id) !== "ok") return state;
  return withToday(state, now, (s) => {
    const item = ITEMS[id];
    const slot = EQUIP_SLOT[item.category];
    if (slot) s.equipped[slot] = id;
    grant(s, now, id, false);
    s.stats.bought++;
    s.stats.spent += item.price ?? 0;
    earn(s, now, -(item.price ?? 0), 0, `Bought ${item.name}`, "info");
  });
}

export function equip(state: GameState, id: ItemId): GameState {
  const item = ITEMS[id];
  const slot = item && EQUIP_SLOT[item.category];
  if (!slot || !usable(state, id) || state.equipped[slot] === id) return state;
  return { ...state, equipped: { ...state.equipped, [slot]: id } };
}

// ---------- decorating ----------

export function placeItem(state: GameState, p: PlacedItem): GameState {
  if (!owns(state, p.itemId) || checkPlace(state, p) !== "ok") return state;
  const it = ITEMS[p.itemId];
  if (it?.space && it.space !== spaceOf(p)) return state;
  const placed = settle(state, p);
  const prev = state.placements.find((q) => q.itemId === p.itemId);
  // Things standing on a moved piece move with it (or go to storage if it changed room or turned).
  const riders = state.placements.filter((q) => q.on === p.itemId);
  const moved = riders.flatMap((q) => {
    if (!prev || spaceOf(prev) !== spaceOf(p) || prev.rot !== p.rot) return [];
    return [{ ...q, tx: q.tx + p.tx - prev.tx, ty: q.ty + p.ty - prev.ty }];
  });
  return {
    ...state,
    placements: [...state.placements.filter((q) => q.itemId !== p.itemId && q.on !== p.itemId), placed, ...moved],
  };
}

/** Send something to the other room (it lands in the first free spot, or storage). */
export function moveToSpace(state: GameState, itemId: ItemId, space: Space): GameState {
  if (!owns(state, itemId) || !roomN(state, space)) return state;
  const it = ITEMS[itemId];
  if (it?.space && it.space !== space) return state;
  const s = clone(state);
  s.placements = s.placements.filter((q) => q.itemId !== itemId && q.on !== itemId);
  const spot = autoPlace(s, itemId, space);
  if (spot) s.placements.push(spot);
  return s;
}

const FIXTURES = ["bed", "kitchen", "prayerrug"];
export const canStore = (id: ItemId) => !FIXTURES.includes(id);

export function storeItem(state: GameState, itemId: ItemId): GameState {
  if (!canStore(itemId)) return state;
  return { ...state, placements: state.placements.filter((q) => q.itemId !== itemId && q.on !== itemId) };
}

export function placeWall(state: GameState, w: WallPlaced): GameState {
  if (!owns(state, w.itemId) || checkWall(state, w) !== "ok") return state;
  return { ...state, wallPlacements: [...state.wallPlacements.filter((q) => q.itemId !== w.itemId), w] };
}

export function storeWall(state: GameState, itemId: ItemId): GameState {
  return { ...state, wallPlacements: state.wallPlacements.filter((q) => q.itemId !== itemId) };
}

export function markSeen(state: GameState, ids: ItemId[]): GameState {
  const fresh = ids.filter((id) => !state.seen.includes(id));
  return fresh.length ? { ...state, seen: [...state.seen, ...fresh] } : state;
}

export function dismissInbox(state: GameState): GameState {
  return state.inbox.length ? { ...state, inbox: state.inbox.slice(1) } : state;
}

export function updateSettings(state: GameState, patch: Partial<GameState["settings"]>): GameState {
  return { ...state, settings: { ...state.settings, ...patch } };
}

/** Streak including today's progress, for display. */
export function liveStreaks(s: GameState, now: Date) {
  const day = s.days[dateKey(now)] ?? emptyDay(dateKey(now));
  return {
    prayers: s.streaks.prayers + (PRAYERS.every((p) => day.prayers[p]) ? 1 : 0),
    wake: s.streaks.wake + (day.wake === "ok" ? 1 : 0),
    diet: s.streaks.diet + (day.diet === "on" ? 1 : 0),
    clean: s.streaks.clean,
    quran: s.streaks.quran + ((day.quranPages ?? 0) >= s.settings.quranGoal ? 1 : 0),
    bed: s.streaks.bed + (s.days[bedKey(now)]?.bed === "ok" ? 1 : 0),
  };
}

// ---------- saves ----------

export function isGameState(v: unknown): boolean {
  const o = v as { version?: number; coins?: unknown; days?: unknown; inventory?: unknown };
  return !!o && [1, 2, 3, 4, 5].includes(o.version ?? 0) && typeof o.coins === "number" && typeof o.days === "object" && Array.isArray(o.inventory);
}

/** Bring any saved state (v1, v2 or v3) up to the current shape without losing progress. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(raw: any, now: Date): GameState {
  const s = clone(raw);
  const today = dateKey(now);
  if (s.version === 1) {
    const days = Object.values(s.days as Record<string, DayLog>);
    const settled = days.filter((d) => !s.lastSettled || d.date <= s.lastSettled);
    s.stats = {
      ...emptyStats(),
      prayers: days.reduce((n, d) => n + PRAYERS.filter((p) => d.prayers[p]).length, 0),
      fajr: days.filter((d) => d.prayers.fajr).length,
      fullPrayerDays: settled.filter((d) => PRAYERS.every((p) => d.prayers[p])).length,
      cleanDays: settled.filter((d) => d.relapses === 0).length,
      urges: days.reduce((n, d) => n + d.urgesResisted, 0),
      wakeOnTime: days.filter((d) => d.wake === "ok").length,
      dietDays: settled.filter((d) => d.diet === "on").length,
      mealsOnPlan: days.reduce((n, d) => n + d.meals.filter((m) => m.onPlan).length, 0),
    };
    s.inventory = s.inventory.map((i: { itemId: string }) => (i.itemId === "car" ? { ...i, itemId: "ioniq5" } : i));
    s.badges = {};
    s.inbox = [];
    s.seen = [];
    s.version = 2;
  }
  if (s.version === 2) {
    let refund = 0;
    const kept: { itemId: string }[] = [];
    for (const i of s.inventory as { itemId: string }[]) {
      if (i.itemId in REMOVED_REFUNDS) refund += REMOVED_REFUNDS[i.itemId];
      else if (i.itemId === "paint-gold") continue;
      else if (i.itemId === "piano") kept.push({ ...i, itemId: "clarinet" });
      else if (i.itemId === "ioniq5") kept.push({ ...i, itemId: "car-ioniq5" });
      else kept.push(i);
    }
    s.inventory = kept;
    if (refund) {
      s.coins += refund;
      s.log.unshift({ at: now.getTime(), text: `Retired items refunded: +${refund} coins`, coins: refund, kind: "info" });
    }
    const hadIoniq = kept.some((i) => i.itemId === "car-ioniq5");
    const eq = { ...DEFAULT_EQUIPPED, ...s.equipped };
    delete (eq as Record<string, unknown>).paint;
    eq.car = hadIoniq ? "car-ioniq5" : "car-mini";
    s.equipped = eq;
    s.streaks = { ...emptyStreaks(), ...s.streaks };
    s.best = { ...emptyStreaks(), ...s.best };
    s.stats = { ...emptyStats(), ...s.stats, spent: kept.reduce((n, i) => n + (ITEMS[i.itemId]?.price ?? 0), 0) };
    s.body = emptyBody();
    s.since = freshSince(today);
    s.history = {};
    s.settings = { bedtime: "23:30", quranGoal: 2, ramadan: false, sound: false, ...s.settings };
    s.placements = defaultPlacements();
    s.wallPlacements = [];
    s.version = 3;
    for (const i of kept) {
      const spot = autoPlace(s as GameState, i.itemId);
      if (spot) s.placements.push(spot);
    }
  }
  if (s.version === 3) {
    let refund = 0;
    s.inventory = (s.inventory as { itemId: string }[]).filter((i) => {
      if (!(i.itemId in REMOVED_REFUNDS)) return true;
      refund += REMOVED_REFUNDS[i.itemId];
      return false;
    });
    s.placements = (s.placements as PlacedItem[]).filter((p) => !(p.itemId in REMOVED_REFUNDS));
    if (refund) {
      s.coins += refund;
      s.log.unshift({ at: now.getTime(), text: `Retired items refunded: +${refund} coins`, coins: refund, kind: "info" });
    }
    s.settings = { ...s.settings, lights: true };
    s.wallPlacements = [];
    s.version = 4;
    for (const i of s.inventory as { itemId: string }[]) {
      const hang = autoWall(s as GameState, i.itemId);
      if (hang) s.wallPlacements.push(hang);
    }
  }
  if (s.version === 4) {
    let refund = 0;
    s.inventory = (s.inventory as { itemId: string }[]).filter((i) => {
      if (!(i.itemId in REMOVED_REFUNDS)) return true;
      refund += REMOVED_REFUNDS[i.itemId];
      return false;
    });
    s.placements = (s.placements as PlacedItem[]).filter((p) => !(p.itemId in REMOVED_REFUNDS));
    if (refund) {
      s.coins += refund;
      s.log.unshift({ at: now.getTime(), text: `Retired items refunded: +${refund} coins`, coins: refund, kind: "info" });
    }
    // The punching bag lives in the gym now; it waits in storage until the gym opens.
    s.placements = (s.placements as PlacedItem[]).filter((p) => p.itemId !== "punchbag");
    s.equipped = { ...s.equipped, gym: "" };
    s.version = 5;
    if ((s.stats?.gymWeeksDone ?? 0) > 0) unlockGym(s as GameState, now);
  }
  // Fill anything a later field might be missing.
  s.equipped = { ...DEFAULT_EQUIPPED, ...s.equipped };
  s.badges ??= {};
  s.inbox ??= [];
  s.seen ??= [];
  s.history ??= {};
  s.placements ??= defaultPlacements();
  s.wallPlacements ??= [];
  s.body ??= emptyBody();
  s.since ??= freshSince(today);
  s.stats = { ...emptyStats(), ...s.stats };
  s.streaks = { ...emptyStreaks(), ...s.streaks };
  s.best = { ...emptyStreaks(), ...s.best };
  s.settings = { wakeTarget: "08:30", wakeGraceMin: 15, bedtime: "23:30", quranGoal: 2, ramadan: false, lights: true, notifications: false, sound: false, ...s.settings };
  return ensureToday(s as GameState, now);
}
