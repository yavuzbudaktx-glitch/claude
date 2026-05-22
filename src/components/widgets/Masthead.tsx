"use client";

import { useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { WeatherSummary } from "./WeatherSummary";

// Newspaper masthead: tiny eyebrow ("THE DAILY · VOL DDD") above a
// large serif greeting, then a date/weather strip framed by hairlines.
// Cycles through volume/issue numbers tied to the day-of-year so it
// feels like a real periodical.

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

  const issueNo = now
    ? Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000)
    : null;
  const vol = now ? now.getFullYear() - 1999 : null;

  return (
    <header className="space-y-3">
      {/* Eyebrow — wordmark + edition metadata */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-display text-[15px] font-medium tracking-[0.32em] text-ink uppercase">
            The&nbsp;Daily
          </span>
          {vol && issueNo && (
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              Vol&nbsp;{vol} · No&nbsp;{String(issueNo).padStart(3, "0")}
            </span>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {/* Heavy top rule then thin under-rule — classic broadsheet */}
      <div className="relative">
        <div className="border-t-2 border-ink" />
        <div className="absolute left-0 right-0 top-[3px] h-px bg-[var(--rule-soft)]" />
      </div>

      {/* The greeting — display serif, generous size, accent dot */}
      <h1
        className="font-display text-5xl md:text-6xl lg:text-[68px] font-light leading-[1.02] m-0 pt-1"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        {greeting}
        {name ? (
          <span>
            ,{" "}
            <em className="not-italic font-medium" style={{ fontVariationSettings: '"opsz" 144' }}>
              {name}
            </em>
          </span>
        ) : ""}
        <span className="text-accent">.</span>
      </h1>

      {/* Bottom metadata strip — date · weather, framed by hairlines */}
      <div className="border-t border-b rule-soft py-2 flex items-center gap-3 flex-wrap font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
        <span>{now ? format(now, "EEEE · MMMM d, yyyy") : ""}</span>
        <span className="opacity-40">✦</span>
        <WeatherSummary />
      </div>
    </header>
  );
}
