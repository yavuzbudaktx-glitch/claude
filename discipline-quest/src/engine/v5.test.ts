import { describe, expect, it } from "vitest";
import { bedWindow, createInitialState, dietCheckInOpen, ensureToday, isAsleep, wakeWindow } from "./engine";

const at = (hm: string, date = "2026-10-26") => new Date(`${date}T${hm}:00`);
const fresh = () => ensureToday(createInitialState(at("06:00", "2026-10-20")), at("06:00"));

describe("time windows", () => {
  const s = fresh();
  it.each([
    ["03:00", "too-early", "late", false],
    ["08:00", "on-time", "too-early", false],
    ["10:40", "late", "too-early", false],
    ["13:00", "missed", "too-early", false],
    ["18:30", "missed", "too-early", true],
    ["22:00", "missed", "on-time", true],
    ["23:45", "missed", "late", true],
    ["00:30", "too-early", "late", false],
  ])("%s → wake %s, bed %s, diet open %s", (hm, wake, bed, diet) => {
    const now = at(hm);
    expect(wakeWindow(s, now)).toBe(wake);
    expect(bedWindow(s, now)).toBe(bed);
    expect(dietCheckInOpen(now)).toBe(diet);
  });

  it("isn't shown asleep in the afternoon after a missed morning", () => {
    const g = ensureToday(s, at("15:00"));
    expect(isAsleep(g, at("15:00"))).toBe(false);
    expect(isAsleep(g, at("07:00"))).toBe(true);
  });
});

import { buyItem, canBuy, migrate, placeItem, setGym, storeItem } from "./engine";
import { checkPlace } from "./placement";
import type { GameState, ItemId } from "./types";

const own = (s: GameState, ...ids: ItemId[]) => {
  for (const id of ids) s.inventory.push({ uid: id, itemId: id, acquiredAt: 0, lockDaysLeft: 0 });
  return s;
};

describe("stacking and rugs", () => {
  const base = () => {
    const s = own(fresh(), "kilim", "sofa", "desk", "console", "bonsai");
    s.equipped.room = "room-apartment";
    s.placements = s.placements.filter((p) => p.itemId !== "prayerrug");
    return s;
  };

  it("lets furniture stand on a rug", () => {
    let s = placeItem(base(), { itemId: "kilim", tx: 4, ty: 4, rot: 0 });
    expect(s.placements.some((p) => p.itemId === "kilim")).toBe(true);
    expect(checkPlace(s, { itemId: "sofa", tx: 4, ty: 4, rot: 0 })).toBe("ok");
    s = placeItem(s, { itemId: "sofa", tx: 4, ty: 4, rot: 0 });
    expect(s.placements.some((p) => p.itemId === "sofa")).toBe(true);
  });

  it("puts the console on the desk, moves it with the desk and stores it with the desk", () => {
    let s = placeItem(base(), { itemId: "desk", tx: 5, ty: 2, rot: 0 });
    expect(s.placements.some((p) => p.itemId === "desk")).toBe(true);
    s = placeItem(s, { itemId: "console", tx: 6, ty: 2, rot: 0 });
    expect(s.placements.find((p) => p.itemId === "console")?.on).toBe("desk");
    // a second small thing can't share the tile, but the other half of the desk is free
    expect(checkPlace(s, { itemId: "bonsai", tx: 6, ty: 2, rot: 0 })).toBe("overlap");
    expect(checkPlace(s, { itemId: "bonsai", tx: 5, ty: 2, rot: 0 })).toBe("ok");
    s = placeItem(s, { itemId: "desk", tx: 5, ty: 5, rot: 0 });
    expect(s.placements.find((p) => p.itemId === "console")).toMatchObject({ tx: 6, ty: 5, on: "desk" });
    s = storeItem(s, "desk");
    expect(s.placements.some((p) => p.itemId === "console")).toBe(false);
  });
});

describe("gym room", () => {
  it("gates gym gear behind the gym room and gym visits", () => {
    const s = fresh();
    s.coins = 5000;
    s.xp = 50000;
    expect(canBuy(s, "squatrack")).toBe("no-gym");
    s.equipped.gym = "gym-garage";
    own(s, "gym-garage");
    s.stats.gym = 3;
    expect(canBuy(s, "squatrack")).toBe("gym-visits");
    s.stats.gym = 6;
    expect(canBuy(s, "squatrack")).toBe("ok");
    expect(canBuy(s, "powerrack")).toBe("gym-tier");
    expect(canBuy(s, "gym-pro")).toBe("gym-tier");
    const b = buyItem(s, at("12:00"), "squatrack");
    expect(b.placements.find((p) => p.itemId === "squatrack")?.space).toBe("gym");
  });

  it("opens the gym after the first full 4-visit week", () => {
    let s = createInitialState(at("08:00", "2026-10-12"));
    s.since.gym = "2026-10-12";
    for (const d of ["12", "13", "14", "15"]) s = setGym(ensureToday(s, at("18:00", `2026-10-${d}`)), at("18:00", `2026-10-${d}`), true);
    s = ensureToday(s, at("08:00", "2026-10-20"));
    expect(s.equipped.gym).toBe("gym-garage");
    expect(s.inventory.some((i) => i.itemId === "gym-garage")).toBe(true);
  });
});

describe("v4 → v5 migration", () => {
  it("refunds the retired items and keeps the punching bag for the gym", () => {
    const s = own(fresh(), "massage", "lantern", "punchbag") as unknown as Record<string, unknown> & GameState;
    s.placements.push({ itemId: "punchbag", tx: 6, ty: 6, rot: 0 }, { itemId: "lantern", tx: 6, ty: 2, rot: 0 });
    (s as { version: number }).version = 4;
    s.coins = 0;
    const m = migrate(s, at("12:00"));
    expect(m.version).toBe(5);
    expect(m.coins).toBe(410 + 50);
    expect(m.inventory.map((i) => i.itemId)).toEqual(["punchbag"]);
    expect(m.placements.some((p) => p.itemId === "punchbag" || p.itemId === "lantern")).toBe(false);
    expect(m.equipped.gym).toBe("");
  });
});
