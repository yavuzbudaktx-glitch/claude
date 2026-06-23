"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent } from "@/lib/google/calendar";

// A one-line "here's your day" summary that replaces the Britannica box.
// Pulls from data the dashboard is ALREADY fetching elsewhere (weather,
// calendar, tasks) so there's no new upstream to break — just a compact
// narrative built from numbers we already have.

interface CalResp { events?: CalendarEvent[] }
interface WeatherResp { current?: { temp?: number; condition?: string }; today?: { high?: number; low?: number } }
interface City { lat: number; lon: number; timezone: string }
interface TaskRow { id: string; title: string; status: string | null; completed: boolean | null; quadrant: number | null }

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

function partOfDay(d: Date): "morning" | "afternoon" | "evening" {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export function TodaySummaryCard() {
  // Calendar + weather come from existing endpoints. Tasks come from supabase
  // (same query EisenhowerMatrix uses) — read-only, no realtime needed here.
  const { data: cal } = useSWR<CalResp>("/api/calendar", jsonFetcher, {
    refreshInterval: 1000 * 60 * 15,
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  const [city, setCity] = useState<City | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("morning.city.v1");
      if (raw) setCity(JSON.parse(raw) as City);
    } catch {}
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
      const { data, error } = await supabase
        .from("tasks")
        .select("id,status,completed")
        .eq("user_id", user.id);
      if (cancelled || error) return;
      const open = (data as TaskRow[] | null ?? []).filter(
        (t) => !t.completed && t.status !== "done" && t.status !== "completed",
      ).length;
      setOpenTasks(open);
    })();
    return () => { cancelled = true; };
  }, []);

  // Pieces of the summary line.
  const todayEvents = (cal?.events ?? []).filter((e) => isToday(e.start));
  const upcomingToday = todayEvents
    .filter((e) => !e.allDay && new Date(e.start) >= new Date())
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const nextEvent = upcomingToday[0];

  const part = partOfDay(new Date());
  const greeting = part === "morning" ? "Good morning" : part === "afternoon" ? "Good afternoon" : "Good evening";

  const pieces: string[] = [];
  if (weather?.current?.temp != null) {
    const t = Math.round(weather.current.temp);
    const cond = weather.current.condition ? `, ${weather.current.condition.toLowerCase()}` : "";
    const hi = weather.today?.high != null ? `, high ${Math.round(weather.today.high)}°` : "";
    pieces.push(`${t}°${cond}${hi}`);
  }
  if (todayEvents.length > 0) {
    if (nextEvent) {
      pieces.push(`${todayEvents.length} event${todayEvents.length === 1 ? "" : "s"} today (next ${fmtTime(nextEvent.start)} · ${nextEvent.summary || "(no title)"})`);
    } else {
      pieces.push(`${todayEvents.length} event${todayEvents.length === 1 ? "" : "s"} today`);
    }
  } else {
    pieces.push("no events on the calendar");
  }
  if (openTasks != null) {
    pieces.push(openTasks === 0 ? "tasks clear" : `${openTasks} open task${openTasks === 1 ? "" : "s"}`);
  }

  return (
    <div className="animate-fadeIn">
      <div className="label mb-1.5">Today</div>
      <div className="font-serif text-[14px] leading-snug text-ink-soft">
        <span className="font-medium text-ink">{greeting}.</span>{" "}
        {pieces.length > 0 ? pieces.join(" · ") + "." : "Setting up your day…"}
      </div>
    </div>
  );
}
