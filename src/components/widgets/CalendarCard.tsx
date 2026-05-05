"use client";

import useSWR from "swr";
import { Calendar, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Card } from "@/components/Card";
import type { CalendarEvent } from "@/lib/google/calendar";

interface CalResp {
  events?: CalendarEvent[];
  error?: string;
  needsReauth?: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<CalResp>);

export function CalendarCard() {
  const { data, error, isLoading } = useSWR<CalResp>("/api/calendar", fetcher, {
    refreshInterval: 1000 * 60 * 5,
  });

  return (
    <Card title="Upcoming" icon={<Calendar className="h-4 w-4" />}>
      {isLoading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-rose-400">Couldn&rsquo;t load calendar.</p>}
      {data?.needsReauth && (
        <a href="/login" className="text-accent text-sm underline">
          Re-connect Google to see calendar →
        </a>
      )}
      {data?.events && data.events.length === 0 && (
        <p className="text-muted text-sm">Nothing on the calendar. Enjoy your day.</p>
      )}
      {data?.events && data.events.length > 0 && (
        <ul className="space-y-3">
          {data.events.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium leading-tight">{e.summary}</div>
                <div className="text-xs text-muted mt-0.5">
                  {e.allDay
                    ? format(new Date(e.start), "EEE MMM d")
                    : format(new Date(e.start), "EEE MMM d · h:mm a")}
                  {e.location ? ` · ${e.location}` : ""}
                </div>
              </div>
              {e.htmlLink && (
                <a href={e.htmlLink} target="_blank" rel="noreferrer" className="text-muted hover:text-white">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
