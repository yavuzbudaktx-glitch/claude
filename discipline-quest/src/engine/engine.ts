import { BADGES } from "./badges";
import { CATALOG, DEFAULT_EQUIPPED, EQUIP_SLOT, ITEMS, STARTERS, TIER_ORDER, tierOf } from "./catalog";
import { addDays, dateKey, daysBetween, minutesOfDay, parseHM } from "./dates";
import { QUEST_BY_ID, questsFor } from "./quests";
import { RULES, levelFor } from "./rules";
import {
  PRAYERS,
  PRAYER_LABELS,
  type CustomHabit,
  type DayLog,
  type GameEvent,
  type GameState,
  type ItemId,
  type LifetimeStats,
  type PrayerName,
  type Streaks,
} from "./types";

const emptyStreaks = (): Streaks => ({ prayers: 0, wake: 0, clean: 0, diet: 0, perfect: 0, custom: {} });
const emptyStats = (): LifetimeStats => ({
  prayers: 0, fajr: 0, fullPrayerDays: 0, cleanDays: 0, urges: 0, wakeOnTime: 0,
  dietDays: 0, mealsOnPlan: 0, perfectDays: 0, quests: 0, bought: 0,
});

export function createInitialState(now: Date): GameState {
  const today = dateKey(now);
  const s: GameState = {
    version: 2,
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
    equipped: { ...DEFAULT_EQUIPPED },
    badges: {},
    inbox: [],
    seen: CATALOG.filter((c) => c.level <= 1).map((c) => c.id),
    gloomy: false,
    settings: { wakeTarget: "08:30", wakeGraceMin: 15, notifications: false, sound: false },
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
  const b = s.best;
  b.prayers = Math.max(b.prayers, s.streaks.prayers);
  b.wake = Math.max(b.wake, s.streaks.wake);
  b.clean = Math.max(b.clean, s.streaks.clean);
  b.diet = Math.max(b.diet, s.streaks.diet);
  b.perfect = Math.max(b.perfect, s.streaks.perfect);
  for (const [id, v] of Object.entries(s.streaks.custom)) b.custom[id] = Math.max(b.custom[id] ?? 0, v);
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

function isPerfect(s: GameState, day: DayLog) {
  return (
    PRAYERS.every((p) => day.prayers[p]) &&
    day.wake === "ok" &&
    day.diet === "on" &&
    day.relapses === 0 &&
    activeCustom(s, day.date).every((h) => day.custom[h.id])
  );
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
      `${date}: missed ${missed.map((p) => PRAYER_LABELS[p]).join(", ")}`, "bad");
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

  s.gloomy = day.relapses > 0 || missed.length === PRAYERS.length;

  if (s.streaks.clean >= RULES.carCleanDays && !owns(s, "ioniq5")) {
    grant(s, now, "ioniq5", true);
    earn(s, now, 0, 100, `Unlocked the Ioniq 5: ${RULES.carCleanDays} clean days!`, "good");
  }
  if (s.streaks.clean >= RULES.goldPaintCleanDays && !owns(s, "paint-gold")) {
    grant(s, now, "paint-gold", true);
    earn(s, now, 0, 150, `Unlocked Gravity Gold paint: ${RULES.goldPaintCleanDays} clean days!`, "good");
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
    s.stats.prayers += sign;
    if (p === "fajr") s.stats.fajr += sign;
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
      s.stats.wakeOnTime++;
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

export type BuyResult = "ok" | "debt" | "poor" | "owned" | "not-for-sale" | "level" | "tier" | "needs";

export function canBuy(state: GameState, id: ItemId): BuyResult {
  const item = ITEMS[id];
  if (!item || item.price === null) return "not-for-sale";
  if (owns(state, id)) return "owned";
  if (item.requires && !owns(state, item.requires)) return "needs";
  if (levelFor(state.xp).level < item.level) return "level";
  if (item.tier && currentTierIndex(state) < TIER_ORDER.indexOf(item.tier)) return "tier";
  if (state.coins < 0) return "debt";
  if (state.coins < item.price) return "poor";
  return "ok";
}

export function buyItem(state: GameState, now: Date, id: ItemId): GameState {
  if (canBuy(state, id) !== "ok") return state;
  return withToday(state, now, (s) => {
    const item = ITEMS[id];
    grant(s, now, id, false);
    s.stats.bought++;
    earn(s, now, -(item.price ?? 0), 0, `Bought ${item.name}`, "info");
    const slot = EQUIP_SLOT[item.category];
    if (slot) s.equipped[slot] = id;
  });
}

export function equip(state: GameState, id: ItemId): GameState {
  const item = ITEMS[id];
  const slot = item && EQUIP_SLOT[item.category];
  if (!slot || !usable(state, id) || state.equipped[slot] === id) return state;
  return { ...state, equipped: { ...state.equipped, [slot]: id } };
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
  };
}

// ---------- saves ----------

export function isGameState(v: unknown): boolean {
  const o = v as { version?: number; coins?: unknown; days?: unknown; inventory?: unknown };
  return !!o && (o.version === 1 || o.version === 2) && typeof o.coins === "number" && typeof o.days === "object" && Array.isArray(o.inventory);
}

/** Bring any saved state (v1 or v2) up to the current shape without losing progress. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(raw: any, now: Date): GameState {
  const s = clone(raw);
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
    s.streaks.perfect = 0;
    s.best.perfect = 0;
    const hadPony = s.inventory.some((i: { itemId: string }) => i.itemId === "pony");
    s.inventory = s.inventory
      .filter((i: { itemId: string }) => i.itemId !== "pony")
      .map((i: { itemId: string }) => (i.itemId === "car" ? { ...i, itemId: "ioniq5" } : i));
    s.stats.bought = s.inventory.filter((i: { itemId: string }) => ITEMS[i.itemId]?.price).length;
    if (hadPony) {
      s.coins += RULES.ponyRefund;
      s.log.unshift({ at: now.getTime(), text: `The pony moved out. +${RULES.ponyRefund} coins refund`, coins: RULES.ponyRefund, kind: "info" });
    }
    s.equipped = { ...DEFAULT_EQUIPPED };
    s.badges = {};
    s.inbox = [];
    s.seen = CATALOG.filter((c) => c.level <= 1).map((c) => c.id);
    s.settings = { ...s.settings, sound: false };
    s.version = 2;
  }
  // Fill anything a future field might be missing.
  s.equipped = { ...DEFAULT_EQUIPPED, ...s.equipped };
  s.badges ??= {};
  s.inbox ??= [];
  s.seen ??= [];
  s.stats = { ...emptyStats(), ...s.stats };
  return ensureToday(s as GameState, now);
}
