"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { Calculator, LayoutDashboard } from "lucide-react";
import { WeatherSummary } from "./WeatherSummary";

// Shared utility strip that sits at the top of every authed page: a
// date+weather pill, a context link pill, and an optional `right` slot.
// The dashboard puts its action buttons inside the Masthead (next to the
// clock); the accounting page passes them here instead via `right`, since
// it has no clock to anchor against.
export function TopUtilityBar({
  context,
  right,
}: {
  context: "dashboard" | "accounting";
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

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-2.5 rounded-full border border-[var(--glass-border)] bg-[var(--paper)] px-3.5 py-1.5 text-[12.5px] text-ink-soft backdrop-blur-md shadow-[var(--shadow-card)]">
          <span className="font-medium">{now ? format(now, "EEEE, MMMM d") : ""}</span>
          <span className="h-1 w-1 rounded-full bg-[var(--accent)] shrink-0" aria-hidden />
          <WeatherSummary />
        </div>
        {context === "dashboard" ? (
          <Link href="/accounting" title="Open the Accounting page" className={pill}>
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
              style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))" }}
            >
              <Calculator className="h-2.5 w-2.5" />
            </span>
            <span className="font-medium">Accounting</span>
          </Link>
        ) : (
          <Link href="/dashboard" title="Back to the dashboard" className={pill}>
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
              style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))" }}
            >
              <LayoutDashboard className="h-2.5 w-2.5" />
            </span>
            <span className="font-medium">Dashboard</span>
          </Link>
        )}
      </div>

      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
