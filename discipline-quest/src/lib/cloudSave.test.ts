import { describe, expect, it } from "vitest";
import { createInitialState, emptyDay } from "@/engine/engine";
import { MAX_BYTES, pickCloud, trimForCloud } from "./cloudSave";

describe("cloud save", () => {
  it("prefers the cloud unless this device saved later", () => {
    expect(pickCloud(100, null)).toBe(true);
    expect(pickCloud(100, 50)).toBe(true);
    expect(pickCloud(100, 200)).toBe(false);
  });

  it("leaves small saves alone and trims huge ones under the limit", () => {
    const s = createInitialState(new Date("2026-10-26T10:00:00"));
    expect(trimForCloud(s)).toBe(s);
    const days: Record<string, ReturnType<typeof emptyDay>> = {};
    for (let i = 0; i < 1500; i++) days[`2020-${String(i).padStart(5, "0")}`] = emptyDay(`2020-${i}`);
    const big = { ...s, days, log: Array.from({ length: 3000 }, (_, i) => ({ ...(s.log[0] ?? {}), id: i, text: "x".repeat(40) })) } as unknown as typeof s;
    const t = trimForCloud(big);
    expect(JSON.stringify(t).length).toBeLessThanOrEqual(MAX_BYTES);
    expect(Object.keys(t.days)).toContain("2020-01499");
  });
});
