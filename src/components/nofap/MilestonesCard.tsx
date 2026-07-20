"use client";

import { useEffect, useState } from "react";
import { Award, Lock } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";
import { MILESTONES, NOFAP_DEFAULT, sanitizeState, type NofapState } from "@/lib/nofap";

const DAY_MS = 86_400_000;

export function MilestonesCard() {
  const [raw] = usePref<NofapState>("nofap.state", NOFAP_DEFAULT);
  const state = sanitizeState(raw);

  // Minute-level ticking is plenty for day-granularity milestones.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (now === null) return <div className="h-[200px]" />;

  const elapsedMs = state.startedAt === null ? 0 : now - state.startedAt;
  const elapsedDays = elapsedMs / DAY_MS;
  const next = MILESTONES.find((m) => elapsedDays < m.days);

  return (
    <div className="space-y-4">
      {next ? (
        <p className="text-[12.5px] text-muted">
          Next: <span className="text-ink-soft font-medium">{next.title}</span> in{" "}
          <span className="text-accent font-medium">
            {Math.floor(next.days - elapsedDays)}d {Math.floor(((next.days - elapsedDays) % 1) * 24)}h
          </span>
        </p>
      ) : (
        <p className="text-[12.5px] text-up font-medium">Every milestone cleared. Keep walking.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {MILESTONES.map((m) => {
          const hit = elapsedDays >= m.days;
          return (
            <div
              key={m.days}
              className={`rounded-xl border p-3 transition ${
                hit
                  ? "border-[var(--accent)] bg-[var(--paper)]"
                  : "border-[var(--glass-border)] bg-[var(--paper)] opacity-50"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {hit ? (
                  <Award className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <Lock className="h-3 w-3 text-muted-2" />
                )}
                <span className={`text-[12.5px] font-semibold ${hit ? "text-ink" : "text-muted"}`}>
                  {m.days}d — {m.title}
                </span>
              </div>
              <p className={`text-[11.5px] leading-snug ${hit ? "text-ink-soft" : "text-muted-2"}`}>{m.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
