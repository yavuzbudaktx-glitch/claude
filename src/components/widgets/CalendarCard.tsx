"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { EyeOff, Eye, RotateCcw, Mail } from "lucide-react";
import { Card } from "@/components/Card";
import { usePref } from "@/components/PrefsProvider";
import type { CalendarEvent } from "@/lib/google/calendar";
import type { EmailItem } from "@/lib/google/gmail";

interface CalResp {
  events?: CalendarEvent[];
  error?: string;
  needsReauth?: boolean;
}
interface MailResp {
  emails?: EmailItem[];
  error?: string;
  needsReauth?: boolean;
  hint?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
function relTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ageH = (Date.now() - d.getTime()) / 3_600_000;
  return ageH < 24 ? formatDistanceToNowStrict(d, { addSuffix: false }) : format(d, "MMM d");
}

function InboxTab() {
  const { data, error, isLoading } = useSWR<MailResp>("/api/emails", fetcher, {
    refreshInterval: 1000 * 60 * 3,
    keepPreviousData: true,
  });

  if (isLoading && !data) return <p className="text-muted text-sm">Loading…</p>;
  if (data?.needsReauth || data?.error) {
    return (
      <div className="text-sm">
        <p className="text-muted mb-2">
          {data?.hint ?? "Gmail access isn’t connected yet."}
        </p>
        <a href="/login" className="text-accent underline underline-offset-2">
          Re-connect Google →
        </a>
      </div>
    );
  }
  if (error) return <p className="text-accent text-sm">Couldn&rsquo;t load email.</p>;

  const emails = data?.emails ?? [];
  if (emails.length === 0) return <p className="text-muted text-sm italic">Inbox zero. Nice.</p>;

  return (
    <ul className="divide-rule pr-1">
      {emails.map((m) => (
        <li key={m.id}>
          <a
            href={`https://mail.google.com/mail/u/0/#all/${m.id}`}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-2.5 py-2.5"
          >
            <span
              className={`mt-[7px] h-2 w-2 rounded-full shrink-0 ${m.unread ? "bg-accent" : "bg-transparent border border-[var(--rule)]"}`}
              title={m.unread ? "Unread" : "Read"}
              aria-label={m.unread ? "Unread" : "Read"}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[13px] truncate ${m.unread ? "font-semibold text-ink" : "text-ink-soft"}`}>
                  {m.fromName}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted shrink-0">
                  {relTime(m.date)}
                </span>
              </div>
              <div className={`text-[12.5px] leading-snug truncate ${m.unread ? "font-medium text-ink" : "text-muted"}`}>
                {m.subject}
              </div>
              <div className="text-[11px] text-muted truncate mt-0.5">{m.snippet}</div>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

function CalendarTab({
  hidden,
  hide,
  unhide,
  clearHidden,
  showHidden,
}: {
  hidden: Set<string>;
  hide: (id: string) => void;
  unhide: (id: string) => void;
  clearHidden: () => void;
  showHidden: boolean;
}) {
  const { data, error, isLoading } = useSWR<CalResp>("/api/calendar", fetcher, {
    refreshInterval: 1000 * 60 * 5,
  });

  const all = useMemo(() => data?.events ?? [], [data]);
  const visible = useMemo(() => all.filter((e) => !hidden.has(e.id)), [all, hidden]);
  const hiddenList = useMemo(() => all.filter((e) => hidden.has(e.id)), [all, hidden]);

  return (
    <>
      {isLoading && <p className="text-muted text-sm">Loading…</p>}
      {error && <p className="text-accent text-sm">Couldn&rsquo;t load calendar.</p>}
      {data?.needsReauth && (
        <a href="/login" className="text-sm underline">Re-connect Google →</a>
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
    </>
  );
}

export function CalendarCard() {
  const [tab, setTab] = useState<"calendar" | "inbox">("calendar");
  const [showHidden, setShowHidden] = useState(false);
  // Hidden events sync across devices.
  const [hiddenArr, setHiddenArr] = usePref<string[]>("hiddenEvents", []);
  const hidden = useMemo(() => new Set(hiddenArr), [hiddenArr]);

  // Subscribe to the same SWR cache the CalendarTab uses so we can count
  // how many hidden events are still in the upcoming window (passed events
  // drop out and would otherwise leave a stale "X hidden" counter pointing
  // at nothing). SWR dedupes by key — this doesn't refetch.
  const { data: calData } = useSWR<CalResp>("/api/calendar", fetcher, {
    refreshInterval: 1000 * 60 * 5,
  });
  // Same trick for the inbox: dedupes with InboxTab's own SWR so the badge
  // updates in lockstep and we don't double-fetch.
  const { data: mailData } = useSWR<MailResp>("/api/emails", fetcher, {
    refreshInterval: 1000 * 60 * 3,
  });
  const unreadCount = (mailData?.emails ?? []).filter((m) => m.unread).length;
  const liveHiddenIds = useMemo(
    () => new Set((calData?.events ?? []).filter((e) => hidden.has(e.id)).map((e) => e.id)),
    [calData?.events, hidden],
  );
  const liveHiddenCount = liveHiddenIds.size;

  // Prune ghost IDs (events that have passed and are no longer returned by
  // the API) so storage doesn't accumulate forever.
  useEffect(() => {
    const events = calData?.events;
    if (!events || hiddenArr.length === 0) return;
    const presentIds = new Set(events.map((e) => e.id));
    const next = hiddenArr.filter((id) => presentIds.has(id));
    if (next.length !== hiddenArr.length) setHiddenArr(next);
  }, [calData?.events, hiddenArr, setHiddenArr]);

  function hide(id: string) {
    if (!hiddenArr.includes(id)) setHiddenArr([...hiddenArr, id]);
  }
  function unhide(id: string) {
    setHiddenArr(hiddenArr.filter((x) => x !== id));
  }
  function clearHidden() {
    setHiddenArr([]);
  }

  const tabs = (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={() => setTab("calendar")}
        className={`chip normal-case !px-2.5 !py-0.5 !text-[11px] ${tab === "calendar" ? "chip-active" : ""}`}
      >
        Calendar
      </button>
      <button
        onClick={() => setTab("inbox")}
        className={`chip normal-case !px-2.5 !py-0.5 !text-[11px] inline-flex items-center gap-1 ${tab === "inbox" ? "chip-active" : ""}`}
        title={unreadCount > 0 ? `${unreadCount} unread` : "Inbox"}
      >
        <span className="relative inline-flex">
          <Mail className="h-3 w-3" />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className={`absolute -top-[3px] -right-[3px] h-1.5 w-1.5 rounded-full ${tab === "inbox" ? "bg-white" : "bg-accent"}`}
              style={{ boxShadow: tab === "inbox" ? "none" : "0 0 6px var(--glow)" }}
            />
          )}
        </span>
        Inbox
        {unreadCount > 0 && (
          <span className={`font-mono text-[10px] tabular-nums ${tab === "inbox" ? "text-white/90" : "text-accent"}`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </span>
  );

  const action =
    tab === "calendar" && liveHiddenCount > 0 ? (
      <button
        onClick={() => setShowHidden((v) => !v)}
        title={showHidden ? "Hide hidden" : `Show ${liveHiddenCount} hidden`}
        className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink"
      >
        {showHidden ? "hide" : `${liveHiddenCount} hidden`}
      </button>
    ) : null;

  return (
    <Card num="02" title="" meta={tabs} action={action}>
      {tab === "calendar" ? (
        <CalendarTab
          hidden={hidden}
          hide={hide}
          unhide={unhide}
          clearHidden={clearHidden}
          showHidden={showHidden}
        />
      ) : (
        <InboxTab />
      )}
    </Card>
  );
}
