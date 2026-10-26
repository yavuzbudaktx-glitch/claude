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
