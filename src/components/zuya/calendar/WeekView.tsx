"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { OWNER_COLORS } from "@/components/zuya/calendar/MonthGrid";
import type { ZuyaUsername } from "@/lib/zuya/config";

export interface WeekEvent {
  id: string;
  summary: string;
  start: string;
  allDay: boolean;
  location?: string;
  owner: ZuyaUsername;
}

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function eventDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return ymd(new Date(iso));
}
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// A 7-day week, one column per day (Mon–Sun), each partner's events stacked
// and colour-coded — a lightweight Google-Calendar-style week so you can read
// each other's availability at a glance.
export function WeekView({
  weekStart,
  onWeekChange,
  events,
  acceptedDays,
  selectedDay,
  onSelectDay,
}: {
  weekStart: Date;
  onWeekChange: (d: Date) => void;
  events: WeekEvent[];
  acceptedDays: Set<string>;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const todayKey = ymd(new Date());
  const end = days[6];

  // Auto-scroll the 7-day strip so TODAY is in view. On a phone the week is
  // wider than the screen and starts at Monday, so mid/late-week days were
  // off-screen and the user had to scroll to find today.
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // todayRef only exists when today is in the visible week, so this never
    // fights the user's manual navigation to other weeks.
    const center = () => {
      const cell = todayRef.current;
      const box = scrollRef.current;
      if (!cell || !box) return;
      // Bias slightly left of center so today AND the next couple of days are
      // visible (a pure center buries the upcoming days off-screen right).
      const left = cell.offsetLeft - box.clientWidth * 0.38 + cell.clientWidth / 2;
      // Instant placement — a smooth scroll on mount gets interrupted by
      // layout/tile paints and lands short, which is the "not perfect" bug.
      box.scrollTo({ left: Math.max(0, left), behavior: "auto" });
    };
    // Run after layout settles: rAF (post-paint) + a fallback tick for slow
    // first paints (map tiles, fonts) that shift measurement.
    const r1 = requestAnimationFrame(center);
    const t = setTimeout(center, 160);
    return () => { cancelAnimationFrame(r1); clearTimeout(t); };
  }, [weekStart]);

  const shift = (n: number) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + n);
    onWeekChange(d);
  };

  const byDay = new Map<string, WeekEvent[]>();
  for (const e of events) {
    const k = eventDay(e.start);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(e);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || a.start.localeCompare(b.start));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <button onClick={() => shift(-7)} className="grid place-items-center h-8 w-8 rounded-full hover:bg-[var(--hl)] transition" aria-label="Önceki hafta">
          <ChevronLeft className="h-4 w-4 text-muted" />
        </button>
        <span className="font-display text-[14px] text-ink">
          {weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – {end.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
        </span>
        <button onClick={() => shift(7)} className="grid place-items-center h-8 w-8 rounded-full hover:bg-[var(--hl)] transition" aria-label="Sonraki hafta">
          <ChevronRight className="h-4 w-4 text-muted" />
        </button>
      </div>

      <div ref={scrollRef} className="overflow-x-auto -mx-1 px-1">
        <div className="grid gap-1.5 min-w-[620px]" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
          {days.map((d) => {
            const key = ymd(d);
            const isToday = key === todayKey;
            const isSel = key === selectedDay;
            const list = byDay.get(key) ?? [];
            const accepted = acceptedDays.has(key);
            return (
              <button
                key={key}
                ref={isToday ? todayRef : undefined}
                onClick={() => onSelectDay(key)}
                className={`text-left rounded-xl p-1.5 min-h-[120px] border transition ${
                  isSel ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-soft)] hover:border-[var(--rule)]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="label !text-[9px]">{DAYS[(d.getDay() + 6) % 7]}</span>
                  <span className={`text-[12px] font-semibold grid place-items-center h-5 w-5 rounded-full ${isToday ? "text-white" : "text-ink-soft"}`}
                    style={isToday ? { background: "var(--accent)" } : undefined}>
                    {d.getDate()}
                  </span>
                </div>
                {accepted && (
                  <span className="inline-flex items-center gap-1 text-[9.5px] text-accent mb-1">
                    <Heart className="h-2.5 w-2.5" fill="currentColor" /> buluşma
                  </span>
                )}
                <div className="space-y-1">
                  {list.slice(0, 5).map((e) => (
                    <div
                      key={`${e.owner}-${e.id}`}
                      className="rounded-md px-1.5 py-1 text-[10px] leading-tight text-white truncate"
                      style={{ background: OWNER_COLORS[e.owner] }}
                      title={e.summary}
                    >
                      {!e.allDay && <span className="opacity-80">{hhmm(e.start)} </span>}
                      {e.summary}
                    </div>
                  ))}
                  {list.length > 5 && <span className="text-[9.5px] text-muted-2">+{list.length - 5}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
