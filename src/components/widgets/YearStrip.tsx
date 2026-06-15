"use client";

import { useMemo, useState } from "react";
import { usePref } from "@/components/PrefsProvider";
import { localDateKey } from "@/lib/local-date";

// Year-in-pixels strip — a GitHub-contribution-style heatmap of the year
// keyed off the existing habit prefs. One square per day, colored by what
// fraction of that day's habits were marked done. The data already syncs
// because we read straight from `usePref("habits", …)` / `usePref("habitList", …)`.
//
// Layout: 7 rows (Mon..Sun) × ~53 columns (weeks). Mobile shrinks the cell
// size automatically via Tailwind clamp on the wrapper.

function ymd(d: Date) { return localDateKey(d); }

function buildGrid(year: number): { weeks: Array<Array<string | null>>; monthLabels: Array<{ col: number; label: string }> } {
  // Start at the Monday on/before Jan 1 so the grid lines up Mon..Sun.
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const offset = (jan1.getDay() + 6) % 7; // 0=Mon..6=Sun for js Sun..Sat → Mon..Sun
  const start = new Date(year, 0, 1 - offset);
  const weeks: Array<Array<string | null>> = [];
  const monthLabels: Array<{ col: number; label: string }> = [];
  let cur = new Date(start);
  let col = 0;
  let lastMonth = -1;
  while (cur <= dec31) {
    const week: Array<string | null> = [];
    for (let row = 0; row < 7; row++) {
      const inYear = cur.getFullYear() === year;
      if (inYear) {
        week.push(ymd(cur));
        // Label a column when its first in-year cell rolls to a new month.
        if (row === 0 || (week[row - 1] === null)) {
          if (cur.getMonth() !== lastMonth) {
            monthLabels.push({ col, label: cur.toLocaleDateString(undefined, { month: "short" }) });
            lastMonth = cur.getMonth();
          }
        }
      } else {
        week.push(null);
      }
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
    weeks.push(week);
    col++;
  }
  return { weeks, monthLabels };
}

export function YearStrip() {
  const [habitList] = usePref<string[]>("habitList", ["Water", "Steps", "Reading"]);
  const [done] = usePref<Record<string, string[]>>("habits", {});
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const today = localDateKey();

  // Build a Map<dateKey, fraction0..1> from habit completions.
  const fractionByDate = useMemo(() => {
    const m = new Map<string, number>();
    const n = Math.max(1, habitList.length);
    for (const habit of habitList) {
      const dates = done[habit] ?? [];
      for (const d of dates) {
        m.set(d, (m.get(d) ?? 0) + 1);
      }
    }
    for (const [k, v] of m) m.set(k, v / n);
    return m;
  }, [habitList, done]);

  const { weeks, monthLabels } = useMemo(() => buildGrid(year), [year]);

  const totalDone = useMemo(() => {
    let n = 0;
    for (const v of fractionByDate.values()) if (v > 0) n++;
    return n;
  }, [fractionByDate]);

  function colorFor(date: string | null): string {
    if (!date) return "transparent";
    if (date > today) return "var(--rule-soft)";
    const frac = fractionByDate.get(date) ?? 0;
    if (frac <= 0) return "var(--rule-soft)";
    if (frac >= 1)    return "color-mix(in srgb, var(--accent) 92%, transparent)";
    if (frac >= 0.66) return "color-mix(in srgb, var(--accent) 70%, transparent)";
    if (frac >= 0.33) return "color-mix(in srgb, var(--accent) 45%, transparent)";
    return "color-mix(in srgb, var(--accent) 22%, transparent)";
  }

  return (
    <div className="card !p-3 md:!p-4 relative">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-2 font-semibold">Year in pixels</span>
          <span className="text-[10.5px] text-muted-2 tabular-nums">{totalDone} active days</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="btn-ghost !h-6 !w-6 !text-[10px]"
            aria-label="Previous year"
            title="Previous year"
          >‹</button>
          <span className="text-[11px] font-mono tabular-nums text-muted px-1">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= new Date().getFullYear()}
            className="btn-ghost !h-6 !w-6 !text-[10px] disabled:opacity-30"
            aria-label="Next year"
            title="Next year"
          >›</button>
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1">
        <div
          className="relative grid gap-[3px] min-w-fit"
          style={{
            gridTemplateColumns: `repeat(${weeks.length}, var(--ys-cell))`,
            gridAutoRows: "var(--ys-cell)",
            // single source of truth for cell sizing
            ["--ys-cell" as never]: "clamp(8px, 1.1vw, 13px)",
          }}
        >
          {weeks.map((week, col) =>
            week.map((d, row) => {
              const fracVal = d ? (fractionByDate.get(d) ?? 0) : 0;
              const title = d ? `${d} · ${Math.round(fracVal * 100)}% habits done` : "";
              return (
                <div
                  key={`${col}-${row}`}
                  style={{
                    background: colorFor(d),
                    gridColumn: col + 1,
                    gridRow: row + 1,
                    borderRadius: 2,
                    border: d === today ? "1px solid var(--accent)" : "1px solid color-mix(in srgb, var(--rule) 40%, transparent)",
                  }}
                  title={title}
                />
              );
            }),
          )}
        </div>
        <div
          className="relative h-3 mt-1 text-[9.5px] text-muted-2 select-none"
          style={{
            // Match the strip's cell width + gap so labels line up exactly.
            width: `calc((${weeks.length} * var(--ys-cell)) + ${(weeks.length - 1) * 3}px)`,
            ["--ys-cell" as never]: "clamp(8px, 1.1vw, 13px)",
          }}
        >
          {monthLabels.map((lbl) => (
            <span
              key={lbl.col}
              className="absolute"
              style={{ left: `calc(${lbl.col} * (var(--ys-cell) + 3px))` }}
            >
              {lbl.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-2">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span
            key={f}
            className="inline-block"
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background:
                f === 0
                  ? "var(--rule-soft)"
                  : `color-mix(in srgb, var(--accent) ${Math.round(20 + f * 72)}%, transparent)`,
              border: "1px solid color-mix(in srgb, var(--rule) 40%, transparent)",
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
