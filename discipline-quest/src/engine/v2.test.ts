import { describe, expect, it } from "vitest";
import { buyItem, canBuy, createInitialState, equip, ensureToday, migrate, relapse, setPrayer, wakeCheckIn } from "./engine";
import { QUEST_BY_ID, questsFor } from "./quests";
import { PRAYERS, type GameState } from "./types";

const at = (d: string, hm = "12:00") => new Date(`${d}T${hm}:00`);

/** A real-shaped v1 save: car + pony owned, two days of history. */
const V1_SAVE = {
  version: 1,
  startDate: "2026-10-10",
  lastSettled: "2026-10-10",
  days: {
    "2026-10-10": {
      date: "2026-10-10",
      prayers: { fajr: true, dhuhr: true, asr: false, maghrib: false, isha: false },
      wake: "ok", wokeAt: 1, diet: "pending",
      meals: [{ at: 1, note: "Chicken salad", onPlan: true }],
      urgesResisted: 2, relapses: 0, custom: {},
    },
    "2026-10-11": {
      date: "2026-10-11",
      prayers: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false },
      wake: "pending", diet: "pending", meals: [], urgesResisted: 0, relapses: 0, custom: {},
    },
  },
  coins: 340, xp: 420,
  streaks: { prayers: 0, wake: 1, clean: 1, diet: 0, custom: {} },
  best: { prayers: 0, wake: 1, clean: 1, diet: 0, custom: {} },
  customHabits: [],
  inventory: [
    { uid: "plant-1", itemId: "plant", acquiredAt: 1, lockDaysLeft: 0 },
    { uid: "car-2", itemId: "car", acquiredAt: 2, lockDaysLeft: 0 },
    { uid: "pony-3", itemId: "pony", acquiredAt: 3, lockDaysLeft: 0 },
  ],
  gloomy: false,
  settings: { wakeTarget: "08:30", wakeGraceMin: 15, notifications: false },
  log: [],
};

describe("v1 → v2 migration", () => {
  it("keeps progress, renames the car, refunds the pony", () => {
    const s = migrate(V1_SAVE, at("2026-10-11", "10:00"));
    expect(s.version).toBe(2);
    expect(s.xp).toBeGreaterThanOrEqual(420);
    expect(s.streaks.clean).toBe(1);
    expect(s.inventory.map((i) => i.itemId).sort()).toEqual(["ioniq5", "plant"]);
    expect(s.log.some((e) => e.text.includes("pony"))).toBe(true);
    expect(s.stats.prayers).toBe(3);
    expect(s.stats.fajr).toBe(2);
    expect(s.stats.urges).toBe(2);
    expect(s.equipped.outfit).toBe("fit-coat");
    expect(s.days["2026-10-11"].quests).toHaveLength(3);
    // retroactive badges: first prayer, Ioniq
    expect(s.badges["first-prayer"]).toBeTruthy();
    expect(s.badges["ioniq"]).toBeTruthy();
    // coins: 340 + 150 refund + badge payouts
    expect(s.coins).toBeGreaterThanOrEqual(490);
  });

  it("leaves a v2 save alone apart from today's setup", () => {
    const s = createInitialState(at("2026-10-11"));
    expect(migrate(s, at("2026-10-11"))).toEqual(s);
  });
});

describe("daily quests", () => {
  it("picks 3 stable quests per day", () => {
    const s = createInitialState(at("2026-10-11"));
    const a = questsFor("2026-10-11", s).map((q) => q.id);
    expect(a).toHaveLength(3);
    expect(questsFor("2026-10-11", s).map((q) => q.id)).toEqual(a);
    expect(s.days["2026-10-11"].quests).toEqual(a);
  });

  it("pays when done and takes it back when undone", () => {
    let s: GameState = createInitialState(at("2026-10-11"));
    s.days["2026-10-11"].quests = ["all-five", "dhuhr-asr", "maghrib-isha"];
    for (const p of PRAYERS) s = setPrayer(s, at("2026-10-11"), p, true);
    expect(s.days["2026-10-11"].questsDone?.sort()).toEqual(["all-five", "dhuhr-asr", "maghrib-isha"]);
    const coins = s.coins;
    s = setPrayer(s, at("2026-10-11"), "isha", false);
    expect(s.days["2026-10-11"].questsDone?.sort()).toEqual(["dhuhr-asr"]);
    expect(coins - s.coins).toBe(5 + 10 + QUEST_BY_ID["all-five"].coins + QUEST_BY_ID["maghrib-isha"].coins);
  });
});

describe("catalog", () => {
  it("gates by level, room tier and requirements", () => {
    let s: GameState = { ...createInitialState(at("2026-10-11")), coins: 5000 };
    expect(canBuy(s, "arcade")).toBe("level");
    s = { ...s, xp: 100_000 };
    expect(canBuy(s, "desk")).toBe("tier");
    expect(canBuy(s, "paint-teal")).toBe("needs");
    s = buyItem(s, at("2026-10-11"), "room-apartment");
    expect(s.equipped.room).toBe("room-apartment");
    expect(canBuy(s, "desk")).toBe("ok");
    expect(canBuy(s, "piano")).toBe("tier");
  });

  it("auto-equips styles, and a relapse locks and unequips the newest one", () => {
    let s: GameState = { ...createInitialState(at("2026-10-11")), coins: 5000, xp: 100_000 };
    s = buyItem(s, at("2026-10-11", "10:00"), "wp-brick");
    s = buyItem(s, at("2026-10-11", "11:00"), "fit-thobe");
    expect(s.equipped.outfit).toBe("fit-thobe");
    expect(s.equipped.wallpaper).toBe("wp-brick");
    s = relapse(s, at("2026-10-11", "12:00"));
    expect(s.equipped.outfit).toBe("fit-coat");
    expect(equip(s, "fit-thobe")).toBe(s);
    expect(equip(s, "fit-coat")).toBe(s);
    expect(s.equipped.wallpaper).toBe("wp-brick");
  });
});

describe("badges and levels", () => {
  it("awards badges once with a celebration entry", () => {
    let s = createInitialState(at("2026-10-11"));
    s = setPrayer(s, at("2026-10-11"), "fajr", true);
    s = setPrayer(s, at("2026-10-11"), "fajr", false);
    s = setPrayer(s, at("2026-10-11"), "fajr", true);
    expect(s.inbox.filter((e) => e.kind === "badge" && e.id === "first-prayer")).toHaveLength(1);
  });

  it("queues a level-up celebration", () => {
    let s = createInitialState(at("2026-10-11"));
    s = { ...s, xp: 95 };
    s = wakeCheckIn(s, at("2026-10-11", "08:10"));
    expect(s.inbox.some((e) => e.kind === "level" && e.level === 2)).toBe(true);
  });

  it("counts perfect days at settlement", () => {
    let s = createInitialState(at("2026-10-11"));
    s.days["2026-10-11"] = { ...s.days["2026-10-11"], prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true }, wake: "ok", diet: "on" };
    s = ensureToday(s, at("2026-10-12"));
    expect(s.stats.perfectDays).toBe(1);
    expect(s.badges["perfect-1"]).toBeTruthy();
  });
});
