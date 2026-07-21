"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { usePref } from "@/components/PrefsProvider";
import { formatDurationShort, NOFAP_DEFAULT, sanitizeState, type NofapState } from "@/lib/nofap";

export function RelapseLogCard() {
  const [raw] = usePref<NofapState>("nofap.state", NOFAP_DEFAULT);
  const state = sanitizeState(raw);

  // date-fns formatting of stored epochs is stable, but the whole card's data
  // comes from localStorage — mount-gate so SSR and first client paint agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-[120px]" />;

  const { relapses, bestMs } = state;
  const avgMs =
    relapses.length > 0 ? relapses.reduce((a, r) => a + r.streakMs, 0) / relapses.length : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--paper)] p-3">
          <div className="label mb-0.5">Relapses</div>
          <div className="font-display text-2xl text-ink tabular-nums">{relapses.length}</div>
        </div>
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--paper)] p-3">
          <div className="label mb-0.5">Avg streak</div>
          <div className="font-display text-2xl text-ink tabular-nums">
            {relapses.length > 0 ? formatDurationShort(avgMs) : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--paper)] p-3">
          <div className="label mb-0.5">Longest</div>
          <div className="font-display text-2xl text-ink tabular-nums">
            {bestMs > 0 ? formatDurationShort(bestMs) : "—"}
          </div>
        </div>
      </div>

      {relapses.length === 0 ? (
        <p className="text-[12.5px] text-muted-2 italic">Nothing logged. Keep it that way.</p>
      ) : (
        <ul className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
          {relapses.map((r, i) => (
            <li
              key={`${r.at}-${i}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--paper)] px-3 py-2"
            >
              <span className="text-[12.5px] text-ink-soft">{format(r.at, "MMM d, yyyy · HH:mm")}</span>
              <span className="text-[12.5px] text-down font-medium whitespace-nowrap">
                −{formatDurationShort(r.streakMs)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
