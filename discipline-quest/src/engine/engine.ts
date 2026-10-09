import { ITEMS, RULES } from "./rules";
import { addDays, dateKey, daysBetween, minutesOfDay, parseHM } from "./dates";
import {
  PRAYERS,
  PRAYER_LABELS,
  type CustomHabit,
  type DayLog,
  type GameEvent,
  type GameState,
  type ItemId,
  type PrayerName,
  type Streaks,
} from "./types";

const emptyStreaks = (): Streaks => ({ prayers: 0, wake: 0, clean: 0, diet: 0, custom: {} });

export function createInitialState(now: Date): GameState {
  const today = dateKey(now);
  return {
    version: 1,
    startDate: today,
    lastSettled: addDays(today, -1),
    days: { [today]: emptyDay(today) },
    coins: 0,
    xp: 0,
    streaks: emptyStreaks(),
    best: emptyStreaks(),
    customHabits: [],
    inventory: [],
    gloomy: false,
    settings: { wakeTarget: "08:30", wakeGraceMin: 15, notifications: false },
    log: [{ at: now.getTime(), text: "Your room is ready. Stay disciplined.", kind: "info" }],
  };
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
  };
}

const clone = <T>(v: T): T => structuredClone(v);

function earn(s: GameState, now: Date, coins: number, xp: number, text: string, kind: GameEvent["kind"]) {
  s.coins += coins;
  s.xp = Math.max(0, s.xp + xp);
  s.log.unshift({ at: now.getTime(), text, coins, kind });
  if (s.log.length > RULES.logLimit) s.log.length = RULES.logLimit;
}

function bumpBest(s: GameState) {
  const b = s.best;
  b.prayers = Math.max(b.prayers, s.streaks.prayers);
  b.wake = Math.max(b.wake, s.streaks.wake);
  b.clean = Math.max(b.clean, s.streaks.clean);
  b.diet = Math.max(b.diet, s.streaks.diet);
  for (const [id, v] of Object.entries(s.streaks.custom)) b.custom[id] = Math.max(b.custom[id] ?? 0, v);
}

export function activeCustom(s: GameState, date: string): CustomHabit[] {
  return s.customHabits.filter((h) => !h.archived && h.createdDate <= date);
}

function owns(s: GameState, id: ItemId) {
  return s.inventory.some((i) => i.itemId === id);
}

function grant(s: GameState, now: Date, id: ItemId) {
  s.inventory.push({ uid: `${id}-${now.getTime()}`, itemId: id, acquiredAt: now.getTime(), lockDaysLeft: 0 });
}

/** Apply end-of-day misses and streaks for one finished day. */
function settleDay(s: GameState, date: string, now: Date) {
  const day = s.days[date] ?? (s.days[date] = emptyDay(date));
  const missed = PRAYERS.filter((p) => !day.prayers[p]);

  if (missed.length === 0) s.streaks.prayers++;
  else {
    s.streaks.prayers = 0;
    earn(s, now, -missed.length * RULES.prayer.missCoins, 0,
      `${date}: missed ${missed.map((p) => PRAYER_LABELS[p]).join(", ")}`, "bad");
  }

  if (day.wake === "ok") s.streaks.wake++;
  else if (day.wake === "pending") {
    s.streaks.wake = 0;
    earn(s, now, -RULES.wake.missCoins, 0, `${date}: never checked in awake`, "bad");
  }

  if (day.diet === "on") s.streaks.diet++;
  else if (day.diet === "pending") {
    s.streaks.diet = 0;
    earn(s, now, -RULES.diet.missCoins, 0, `${date}: no diet check-in`, "bad");
  }

  if (day.relapses > 0) s.streaks.clean = 0;
  else {
    s.streaks.clean++;
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

  s.gloomy = day.relapses > 0 || missed.length === PRAYERS.length;

  if (s.streaks.clean >= RULES.carCleanDays && !owns(s, "car")) {
    grant(s, now, "car");
    earn(s, now, 0, 100, `Unlocked the Red Convertible: ${RULES.carCleanDays} clean days!`, "good");
  }
  if (s.streaks.prayers >= RULES.ponyPrayerDays && !owns(s, "pony")) {
    grant(s, now, "pony");
    earn(s, now, 0, 100, `Unlocked the Pony: ${RULES.ponyPrayerDays} days of full prayers!`, "good");
  }
  bumpBest(s);
}

/**
 * Settle every finished day since the last visit (absent days count as full misses)
 * and make sure today's log exists. Returns the same object if nothing changed.
 */
export function ensureToday(state: GameState, now: Date): GameState {
  const today = dateKey(now);
  const from = state.lastSettled ? addDays(state.lastSettled, 1) : state.startDate;
  const pending = daysBetween(from, addDays(today, -1));
  if (pending.length === 0 && state.days[today]) return state;
  const s = clone(state);
  for (const d of pending) settleDay(s, d, now);
  if (pending.length) s.lastSettled = pending[pending.length - 1];
  if (!s.days[today]) s.days[today] = emptyDay(today);
  return s;
}

function withToday(state: GameState, now: Date, fn: (s: GameState, day: DayLog) => void): GameState {
  const s = clone(ensureToday(state, now));
  fn(s, s.days[dateKey(now)]);
  bumpBest(s);
  return s;
}

export function setPrayer(state: GameState, now: Date, p: PrayerName, done: boolean): GameState {
  return withToday(state, now, (s, day) => {
    if (day.prayers[p] === done) return;
    const wasAll = PRAYERS.every((x) => day.prayers[x]);
    day.prayers[p] = done;
    const isAll = PRAYERS.every((x) => day.prayers[x]);
    const sign = done ? 1 : -1;
    earn(s, now, sign * RULES.prayer.coins, sign * RULES.prayer.xp,
      done ? `Prayed ${PRAYER_LABELS[p]}` : `Unmarked ${PRAYER_LABELS[p]}`, done ? "good" : "info");
    if (isAll && !wasAll) earn(s, now, RULES.allPrayersBonus.coins, RULES.allPrayersBonus.xp, "All 5 prayers today!", "good");
    if (wasAll && !isAll) earn(s, now, -RULES.allPrayersBonus.coins, -RULES.allPrayersBonus.xp, "Lost all-prayers bonus", "info");
  });
}

export type WakeWindow = "too-early" | "on-time" | "late";

export function wakeWindow(state: GameState, now: Date): WakeWindow {
  const m = minutesOfDay(now);
  if (m < RULES.wakeEarliestHour * 60) return "too-early";
  return m <= parseHM(state.settings.wakeTarget) + state.settings.wakeGraceMin ? "on-time" : "late";
}

export function wakeCheckIn(state: GameState, now: Date): GameState {
  const win = wakeWindow(state, now);
  if (win === "too-early") return state;
  return withToday(state, now, (s, day) => {
    if (day.wake !== "pending") return;
    day.wokeAt = now.getTime();
    if (win === "on-time") {
      day.wake = "ok";
      earn(s, now, RULES.wake.coins, RULES.wake.xp, "Up on time", "good");
    } else {
      day.wake = "late";
      s.streaks.wake = 0;
      earn(s, now, -RULES.wake.missCoins, 0, "Overslept", "bad");
    }
  });
}

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
    if (onPlan || day.diet === "cheat") return;
    if (day.diet === "on") earn(s, now, -RULES.diet.coins, -RULES.diet.xp, "Diet check-in revoked", "bad");
    day.diet = "cheat";
    s.streaks.diet = 0;
    earn(s, now, -RULES.diet.missCoins, 0, "Cheat meal: diet broken today", "bad");
  });
}

export function resistUrge(state: GameState, now: Date): GameState {
  return withToday(state, now, (s, day) => {
    day.urgesResisted++;
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
      s.log.unshift({ at: now.getTime(), text: `${ITEMS[victim.itemId].name} locked for ${RULES.relapse.lockDays} clean days`, kind: "bad" });
    }
  });
}

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

export type BuyResult = "ok" | "debt" | "poor" | "owned" | "not-for-sale";

export function canBuy(state: GameState, id: ItemId): BuyResult {
  const price = ITEMS[id].price;
  if (price === null) return "not-for-sale";
  if (owns(state, id)) return "owned";
  if (state.coins < 0) return "debt";
  if (state.coins < price) return "poor";
  return "ok";
}

export function buyItem(state: GameState, now: Date, id: ItemId): GameState {
  if (canBuy(state, id) !== "ok") return state;
  return withToday(state, now, (s) => {
    grant(s, now, id);
    earn(s, now, -(ITEMS[id].price ?? 0), 0, `Bought ${ITEMS[id].name}`, "info");
  });
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
  };
}

export function isGameState(v: unknown): v is GameState {
  const o = v as GameState;
  return !!o && o.version === 1 && typeof o.coins === "number" && typeof o.days === "object" && Array.isArray(o.inventory);
}
