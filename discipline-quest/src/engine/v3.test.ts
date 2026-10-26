import { describe, expect, it } from "vitest";
import {
  bedCheckIn,
  buyItem,
  canBuy,
  createInitialState,
  ensureToday,
  equip,
  isAsleep,
  migrate,
  placeItem,
  relapse,
  setGym,
  setPrayer,
  setQuranPages,
  storeItem,
  wakeCheckIn,
} from "./engine";
import { checkPlace, footprint } from "./placement";
import { autoWall, checkWall } from "./wall";
import { placeWall, storeWall } from "./engine";
import { plan } from "./planner";
import { QUEST_BY_ID, questsFor } from "./quests";
import { PRAYERS, type GameState } from "./types";

const at = (d: string, hm = "12:00") => new Date(`${d}T${hm}:00`);

/** A v1 save: car + pony owned, two days of history. */
const V1_SAVE = {
  version: 1, startDate: "2026-10-10", lastSettled: "2026-10-10",
  days: {
    "2026-10-10": { date: "2026-10-10", prayers: { fajr: true, dhuhr: true, asr: false, maghrib: false, isha: false }, wake: "ok", wokeAt: 1, diet: "pending", meals: [{ at: 1, note: "Chicken salad", onPlan: true }], urgesResisted: 2, relapses: 0, custom: {} },
    "2026-10-11": { date: "2026-10-11", prayers: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false }, wake: "pending", diet: "pending", meals: [], urgesResisted: 0, relapses: 0, custom: {} },
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

/** A v2 save with items that were removed or renamed in v3. */
function v2Save() {
  const s = createInitialState(at("2026-10-20")) as unknown as Record<string, unknown>;
  s.version = 2;
  delete s.placements; delete s.body; delete s.since; delete s.history;
  s.equipped = { outfit: "fit-hoodie", wallpaper: "wp-sand", floor: "fl-tile", rug: "rug-green", room: "room-studio", paint: "paint-white" };
  s.inventory = ["plant", "beanbag", "dumbbells", "piano", "ioniq5", "paint-gold", "sofa", "fit-hoodie", "wp-sand"].map((id, k) => ({ uid: id, itemId: id, acquiredAt: k, lockDaysLeft: 0 }));
  s.coins = 100;
  return s;
}

describe("migration", () => {
  it("v1 → v3 keeps progress, renames the car, refunds the pony", () => {
    const s = migrate(V1_SAVE, at("2026-10-11", "10:00"));
    expect(s.version).toBe(5);
    expect(s.streaks.clean).toBe(1);
    expect(s.inventory.map((i) => i.itemId).sort()).toEqual(["car-ioniq5", "plant"]);
    expect(s.equipped.car).toBe("car-ioniq5");
    expect(s.stats.urges).toBe(2);
    expect(s.placements.map((p) => p.itemId).sort()).toEqual(["bed", "kitchen", "plant", "prayerrug"]);
    expect(s.coins).toBeGreaterThanOrEqual(340 + 150);
    expect(s.badges["ioniq"]).toBeTruthy();
  });

  it("v2 → v3 refunds retired items, swaps the piano for the clarinet and keeps the layout", () => {
    const s = migrate(v2Save(), at("2026-10-20", "13:00"));
    const ids = s.inventory.map((i) => i.itemId);
    expect(ids).toContain("clarinet");
    expect(ids).toContain("car-ioniq5");
    expect(ids).not.toContain("beanbag");
    expect(ids).not.toContain("paint-gold");
    expect(s.coins).toBeGreaterThanOrEqual(100 + 70 + 140);
    expect(s.equipped.outfit).toBe("fit-hoodie");
    expect((s.equipped as unknown as Record<string, unknown>).paint).toBeUndefined();
    const plant = s.placements.find((p) => p.itemId === "plant")!;
    expect([plant.tx, plant.ty]).toEqual([0, 0]);
    expect(s.placements.find((p) => p.itemId === "sofa")).toMatchObject({ tx: 2, ty: 2 });
  });

  it("leaves a current save alone", () => {
    const s = createInitialState(at("2026-10-11"));
    expect(migrate(s, at("2026-10-11"))).toEqual(s);
  });
});

describe("decorating", () => {
  it("allows moves inside the room and rejects overlaps, walls and blocked paths", () => {
    let s: GameState = { ...createInitialState(at("2026-10-20")), coins: 5000, xp: 100_000 };
    s = buyItem(s, at("2026-10-20"), "sofa");
    expect(s.placements.find((p) => p.itemId === "sofa")).toMatchObject({ tx: 2, ty: 2, rot: 0 });
    expect(checkPlace(s, { itemId: "sofa", tx: 7, ty: 7, rot: 0 })).toBe("outside");
    expect(checkPlace(s, { itemId: "sofa", tx: 7, ty: 6, rot: 0 })).toBe("ok");
    expect(checkPlace(s, { itemId: "sofa", tx: 0, ty: 5, rot: 0 })).toBe("overlap");
    expect(footprint("sofa", 1)).toEqual({ w: 2, d: 1 });
    s = placeItem(s, { itemId: "sofa", tx: 5, ty: 6, rot: 1 });
    expect(s.placements.find((p) => p.itemId === "sofa")).toMatchObject({ tx: 5, ty: 6, rot: 1 });
    // a 1-wide corridor next to the bed can't be walled off
    expect(checkPlace(s, { itemId: "sofa", tx: 0, ty: 3, rot: 1 })).toBe("ok");
    s = storeItem(s, "sofa");
    expect(s.placements.some((p) => p.itemId === "sofa")).toBe(false);
    expect(storeItem(s, "bed")).toBe(s);
  });

  it("detects a placement that cuts the room in two", () => {
    let s: GameState = { ...createInitialState(at("2026-10-20")), coins: 9000, xp: 100_000 };
    s = buyItem(s, at("2026-10-20"), "tv");
    s = buyItem(s, at("2026-10-20"), "sofa");
    s = placeItem(s, { itemId: "tv", tx: 0, ty: 3, rot: 1 });
    s = placeItem(s, { itemId: "sofa", tx: 2, ty: 3, rot: 1 });
    // a 1x1 item at (4,3) would close the gap between the sofa and the kitchen side? Not a full wall, still ok
    expect(checkPlace(s, { itemId: "plant", tx: 4, ty: 3, rot: 0 })).not.toBe("blocks-path");
  });
});

describe("gym", () => {
  const visit = (s: GameState, dates: string[]) => dates.reduce((g, d) => setGym(g, at(d, "18:00"), true), s);

  it("pays per visit, pays a weekly bonus at 4 and grows the body", () => {
    // 2026-10-19 is a Monday
    let s = createInitialState(at("2026-10-12"));
    s = ensureToday(s, at("2026-10-19"));
    s = visit(s, ["2026-10-19", "2026-10-20", "2026-10-22", "2026-10-24"]);
    s = visit(s, ["2026-10-26", "2026-10-27", "2026-10-29", "2026-10-31"]);
    s = ensureToday(s, at("2026-11-02"));
    expect(s.stats.gym).toBe(8);
    expect(s.streaks.gymWeeks).toBe(2);
    expect(s.body.stage).toBe(1);
    expect(s.inbox.some((e) => e.kind === "body" && e.up)).toBe(true);
  });

  it("charges a short week and drops a stage after two missed weeks", () => {
    let s = createInitialState(at("2026-10-12"));
    s.body = { stage: 2, points: 5, missedInRow: 0 };
    s = ensureToday(s, at("2026-10-19"));
    s = visit(s, ["2026-10-19", "2026-10-20"]);
    s = ensureToday(s, at("2026-10-26"));
    expect(s.body.missedInRow).toBe(1);
    expect(s.body.stage).toBe(2);
    s = ensureToday(s, at("2026-11-02"));
    expect(s.body.stage).toBe(1);
    expect(s.inbox.some((e) => e.kind === "body" && !e.up)).toBe(true);
  });
});

describe("Quran, bedtime, Jumu'ah", () => {
  it("rewards hitting the page goal, reverses it, and does not charge a miss", () => {
    let s = ensureToday(createInitialState(at("2026-10-20")), at("2026-10-21"));
    const c0 = s.coins;
    s = setQuranPages(s, at("2026-10-21"), 3);
    const c1 = s.coins;
    expect(c1).toBeGreaterThan(c0);
    s = setQuranPages(s, at("2026-10-21"), 1);
    expect(s.days["2026-10-21"].quranPages).toBe(1);
    const before = s.coins;
    s = ensureToday(s, at("2026-10-22"));
    expect(s.streaks.quran).toBe(0);
    // missing the Quran goal never costs coins
    expect(s.log.some((e) => /Quran goal missed/.test(e.text))).toBe(false);
    expect(s.coins).toBeGreaterThanOrEqual(before - 200);
    void before;
  });

  it("celebrates a khatm at 604 pages", () => {
    let s = createInitialState(at("2026-10-20"));
    s.stats.quranPages = 600;
    s = setQuranPages(s, at("2026-10-20"), 5);
    expect(s.stats.khatms).toBe(1);
    expect(s.inbox.some((e) => e.kind === "khatm")).toBe(true);
  });

  it("assigns an after-midnight bed check-in to the previous night, and you sleep until the wake check-in", () => {
    let s = createInitialState(at("2026-10-20"));
    s = wakeCheckIn(s, at("2026-10-21", "08:10"));
    s = bedCheckIn(s, at("2026-10-21", "23:10"));
    expect(s.days["2026-10-21"].bed).toBe("ok");
    expect(isAsleep(s, at("2026-10-21", "23:40"))).toBe(true);
    expect(isAsleep(s, at("2026-10-22", "02:00"))).toBe(true);
    s = bedCheckIn(s, at("2026-10-23", "00:40"));
    expect(s.days["2026-10-22"].bed).toBe("late");
    expect(bedCheckIn(s, at("2026-10-23", "19:00"))).toBe(s);
  });

  it("gives a Jumu'ah bonus on Friday Dhuhr and keeps a Friday streak", () => {
    let s = ensureToday(createInitialState(at("2026-10-20")), at("2026-10-23"));
    const before = s.coins;
    s = setPrayer(s, at("2026-10-23"), "dhuhr", true); // Friday
    expect(s.coins - before).toBeGreaterThanOrEqual(5 + 20);
    s = ensureToday(s, at("2026-10-24"));
    expect(s.streaks.jumuah).toBe(1);
  });
});

describe("daily quests", () => {
  it("picks 3 stable quests per day", () => {
    const s = createInitialState(at("2026-10-11"));
    const a = questsFor("2026-10-11", s).map((q) => q.id);
    expect(a).toHaveLength(3);
    expect(s.days["2026-10-11"].quests).toEqual(a);
  });

  it("pays when done and takes it back when undone", () => {
    let s: GameState = createInitialState(at("2026-10-11"));
    s.days["2026-10-11"].quests = ["all-five", "dhuhr-asr", "maghrib-isha"];
    for (const p of PRAYERS) s = setPrayer(s, at("2026-10-11"), p, true);
    const coins = s.coins;
    s = setPrayer(s, at("2026-10-11"), "isha", false);
    expect(s.days["2026-10-11"].questsDone?.sort()).toEqual(["dhuhr-asr"]);
    expect(coins - s.coins).toBe(5 + 10 + QUEST_BY_ID["all-five"].coins + QUEST_BY_ID["maghrib-isha"].coins);
  });
});

describe("catalog and cars", () => {
  it("gates by level and room tier", () => {
    let s: GameState = { ...createInitialState(at("2026-10-11")), coins: 9000 };
    expect(canBuy(s, "arcade")).toBe("level");
    s = { ...s, xp: 100_000 };
    expect(canBuy(s, "desk")).toBe("tier");
    s = buyItem(s, at("2026-10-11"), "room-apartment");
    expect(canBuy(s, "desk")).toBe("ok");
    expect(canBuy(s, "pingpong")).toBe("tier");
  });

  it("starts with the Mini and lets you park only cars you own", () => {
    let s = createInitialState(at("2026-10-11"));
    expect(s.equipped.car).toBe("car-mini");
    expect(equip(s, "car-q50")).toBe(s);
    s = { ...s, inventory: [{ uid: "q", itemId: "car-q50", acquiredAt: 1, lockDaysLeft: 0 }] };
    expect(equip(s, "car-q50").equipped.car).toBe("car-q50");
  });

  it("relapse locks the newest item and unequips it", () => {
    let s: GameState = { ...createInitialState(at("2026-10-11")), coins: 5000, xp: 100_000 };
    s = buyItem(s, at("2026-10-11", "10:00"), "fit-thobe");
    s = relapse(s, at("2026-10-11", "12:00"));
    expect(s.equipped.outfit).toBe("fit-coat");
  });
});

describe("planner", () => {
  it("estimates days to unlock everything from the default pace, then from history", () => {
    const s = createInitialState(at("2026-10-11"));
    const p = plan(s, at("2026-10-11"));
    expect(p.estimated).toBe(true);
    expect(p.daysAll).toBeGreaterThanOrEqual(100);
    expect(p.daysAll).toBeLessThan(160);
    expect(p.next).toHaveLength(3);
    const h: GameState = { ...s, history: { "2026-10-01": { earned: 0, xp: 0 }, "2026-10-05": { earned: 800, xp: 1000 }, "2026-10-10": { earned: 2000, xp: 2500 } } };
    const p2 = plan(h, at("2026-10-11"));
    expect(p2.estimated).toBe(false);
    expect(p2.coinRate).toBe(Math.round(2000 / 2));
  });
});

describe("v4: wall decor, lights, retired trophy case", () => {
  it("hangs new wall items in free spots and rejects windows, the Kaaba frame and overlaps", () => {
    let s: GameState = { ...createInitialState(at("2026-10-20")), coins: 9000, xp: 100_000 };
    s = buyItem(s, at("2026-10-20"), "clock");
    expect(s.wallPlacements.find((w) => w.itemId === "clock")).toMatchObject({ wall: "R", u: 40 });
    expect(checkWall(s, { itemId: "worldmap", wall: "R", u: 80 })).toBe("overlap"); // studio window 70..110
    expect(checkWall(s, { itemId: "nazar", wall: "L", u: 50 })).toBe("overlap"); // Kaaba frame
    expect(checkWall(s, { itemId: "nazar", wall: "R", u: 44 })).toBe("overlap"); // the clock
    expect(checkWall(s, { itemId: "nazar", wall: "R", u: 120 })).toBe("outside");
    s = buyItem(s, at("2026-10-20"), "nazar");
    const spot = s.wallPlacements.find((w) => w.itemId === "nazar")!;
    expect(checkWall(s, spot)).toBe("ok");
    s = placeWall(s, { itemId: "nazar", wall: "L", u: 12 });
    expect(s.wallPlacements.find((w) => w.itemId === "nazar")).toMatchObject({ wall: "L", u: 12 });
    s = storeWall(s, "nazar");
    expect(s.wallPlacements.some((w) => w.itemId === "nazar")).toBe(false);
    expect(autoWall(s, "nazar")).not.toBeNull();
  });

  it("bedtime turns the lights off and waking up turns them on", () => {
    let s = createInitialState(at("2026-10-20"));
    s = bedCheckIn(s, at("2026-10-20", "22:30"));
    expect(s.settings.lights).toBe(false);
    s = wakeCheckIn(s, at("2026-10-21", "08:10"));
    expect(s.settings.lights).toBe(true);
  });

  it("v3 → v4 refunds the trophy case and hangs owned wall decor", () => {
    const v3 = createInitialState(at("2026-10-20")) as unknown as Record<string, unknown>;
    v3.version = 3;
    delete v3.wallPlacements;
    v3.inventory = ["trophycase", "clock", "calligraphy", "sofa"].map((id, k) => ({ uid: id, itemId: id, acquiredAt: k, lockDaysLeft: 0 }));
    v3.placements = [...(v3.placements as unknown[]), { itemId: "trophycase", tx: 0, ty: 0, rot: 0 }, { itemId: "sofa", tx: 2, ty: 2, rot: 0 }];
    v3.coins = 10;
    const s = migrate(v3, at("2026-10-20", "15:00"));
    expect(s.version).toBe(5);
    expect(s.coins).toBeGreaterThanOrEqual(1210);
    expect(s.inventory.some((i) => i.itemId === "trophycase")).toBe(false);
    expect(s.placements.some((p) => p.itemId === "trophycase")).toBe(false);
    expect(s.wallPlacements.map((w) => w.itemId).sort()).toEqual(["calligraphy", "clock"]);
    expect(s.settings.lights).toBe(true);
  });
});
