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
    <header className="space-y-1.5">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted flex items-center gap-3 flex-wrap">
        <span>{now ? format(now, "EEE, MMM d") : ""}</span>
        <span className="opacity-50">·</span>
        <WeatherSummary />
      </div>
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h1 className="font-serif text-5xl md:text-6xl font-light tracking-[-0.02em] leading-[1] m-0">
          {greeting}
          {name ? <span>, <em className="not-italic font-medium">{name}</em></span> : ""}
          <span className="text-accent">.</span>
        </h1>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <hr className="border-t rule mt-3" />
    </header>
  );
}
