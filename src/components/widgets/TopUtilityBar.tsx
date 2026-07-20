"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Calculator, Flame, LayoutDashboard, Sparkles } from "lucide-react";
import { WeatherSummary } from "./WeatherSummary";

// Shared utility strip at the top of every authed page: a date+weather pill,
// a pair of context pills that link to the other two sister pages
// (Dashboard / Accounting / Fun), and an optional `right` slot for action
// buttons. Whichever context this is rendered in is dropped from the pill
// list so the user never sees a link to the page they're already on.
export function TopUtilityBar({
  context,
  right,
}: {
  context: "dashboard" | "accounting" | "fun" | "nofap";
  right?: ReactNode;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const pill =
    "group inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--paper)] px-3.5 py-1.5 text-[12.5px] text-ink-soft backdrop-blur-md shadow-[var(--shadow-card)] hover:border-[var(--accent)] hover:text-accent transition";
  const dot = "inline-flex h-4 w-4 items-center justify-center rounded-full text-white";
  const dotStyle = { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))" };

  const pills: Array<{ id: typeof context; href: string; label: string; Icon: typeof Calculator }> = [
    { id: "dashboard",  href: "/dashboard",  label: "Dashboard",  Icon: LayoutDashboard },
    { id: "accounting", href: "/accounting", label: "Accounting", Icon: Calculator },
    { id: "fun",        href: "/fun",        label: "Fun",        Icon: Sparkles },
    { id: "nofap",      href: "/nofap",      label: "Discipline", Icon: Flame },
  ];

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--paper)] px-3 py-1.5 text-[11px] sm:text-[12.5px] text-ink-soft backdrop-blur-md shadow-[var(--shadow-card)] whitespace-nowrap">
          <span className="font-medium">
            {/* Shorter on phones so date + weather stay on one line. */}
            <span className="sm:hidden">{now ? format(now, "EEE, MMM d") : ""}</span>
            <span className="hidden sm:inline">{now ? format(now, "EEEE, MMMM d") : ""}</span>
          </span>
          <span className="h-1 w-1 rounded-full bg-[var(--accent)] shrink-0" aria-hidden />
          <WeatherSummary />
        </div>
        {pills
          .filter((p) => p.id !== context)
          .map(({ id, href, label, Icon }) => (
            <Link
              key={id}
              href={href}
              title={`Open ${label}`}
              aria-label={label}
              className={`${pill} ${id === "fun" || id === "nofap" ? "!px-2" : ""}`}
            >
              <span className={dot} style={dotStyle}>
                <Icon className="h-2.5 w-2.5" />
              </span>
              {id !== "fun" && id !== "nofap" && <span className="font-medium">{label}</span>}
            </Link>
          ))}
      </div>

      {right && <div className="flex items-center flex-wrap gap-1.5 md:gap-2 justify-end">{right}</div>}
    </div>
  );
}
