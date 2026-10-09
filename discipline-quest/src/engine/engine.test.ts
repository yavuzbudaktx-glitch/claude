import { describe, expect, it } from "vitest";
import {
  buyItem,
  canBuy,
  createInitialState,
  dietCheckIn,
  ensureToday,
  liveStreaks,
  logMeal,
  relapse,
  resistUrge,
  setPrayer,
  wakeCheckIn,
  wakeWindow,
  addCustomHabit,
  setCustom,
} from "./engine";
import { RULES, levelFor } from "./rules";
import { PRAYERS, type GameState } from "./types";

const at = (d: string, hm = "12:00") => new Date(`${d}T${hm}:00`);

function perfectDay(s: GameState, d: string): GameState {
  for (const p of PRAYERS) s = setPrayer(s, at(d, "12:00"), p, true);
  s = wakeCheckIn(s, at(d, "08:20"));
  s = dietCheckIn(s, at(d, "21:00"));
  return s;
}

describe("prayers", () => {
  it("rewards each prayer plus an all-5 bonus, and reverses on uncheck", () => {
    let s = createInitialState(at("2026-01-01"));
    for (const p of PRAYERS) s = setPrayer(s, at("2026-01-01"), p, true);
    expect(s.coins).toBe(5 * RULES.prayer.coins + RULES.allPrayersBonus.coins);
    s = setPrayer(s, at("2026-01-01"), "isha", false);
    expect(s.coins).toBe(4 * RULES.prayer.coins);
  });

  it("charges each missed prayer at end of day and breaks the streak", () => {
    let s = createInitialState(at("2026-01-01"));
    s = perfectDay(s, "2026-01-01");
    s = setPrayer(s, at("2026-01-02"), "fajr", true);
    const before = s.coins;
    s = ensureToday(s, at("2026-01-03"));
    expect(s.streaks.prayers).toBe(0);
    // 4 missed prayers, wake miss, diet miss, +clean day
    expect(s.coins - before).toBe(-4 * RULES.prayer.missCoins - RULES.wake.missCoins - RULES.diet.missCoins + RULES.cleanDay.coins);
  });

  it("goes gloomy after a day with zero prayers and recovers after a clean day", () => {
    let s = createInitialState(at("2026-01-01"));
    s = ensureToday(s, at("2026-01-02"));
    expect(s.gloomy).toBe(true);
    s = setPrayer(s, at("2026-01-02"), "fajr", true);
    s = ensureToday(s, at("2026-01-03"));
    expect(s.gloomy).toBe(false);
  });
});

describe("wake-up", () => {
  it("uses an 08:30 target with 15 min grace", () => {
    const s = createInitialState(at("2026-01-01"));
    expect(wakeWindow(s, at("2026-01-01", "03:59"))).toBe("too-early");
    expect(wakeWindow(s, at("2026-01-01", "08:45"))).toBe("on-time");
    expect(wakeWindow(s, at("2026-01-01", "08:46"))).toBe("late");
  });

  it("penalizes a late check-in immediately and only once", () => {
    let s = createInitialState(at("2026-01-01"));
    s = wakeCheckIn(s, at("2026-01-01", "09:30"));
    s = wakeCheckIn(s, at("2026-01-01", "09:31"));
    expect(s.coins).toBe(-RULES.wake.missCoins);
    expect(s.days["2026-01-01"].wake).toBe("late");
  });
});

describe("diet", () => {
  it("only allows the check-in in the evening", () => {
    let s = createInitialState(at("2026-01-01"));
    s = dietCheckIn(s, at("2026-01-01", "12:00"));
    expect(s.days["2026-01-01"].diet).toBe("pending");
    s = dietCheckIn(s, at("2026-01-01", "18:00"));
    expect(s.days["2026-01-01"].diet).toBe("on");
  });

  it("a cheat meal after check-in revokes the reward and charges the miss", () => {
    let s = createInitialState(at("2026-01-01"));
    s = dietCheckIn(s, at("2026-01-01", "19:00"));
    s = logMeal(s, at("2026-01-01", "22:00"), "pizza", false);
    expect(s.coins).toBe(-RULES.diet.missCoins);
    s = logMeal(s, at("2026-01-01", "23:00"), "more pizza", false);
    expect(s.coins).toBe(-RULES.diet.missCoins);
  });
});

describe("porn relapse", () => {
  it("resets clean streak, charges coins, locks newest item until 7 clean days", () => {
    let s = createInitialState(at("2026-01-01"));
    s = { ...s, coins: 500 };
    s = buyItem(s, at("2026-01-01"), "plant");
    s = buyItem(s, at("2026-01-01", "13:00"), "lamp");
    s = ensureToday(s, at("2026-01-03"));
    expect(s.streaks.clean).toBe(2);
    s = relapse(s, at("2026-01-03"));
    expect(s.streaks.clean).toBe(0);
    expect(s.gloomy).toBe(true);
    const lamp = s.inventory.find((i) => i.itemId === "lamp")!;
    expect(lamp.lockDaysLeft).toBe(7);
    expect(s.inventory.find((i) => i.itemId === "plant")!.lockDaysLeft).toBe(0);
    s = ensureToday(s, at("2026-01-10"));
    expect(s.inventory.find((i) => i.itemId === "lamp")!.lockDaysLeft).toBe(1);
    s = ensureToday(s, at("2026-01-11"));
    expect(s.inventory.find((i) => i.itemId === "lamp")!.lockDaysLeft).toBe(0);
  });

  it("caps urge rewards per day", () => {
    let s = createInitialState(at("2026-01-01"));
    for (let i = 0; i < 8; i++) s = resistUrge(s, at("2026-01-01"));
    expect(s.coins).toBe(RULES.urge.maxPerDay * RULES.urge.coins);
    expect(s.days["2026-01-01"].urgesResisted).toBe(8);
  });
});

describe("shop and unlocks", () => {
  it("blocks purchases while in debt", () => {
    let s = createInitialState(at("2026-01-01"));
    s = wakeCheckIn(s, at("2026-01-01", "10:00"));
    expect(canBuy(s, "plant")).toBe("debt");
    expect(canBuy(s, "car")).toBe("not-for-sale");
  });

  it("unlocks the pony after 14 perfect prayer days and the car after 30 clean days", () => {
    let s = createInitialState(at("2026-01-01"));
    for (let d = 1; d <= 30; d++) {
      const key = `2026-01-${String(d).padStart(2, "0")}`;
      s = perfectDay(s, key);
      if (d === 14) {
        s = ensureToday(s, at("2026-01-15"));
        expect(s.inventory.some((i) => i.itemId === "pony")).toBe(true);
        expect(s.inventory.some((i) => i.itemId === "car")).toBe(false);
      }
    }
    s = ensureToday(s, at("2026-01-31"));
    expect(s.inventory.some((i) => i.itemId === "car")).toBe(true);
    expect(s.streaks.wake).toBe(30);
    expect(liveStreaks(s, at("2026-01-31")).diet).toBe(30);
  });

  it("treats days the app wasn't opened as full misses", () => {
    let s = createInitialState(at("2026-01-01"));
    s = ensureToday(s, at("2026-01-04"));
    // 3 days × (5 prayers + wake + diet) misses, but 3 clean days
    expect(s.coins).toBe(3 * (-5 * RULES.prayer.missCoins - RULES.wake.missCoins - RULES.diet.missCoins + RULES.cleanDay.coins));
  });
});

describe("custom habits", () => {
  it("rewards completion and charges misses from the day after creation", () => {
    let s = createInitialState(at("2026-01-01"));
    s = addCustomHabit(s, at("2026-01-01"), "Read 10 pages");
    const id = s.customHabits[0].id;
    s = setCustom(s, at("2026-01-01"), id, true);
    s = ensureToday(s, at("2026-01-03"));
    expect(s.streaks.custom[id]).toBe(0);
    expect(s.best.custom[id]).toBe(1);
  });
});

describe("levels", () => {
  it("follows 0/100/300/600 thresholds", () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(300).level).toBe(3);
    expect(levelFor(650)).toEqual({ level: 4, into: 50, need: 400 });
  });
});
