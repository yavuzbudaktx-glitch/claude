"use client";

import { useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { WeatherSummary } from "./WeatherSummary";

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
    if (h < 5)  return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <header className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3.5 min-w-0">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-[var(--glass-border)] bg-[var(--paper)] px-3.5 py-1.5 text-[12.5px] text-ink-soft backdrop-blur-md shadow-[var(--shadow-card)]">
            <span className="font-medium">{now ? format(now, "EEEE, MMMM d") : ""}</span>
            <span className="h-1 w-1 rounded-full bg-[var(--accent)] shrink-0" aria-hidden />
            <WeatherSummary />
          </div>
          <h1 className="font-display text-5xl md:text-6xl lg:text-[64px] leading-[1.0] tracking-tight m-0">
            <span className="text-ink">{greeting}</span>
            {name ? (
              <>
                <span className="text-ink">,</span>{" "}
                <span className="text-gradient">{name}</span>
              </>
            ) : ""}
          </h1>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0 pt-1">{actions}</div>}
      </div>
    </header>
  );
}
