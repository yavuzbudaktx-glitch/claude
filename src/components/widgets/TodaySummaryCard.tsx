"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { Dumbbell, CalendarClock, CheckCircle2, CloudSun, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePref } from "@/components/PrefsProvider";
import { localDateKey } from "@/lib/local-date";
import type { CalendarEvent } from "@/lib/google/calendar";

// "Here's your day" snapshot that replaced the Britannica box. Built entirely
// from data the dashboard already has (weather, calendar, tasks, habits) — no
// new upstream to break. A few compact stat chips plus a gym reminder on
// training days (Mon/Tue/Thu/Sat).

interface CalResp { events?: CalendarEvent[] }
interface WeatherResp { current?: { temp?: number; condition?: string }; today?: { high?: number; low?: number } }
interface City { lat: number; lon: number; timezone: string }
interface TaskRow { id: string; status: string | null; completed: boolean | null }

const jsonFetcher = (u: string) => fetch(u).then((r) => r.json());

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
}

function untilLabel(iso: string): string {
  const mins = Math.round((+new Date(iso) - Date.now()) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

function Chip({ icon: Icon, children, tone = "muted" }: { icon: typeof Dumbbell; children: React.ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] ${tone === "accent" ? "text-accent" : "text-ink-soft"}`}>
      <Icon className={`h-3.5 w-3.5 ${tone === "accent" ? "text-accent" : "text-muted-2"}`} />
      {children}
    </span>
  );
}

export function TodaySummaryCard() {
  const { data: cal } = useSWR<CalResp>("/api/calendar", jsonFetcher, {
    refreshInterval: 1000 * 60 * 15, keepPreviousData: true, revalidateOnFocus: false,
  });
  const [city, setCity] = useState<City | null>(null);
  useEffect(() => {
    try { const raw = localStorage.getItem("morning.city.v1"); if (raw) setCity(JSON.parse(raw) as City); } catch {}
  }, []);
  const { data: weather } = useSWR<WeatherResp>(
    city ? `/api/weather?lat=${city.lat}&lon=${city.lon}&tz=${encodeURIComponent(city.timezone)}` : null,
    jsonFetcher,
    { refreshInterval: 1000 * 60 * 30, keepPreviousData: true, revalidateOnFocus: false },
  );

  const [openTasks, setOpenTasks] = useState<number | null>(null);
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from("tasks").select("id,status,completed").eq("user_id", user.id);
      if (cancelled || error) return;
      const open = (data as TaskRow[] | null ?? []).filter(
        (t) => !t.completed && t.status !== "done" && t.status !== "completed",
      ).length;
      setOpenTasks(open);
    })();
    return () => { cancelled = true; };
  }, []);

  // Habits done today — same prefs the habit tracker writes.
  const [habitList] = usePref<string[]>("habitList", ["Water", "Steps", "Reading"]);
  const [habits] = usePref<Record<string, string[]>>("habits", {});
  const todayKey = localDateKey();
  const habitsDone = habitList.filter((h) => (habits[h] ?? []).includes(todayKey)).length;

  // Re-tick once a minute so the "in 2h 5m" countdown stays accurate.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayEvents = (cal?.events ?? []).filter((e) => isToday(e.start));
  const nextEvent = todayEvents
    .filter((e) => !e.allDay && new Date(e.start) >= new Date())
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))[0];

  // Gym days: Mon, Tue, Thu, Sat (getDay → 1, 2, 4, 6).
  const isGymDay = [1, 2, 4, 6].includes(new Date().getDay());

  return (
    // `readable-plate` is a no-op in most themes; the heavily patterned ones
    // (mosaic tilework, comic halftone) turn it into a soft paper plate so this
    // strip — which sits straight on the page background with no card behind
    // it — stays readable over the pattern.
    <div className="animate-fadeIn readable-plate">
      <div className="label mb-2">Today</div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {weather?.current?.temp != null && (
          <Chip icon={CloudSun}>
            <span className="tabular-nums">{Math.round(weather.current.temp)}°</span>
            {weather.current.condition ? <span className="text-muted">{weather.current.condition.toLowerCase()}</span> : null}
            {weather.today?.high != null && <span className="text-muted-2 tabular-nums">H {Math.round(weather.today.high)}°</span>}
          </Chip>
        )}

        <Chip icon={CalendarClock}>
          {nextEvent
            ? <span>{nextEvent.summary || "Event"} <span className="text-muted-2">· {fmtTime(nextEvent.start)} ({untilLabel(nextEvent.start)})</span></span>
            : todayEvents.length > 0
              ? <span className="text-muted">{todayEvents.length} event{todayEvents.length === 1 ? "" : "s"}, none left</span>
              : <span className="text-muted">No events</span>}
        </Chip>

        {openTasks != null && (
          <Chip icon={CheckCircle2} tone={openTasks === 0 ? "accent" : "muted"}>
            {openTasks === 0 ? "Tasks clear" : `${openTasks} open task${openTasks === 1 ? "" : "s"}`}
          </Chip>
        )}

        {habitList.length > 0 && (
          <Chip icon={Flame} tone={habitsDone === habitList.length ? "accent" : "muted"}>
            <span className="tabular-nums">{habitsDone}/{habitList.length}</span> habits
          </Chip>
        )}
      </div>

      {isGymDay && (
        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-accent-soft border border-[var(--rule)] px-2.5 py-1 text-[11.5px] font-semibold text-accent">
          <Dumbbell className="h-3.5 w-3.5" />
          Gym day — don&rsquo;t skip it.
        </div>
      )}
    </div>
  );
}
