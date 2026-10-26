import { describe, expect, it } from "vitest";
import { CHALLENGES, CHALLENGE_BY_ID, offersFor, targetFor } from "./challenges";
import { challengeOffers, createInitialState, ensureToday, migrate, pickChallenge, setPrayer, tickChallenge } from "./engine";
import { PRAYERS, type GameState } from "./types";

const at = (d: string, hm = "12:00") => new Date(`${d}T${hm}:00`);

describe("monthly challenge pool", () => {
  it("has a big, unique pool", () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
  });

  it("offers the same three all month, mixed, never last month's", () => {
    const a = offersFor("2026-11");
    expect(offersFor("2026-11").map((c) => c.id)).toEqual(a.map((c) => c.id));
    expect(a.some((c) => c.kind === "auto")).toBe(true);
    expect(a.some((c) => c.kind === "tick")).toBe(true);
    expect(new Set(a.map((c) => c.id)).size).toBe(3);
    expect(offersFor("2026-11", a[0].id).map((c) => c.id)).not.toContain(a[0].id);
  });

  it("scales targets down when you start late", () => {
    const d = CHALLENGE_BY_ID["no-sugar"];
    expect(targetFor(d, "2026-11", "2026-11-01")).toBe(20);
    expect(targetFor(d, "2026-11", "2026-11-16")).toBe(10);
    expect(targetFor(CHALLENGE_BY_ID["fajr-all"], "2026-11", "2026-11-21")).toBe(10);
  });
});

describe("taking and winning a challenge", () => {
  const start = () => ensureToday(createInitialState(at("2026-10-30")), at("2026-11-01", "09:00"));

  it("pays out once, with the month's rare item, when a tick challenge is done", () => {
    let s = start();
    const tick = challengeOffers(s, at("2026-11-01")).find((c) => c.kind === "tick")!;
    s = pickChallenge(s, at("2026-11-01"), tick.id);
    expect(s.challenge?.id).toBe(tick.id);
    // can't pick a second one this month
    expect(pickChallenge(s, at("2026-11-02"), challengeOffers(s, at("2026-11-02"))[0].id)).toBe(s);
    const target = targetFor(CHALLENGE_BY_ID[tick.id], "2026-11", "2026-11-01");
    for (let k = 1; k <= target; k++) {
      const d = `2026-11-${String(k).padStart(2, "0")}`;
      s = tickChallenge(ensureToday(s, at(d)), at(d, "20:00"), true);
    }
    expect(s.challenge?.won).toBe(true);
    expect(s.inventory.some((i) => i.itemId === "rare-nov")).toBe(true);
    expect(s.log.some((e) => e.text.startsWith("Monthly challenge won"))).toBe(true);
    // unticking doesn't take it back
    const again = tickChallenge(s, at(`2026-11-${String(target).padStart(2, "0")}`, "21:00"), false);
    expect(again.challenge?.won).toBe(true);
  });

  it("tracks auto challenges from your check-ins", () => {
    let s = start();
    s.challenge = { month: "2026-11", id: "prayers-100", startedOn: "2026-11-01", ticks: [] };
    for (let k = 1; k <= 20; k++) {
      const d = `2026-11-${String(k).padStart(2, "0")}`;
      s = ensureToday(s, at(d, "06:00"));
      for (const p of PRAYERS) s = setPrayer(s, at(d, "21:00"), p, true);
    }
    expect(s.challenge?.won).toBe(true);
  });

  it("files a missed challenge away next month without costing coins", () => {
    let s = start();
    const tick = challengeOffers(s, at("2026-11-01")).find((c) => c.kind === "tick")!;
    s = pickChallenge(s, at("2026-11-01"), tick.id);
    s.coins = 500;
    // keep every daily rule satisfied isn't the point here: compare the challenge's own effect
    const withoutChallenge = { ...structuredClone(s), challenge: null } as GameState;
    const a = ensureToday(s, at("2026-12-01", "09:00"));
    const b = ensureToday(withoutChallenge, at("2026-12-01", "09:00"));
    expect(a.challenge).toBeNull();
    expect(a.challengeHistory).toEqual([{ month: "2026-11", id: tick.id, won: false }]);
    expect(a.coins).toBe(b.coins);
    expect(challengeOffers(a, at("2026-12-01")).map((c) => c.id)).not.toContain(tick.id);
  });
});

describe("v5 → v6 migration", () => {
  it("adds an empty challenge state", () => {
    const s = createInitialState(at("2026-10-20")) as unknown as Record<string, unknown>;
    s.version = 5;
    delete s.challenge;
    delete s.challengeHistory;
    const m = migrate(s, at("2026-10-26"));
    expect(m.version).toBe(6);
    expect(m.challenge).toBeNull();
    expect(m.challengeHistory).toEqual([]);
  });
});
