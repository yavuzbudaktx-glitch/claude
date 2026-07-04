"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { CalendarDays, CalendarHeart, Sparkles } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import { OWNER_COLORS } from "@/components/zuya/calendar/MonthGrid";
import { WeekView } from "@/components/zuya/calendar/WeekView";
import {
  SuggestDateForm,
  payloadFromValues,
  type DateFormValues,
} from "@/components/zuya/calendar/SuggestDateForm";
import { DateSuggestionItem } from "@/components/zuya/calendar/DateSuggestions";
import type { ZuyaUsername } from "@/lib/zuya/config";
import type { ZuyaDateSuggestionRow } from "@/types/zuya";

interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  owner: ZuyaUsername;
}

interface CalResp {
  events: CalEvent[];
  connected: Record<ZuyaUsername, "connected" | "not_connected" | "needs_reconnect" | "error">;
  details?: Record<string, string>;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// Monday of the week containing `d`, at local midnight.
function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

type Tab = "calendar" | "suggest" | "plans";

export function ZuyaCalendarCard() {
  const { supabase, me, partner } = useZuya();
  const [tab, setTab] = useState<Tab>("calendar");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ZuyaDateSuggestionRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [bucketPrefill, setBucketPrefill] = useState<{ id: string; title: string } | null>(null);

  // "Plan it" from the bucket list card jumps here with the item prefilled.
  useEffect(() => {
    const onPlan = (e: Event) => {
      const d = (e as CustomEvent<{ bucketId: string; title: string }>).detail;
      if (!d) return;
      setBucketPrefill({ id: d.bucketId, title: d.title });
      setTab("suggest");
    };
    window.addEventListener("zuya:plan-date", onPlan);
    return () => window.removeEventListener("zuya:plan-date", onPlan);
  }, []);

  // Window: the visible week plus a week of context either side.
  const from = new Date(weekStart.getTime() - 7 * 86400_000).toISOString();
  const to = new Date(weekStart.getTime() + 21 * 86400_000).toISOString();
  const { data, error, isLoading, mutate } = useSWR<CalResp>(
    `/api/zuya/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const loadSuggestions = useCallback(async () => {
    const { data: rows } = await supabase
      .from("zuya_date_suggestions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setSuggestions((rows as ZuyaDateSuggestionRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  useZuyaTableEvent("zuya_date_suggestions", () => void loadSuggestions());

  const acceptedDays = useMemo(
    () => new Set(suggestions.filter((s) => s.status === "accepted").map((s) => s.day)),
    [suggestions],
  );

  const pending = suggestions.filter((s) => s.status === "pending");
  const myTurnCount = pending.filter((s) => s.pending_from === me.user_id).length;

  async function createSuggestion(values: DateFormValues) {
    setCreating(true);
    try {
      const res = await fetch("/api/zuya/dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromValues(values)),
      });
      if (res.ok) {
        setBucketPrefill(null);
        setTab("plans");
        void loadSuggestions();
      }
    } finally {
      setCreating(false);
    }
  }

  function connChip(username: ZuyaUsername) {
    const state = data?.connected?.[username];
    if (!state || state === "connected") return null;
    const isMe = me.username === username;
    const name = isMe ? "your" : `${partner.display_name}'s`;
    const detail = data?.details?.[username];
    const label =
      state === "needs_reconnect"
        ? `${name} Google needs reconnecting`
        : state === "error"
          ? `${name} calendar didn't load`
          : `${name} Google Calendar isn't connected`;
    return (
      <div
        key={username}
        className="rounded-xl px-3 py-2 bg-[var(--accent-soft)] text-[12px] text-ink-soft"
      >
        <div className="flex items-center justify-between gap-2">
          <span>{label}</span>
          {isMe && (
            <a href="/api/zuya/google/start" className="font-semibold text-accent shrink-0">
              {state === "needs_reconnect" || state === "error" ? "Reconnect →" : "Connect →"}
            </a>
          )}
        </div>
        {isMe && detail && (
          <p className="mt-1 text-[10.5px] font-mono text-muted-2 break-words">{detail}</p>
        )}
      </div>
    );
  }

  const tabBtn = (t: Tab, icon: React.ReactNode, label: string, badge?: number) => (
    <button
      onClick={() => setTab(t)}
      className={`relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12.5px] font-medium transition ${
        tab === t
          ? "text-white"
          : "text-muted hover:text-ink border border-[var(--rule)]"
      }`}
      style={
        tab === t
          ? { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }
          : undefined
      }
    >
      {icon}
      {label}
      {!!badge && badge > 0 && (
        <span className="grid place-items-center rounded-full text-[9.5px] font-bold min-w-[16px] h-4 px-1 bg-[var(--accent)] text-white">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <Card
      id="zuya-calendar-card"
      title="Calendar"
      collapsible={false}
      status={{
        updatedAt: data ? Date.now() : undefined,
        loading: isLoading,
        error: !!error,
        onRetry: () => void mutate(),
      }}
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {tabBtn("calendar", <CalendarDays className="h-3.5 w-3.5" />, "Calendar")}
        {tabBtn("suggest", <Sparkles className="h-3.5 w-3.5" />, "Suggest a date")}
        {tabBtn("plans", <CalendarHeart className="h-3.5 w-3.5" />, "Plans", myTurnCount)}
      </div>

      {tab === "calendar" && (
        <div className="space-y-3">
          {connChip("yavuz")}
          {connChip("zuleyha")}

          <WeekView
            weekStart={weekStart}
            onWeekChange={(d) => setWeekStart(mondayOf(d))}
            events={data?.events ?? []}
            acceptedDays={acceptedDays}
            selectedDay={selectedDay}
            onSelectDay={(d) => setSelectedDay(d === selectedDay ? null : d)}
          />

          <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
            {(["yavuz", "zuleyha"] as ZuyaUsername[]).map((u) => (
              <span key={u} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: OWNER_COLORS[u] }} />
                {u === me.username ? me.display_name : partner.display_name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <CalendarHeart className="h-3 w-3 text-accent" /> buluşma
            </span>
            {selectedDay && (
              <button
                onClick={() => setTab("suggest")}
                className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:brightness-110"
              >
                <Sparkles className="h-3.5 w-3.5" /> Bu güne teklif et →
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "suggest" && (
        <div className="max-w-md">
          <p className="text-[13px] text-muted mb-3">
            Pick a day, time and place. {partner.display_name} can accept, suggest changes, or pass.
          </p>
          <SuggestDateForm
            key={bucketPrefill?.id ?? "blank"}
            initial={{
              day: selectedDay ?? "",
              title: bucketPrefill?.title,
              bucket_item_id: bucketPrefill?.id ?? null,
            }}
            submitLabel={`Send to ${partner.display_name}`}
            busy={creating}
            onSubmit={createSuggestion}
          />
        </div>
      )}

      {tab === "plans" && (
        <div className="space-y-2.5">
          {suggestions.length === 0 && (
            <p className="text-[13px] text-muted">
              Nothing planned yet.
            </p>
          )}
          {suggestions.map((s) => (
            <DateSuggestionItem key={s.id} suggestion={s} onChanged={() => void loadSuggestions()} />
          ))}
        </div>
      )}
    </Card>
  );
}
