"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { useCity, clockPartsInTz, cityDateDDMMYYYY } from "@/lib/use-city";

// The five obligatory prayers only — sunrise/imsak/etc. are intentionally
// excluded per the design.
const ORDER = [
  { id: "Fajr", abbr: "FJR" },
  { id: "Dhuhr", abbr: "DHR" },
  { id: "Asr", abbr: "ASR" },
  { id: "Maghrib", abbr: "MGB" },
  { id: "Isha", abbr: "ISH" },
] as const;

type PrayerId = (typeof ORDER)[number]["id"];

interface AladhanResp {
  data?: { timings?: Record<string, string> };
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<AladhanResp>);

// "13:24" / "13:24 (CDT)" → seconds since midnight; NaN if unparseable.
function hhmmToSeconds(raw: string | undefined): number {
  if (!raw) return NaN;
  const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!m) return NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

function hhmm(raw: string | undefined): string {
  if (!raw) return "—";
  const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "—";
}

function fmtCountdown(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PrayerTimes() {
  const { city } = useCity();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Aladhan, method 2 (ISNA). Keyed on the city's local date so it
  // re-fetches at the city's midnight, and on coordinates so it re-fetches
  // the instant the user picks a new city.
  const dateStr = cityDateDDMMYYYY(city.timezone);
  const { data } = useSWR<AladhanResp>(
    `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${city.lat}&longitude=${city.lon}&method=2`,
    fetcher,
    { refreshInterval: 1000 * 60 * 30, keepPreviousData: true, revalidateOnFocus: false },
  );

  const timings = data?.data?.timings;

  // Which prayer is next, how long until it, and how much of the current
  // interval (previous prayer → next prayer) is still LEFT — the latter
  // drives the progress bar, which empties as the next prayer approaches.
  // Handles both wraparounds: before Fajr the previous prayer is
  // yesterday's Isha; after Isha the next is tomorrow's Fajr.
  let nextId: PrayerId | null = null;
  let remaining = 0;
  let progress = 0;
  if (timings && now) {
    const { h, m, s } = clockPartsInTz(now, city.timezone);
    const nowSec = h * 3600 + m * 60 + s;
    const secs = ORDER.map((p) => ({ id: p.id, sec: hhmmToSeconds(timings[p.id]) }));
    if (secs.every((p) => Number.isFinite(p.sec))) {
      const lastIdx = secs.length - 1;
      const nextIdx = secs.findIndex((p) => p.sec > nowSec);
      let nextSecAbs: number;
      let prevSecAbs: number;
      if (nextIdx === -1) {
        nextId = secs[0].id;                  // tomorrow's Fajr
        nextSecAbs = secs[0].sec + 86400;
        prevSecAbs = secs[lastIdx].sec;       // today's Isha
      } else {
        nextId = secs[nextIdx].id;
        nextSecAbs = secs[nextIdx].sec;
        prevSecAbs =
          nextIdx === 0
            ? secs[lastIdx].sec - 86400       // yesterday's Isha
            : secs[nextIdx - 1].sec;
      }
      remaining = nextSecAbs - nowSec;
      const interval = nextSecAbs - prevSecAbs;
      // Fraction of the interval REMAINING → bar drains toward the prayer.
      progress = interval > 0 ? Math.min(1, Math.max(0, remaining / interval)) : 0;
    }
  }

  return (
    <div>
      <div className="h-1.5 w-full rounded-full bg-[var(--rule)] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{
            width: `${(progress * 100).toFixed(2)}%`,
            background: "linear-gradient(90deg, var(--grad-from), var(--grad-via), var(--grad-to))",
          }}
        />
      </div>

      <div className="text-center font-display tracking-tight text-ink text-xl mt-3.5 leading-snug">
        {timings && nextId ? (
          <>
            <span className="tabular-nums">{fmtCountdown(remaining)}</span>{" "}
            <span className="text-muted font-normal">left until {nextId}</span>
          </>
        ) : (
          <span className="text-muted font-normal">Loading prayer times…</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1 text-center">
        {ORDER.map((p) => {
          const isNext = p.id === nextId;
          return (
            <div
              key={p.id}
              className={`rounded-xl py-1.5 transition ${isNext ? "bg-hl" : ""}`}
            >
              <div className={`label !tracking-[0.12em] ${isNext ? "text-accent" : ""}`}>
                {p.abbr}
              </div>
              <div
                className={`font-mono tabular-nums text-[14px] mt-1 ${
                  isNext ? "text-accent font-semibold" : "text-ink"
                }`}
              >
                {hhmm(timings?.[p.id])}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
