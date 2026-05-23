"use client";

import { useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { WeatherSummary } from "./WeatherSummary";

// Modern clean masthead: bold display greeting in sans, date + weather
// in a quiet row, actions flushed right. No mono uppercase, no
// hairlines, no decoration. Lets the typography do the work.

export function Masthead({ name, actions }: { name?: string; actions?: ReactNode }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const greeting = (() => {
    if (!now) return "Hello";
    const h = now.getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <div className="text-[13px] text-muted flex items-center gap-2.5 flex-wrap">
            <span className="font-medium">{now ? format(now, "EEEE, MMMM d") : ""}</span>
            <span className="text-muted-2">·</span>
            <WeatherSummary />
          </div>
          <h1 className="font-display text-4xl md:text-5xl lg:text-[56px] leading-[1.05] m-0 text-ink">
            {greeting}
            {name ? (
              <span>
                , <span className="text-accent">{name}</span>
              </span>
            ) : ""}
          </h1>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0 pt-1">{actions}</div>}
      </div>
    </header>
  );
}
