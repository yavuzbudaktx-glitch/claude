"use client";

import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import type { ZuyaUsername } from "@/lib/zuya/config";

export const OWNER_COLORS: Record<ZuyaUsername, string> = {
  yavuz: "#2e9e6b",   // green
  zuleyha: "#d64570", // rose
};

function toDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Month view: per-partner busy dots on each day, hearts on confirmed dates,
// tap a day to select it (agenda below + prefills "suggest a date").
export function MonthGrid({
  month,
  onMonthChange,
  busyByDay,
  acceptedDays,
  selectedDay,
  onSelectDay,
}: {
  month: Date; // first of the displayed month
  onMonthChange: (next: Date) => void;
  busyByDay: Record<string, Set<ZuyaUsername>>;
  acceptedDays: Set<string>;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const first = new Date(year, mon, 1);
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  // Monday-first offset.
  const offset = (first.getDay() + 6) % 7;
  const todayKey = toDayKey(new Date());

  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDayKey(new Date(year, mon, i + 1))),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => onMonthChange(new Date(year, mon - 1, 1))}
          className="grid place-items-center h-8 w-8 rounded-full hover:bg-[var(--hl)] transition"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4 text-muted" />
        </button>
        <span className="font-display text-[15px] text-ink">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => onMonthChange(new Date(year, mon + 1, 1))}
          className="grid place-items-center h-8 w-8 rounded-full hover:bg-[var(--hl)] transition"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4 text-muted" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="label !text-[9px] py-1">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`pad-${i}`} />;
          const busy = busyByDay[day];
          const accepted = acceptedDays.has(day);
          const isToday = day === todayKey;
          const isSelected = day === selectedDay;
          return (
            <button
              key={day}
              onClick={() => onSelectDay(day)}
              className={`relative aspect-square rounded-xl grid place-items-center text-[12.5px] transition border ${
                isSelected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold"
                  : isToday
                    ? "border-[var(--rule)] bg-[var(--paper-2)] font-semibold"
                    : "border-transparent hover:bg-[var(--hl)]"
              }`}
            >
              <span className={isToday ? "text-accent" : "text-ink-soft"}>
                {Number(day.slice(8))}
              </span>
              {accepted && (
                <Heart
                  className="absolute top-1 right-1 h-2.5 w-2.5 text-accent"
                  fill="currentColor"
                />
              )}
              {busy && busy.size > 0 && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {[...busy].sort().map((owner) => (
                    <span
                      key={owner}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: OWNER_COLORS[owner] }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
