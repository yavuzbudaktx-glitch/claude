"use client";

import { useEffect, useState } from "react";

const PRAYERS = [
  { id: "fajr",    label: "Fajr"    },
  { id: "dhuhr",   label: "Dhuhr"   },
  { id: "asr",     label: "Asr"     },
  { id: "maghrib", label: "Maghrib" },
  { id: "isha",    label: "Isha"    },
] as const;

type PrayerId = typeof PRAYERS[number]["id"];

function todayKey() {
  const d = new Date();
  return `morning.prayers.${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function PrayerChecks() {
  const [done, setDone] = useState<Record<PrayerId, boolean>>({
    fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(todayKey());
      if (raw) setDone((d) => ({ ...d, ...(JSON.parse(raw) as Record<PrayerId, boolean>) }));
    } catch {}
    setHydrated(true);

    const checkRollover = () => {
      const k = todayKey();
      try {
        const raw = localStorage.getItem(k);
        if (!raw) {
          setDone({ fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false });
        }
      } catch {}
    };
    const interval = setInterval(checkRollover, 60_000);
    return () => clearInterval(interval);
  }, []);

  function toggle(id: PrayerId) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(todayKey(), JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const completedCount = Object.values(done).filter(Boolean).length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="label">Prayer</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {hydrated ? `${completedCount} / 5` : ""}
        </div>
      </div>
      <ul className="space-y-1.5">
        {PRAYERS.map((p) => {
          const checked = done[p.id];
          return (
            <li key={p.id}>
              <button
                onClick={() => toggle(p.id)}
                className="group w-full flex items-center gap-2.5 py-1 text-left"
              >
                <span
                  className={`relative h-4 w-4 rounded-full border transition flex items-center justify-center shrink-0 ${
                    checked
                      ? "bg-[var(--accent)] border-[var(--accent)]"
                      : "border-[var(--rule)] group-hover:border-[var(--ink)]"
                  }`}
                >
                  {checked && (
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-[var(--bg)]">
                      <path
                        d="M2.5 6.5l2.5 2 4-5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className={`font-serif text-[15px] tracking-tight ${
                    checked ? "text-muted line-through" : ""
                  }`}
                >
                  {p.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
