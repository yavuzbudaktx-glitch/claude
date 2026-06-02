"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useCity, clockPartsInTz, cityDateDDMMYYYY } from "@/lib/use-city";
import { usePref } from "@/components/PrefsProvider";
import { localDateKey } from "@/lib/local-date";

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

// Daily prayer checklist — five tap-to-mark boxes that track which of the
// day's prayers you've prayed. Stored per local-date in synced prefs, so it
// naturally resets each day and follows you across devices. Lives under the
// daily hadith as a gentle accountability nudge.
export function PrayerChecklist() {
  const today = localDateKey();
  const [doneMap, setDoneMap] = usePref<Record<string, string[]>>("hub.prayers.done", {});
  const todayDone = doneMap[today] ?? [];
  const count = todayDone.length;

  function toggle(id: string) {
    const cur = todayDone.includes(id) ? todayDone.filter((x) => x !== id) : [...todayDone, id];
    // Keep only today's bucket + the last few days so the blob stays tiny.
    const recent = Object.keys(doneMap).filter((d) => d >= today || (Date.now() - new Date(d).getTime()) < 7 * 86400000);
    const trimmed: Record<string, string[]> = {};
    for (const d of recent) trimmed[d] = doneMap[d];
    setDoneMap({ ...trimmed, [today]: cur });
  }

  return (
    <div className="mt-4 pt-4 border-t rule">
      <div className="flex items-baseline justify-between mb-2">
        <span className="label">Today&rsquo;s prayers</span>
        <span className={`font-mono text-[10px] uppercase tracking-wider ${count === 5 ? "text-accent" : "text-muted"}`}>
          {count}/5{count === 5 ? " · complete" : ""}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {ORDER.map((p) => {
          const on = todayDone.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              title={`Mark ${p.id} ${on ? "not prayed" : "prayed"}`}
              className={`flex flex-col items-center gap-1.5 rounded-xl py-2.5 border transition ${
                on ? "border-transparent" : "border-[var(--rule)] hover:border-[var(--ink-soft)]"
              }`}
              style={on ? { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" } : undefined}
            >
              <span className={`label !text-[9px] !tracking-[0.1em] ${on ? "!text-white" : ""}`}>{p.abbr}</span>
              {on ? (
                <Check className="h-4 w-4 text-white" strokeWidth={2.5} />
              ) : (
                <span className="h-4 w-4 rounded-full border border-[var(--muted-2)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PrayerTimes() {
  const { city } = useCity();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
