"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { EyeOff, Eye, RotateCcw } from "lucide-react";
import { Card } from "@/components/Card";
import type { CalendarEvent } from "@/lib/google/calendar";

interface CalResp {
  events?: CalendarEvent[];
  error?: string;
  needsReauth?: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<CalResp>);

// Google all-day events come back as "YYYY-MM-DD" strings. Passing
// those to `new Date()` parses them as midnight UTC, which becomes the
// PREVIOUS day in any timezone west of UTC — that's why "May 23" was
// showing up as "May 22". Parse the components ourselves and construct
// a Date at local midnight instead.
function eventStartDate(e: CalendarEvent): Date {
  if (e.allDay) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.start);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(e.start);
}
const HIDDEN_KEY = "morning.hiddenEvents.v1";

function loadHidden(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveHidden(s: Set<string>) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s])); } catch {}
}

export function CalendarCard() {
  const { data, error, isLoading } = useSWR<CalResp>("/api/calendar", fetcher, {
    refreshInterval: 1000 * 60 * 5,
  });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => { setHidden(loadHidden()); }, []);

  function hide(id: string) {
    const next = new Set(hidden);
    next.add(id);
    setHidden(next);
    saveHidden(next);
  }
  function unhide(id: string) {
    const next = new Set(hidden);
    next.delete(id);
    setHidden(next);
    saveHidden(next);
  }
  function clearHidden() {
    const next = new Set<string>();
    setHidden(next);
    saveHidden(next);
  }

  const all = useMemo(() => data?.events ?? [], [data]);
  const visible = useMemo(() => all.filter((e) => !hidden.has(e.id)), [all, hidden]);
  const hiddenList = useMemo(() => all.filter((e) => hidden.has(e.id)), [all, hidden]);

  const action = (
    <>
      {hidden.size > 0 && (
        <button
          onClick={() => setShowHidden((v) => !v)}
          title={showHidden ? "Hide hidden" : `Show ${hidden.size} hidden`}
          className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink"
        >
          {showHidden ? "hide" : `${hidden.size} hidden`}
        </button>
      )}
    </>
  );

  return (
    <Card num="02" title="Upcoming" action={action}>
      {isLoading && <p className="text-muted text-sm">Loading…</p>}
      {error && <p className="text-accent text-sm">Couldn&rsquo;t load calendar.</p>}
      {data?.needsReauth && (
        <a href="/login" className="text-sm underline">
          Re-connect Google →
        </a>
      )}
      {data && !data.needsReauth && visible.length === 0 && hiddenList.length === 0 && (
        <p className="text-muted text-sm italic">Nothing scheduled. Enjoy the day.</p>
      )}

      <ul className="divide-rule pr-1">
        {visible.map((e) => (
          <li key={e.id} className="group flex items-start gap-3 py-2.5">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted pt-1 w-12 shrink-0">
              {format(eventStartDate(e), "MMM d")}
              <div className="text-[10px] mt-0.5 text-accent">
                {e.allDay ? "all day" : format(eventStartDate(e), "h:mma").toLowerCase()}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug truncate">{e.summary}</div>
              {e.location && (
                <div className="text-[11px] text-muted mt-0.5 truncate">{e.location}</div>
              )}
            </div>
            <button
              onClick={() => hide(e.id)}
              title="Hide this event"
              className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent transition shrink-0"
            >
              <EyeOff className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      {showHidden && hiddenList.length > 0 && (
        <div className="mt-3 pt-3 border-t rule">
          <div className="flex items-center justify-between mb-2">
            <span className="label">Hidden</span>
            <button
              onClick={clearHidden}
              className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink inline-flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" /> restore all
            </button>
          </div>
          <ul className="divide-rule">
            {hiddenList.map((e) => (
              <li key={e.id} className="group flex items-start gap-3 py-2 opacity-60">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted pt-1 w-12 shrink-0">
                  {format(eventStartDate(e), "MMM d")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug line-through truncate">{e.summary}</div>
                </div>
                <button
                  onClick={() => unhide(e.id)}
                  title="Show this event"
                  className="text-muted hover:text-ink transition shrink-0"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
