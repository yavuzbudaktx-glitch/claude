"use client";

import { useState } from "react";
import {
  Check,
  X,
  Pencil,
  Clock,
  MapPin,
  History,
  CalendarCheck2,
  Hourglass,
  Ban,
} from "lucide-react";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import {
  SuggestDateForm,
  payloadFromValues,
  valuesFromSuggestion,
} from "@/components/zuya/calendar/SuggestDateForm";
import type { ZuyaDateSuggestionRow } from "@/types/zuya";

function fmtWhen(s: ZuyaDateSuggestionRow): string {
  const d = new Date(s.start_at);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) + " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function DateSuggestionItem({
  suggestion: s,
  onChanged,
}: {
  suggestion: ZuyaDateSuggestionRow;
  onChanged: () => void;
}) {
  const { me, partner } = useZuya();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const myTurn = s.status === "pending" && s.pending_from === me.user_id;
  const theirTurn = s.status === "pending" && s.pending_from === partner.user_id;

  async function act(action: "accept" | "reject" | "cancel", fields?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/zuya/dates/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, fields }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.warnings?.length) setWarnings(d.warnings);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function counter(values: Parameters<typeof payloadFromValues>[0]) {
    setBusy(true);
    try {
      const p = payloadFromValues(values);
      await fetch(`/api/zuya/dates/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "counter",
          fields: {
            title: p.title,
            day: p.day,
            start_at: p.start_at,
            place: p.place,
            note: p.note,
          },
        }),
      });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const badge =
    s.status === "accepted" ? (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-up">
        <CalendarCheck2 className="h-3 w-3" /> on both calendars
      </span>
    ) : s.status === "rejected" ? (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-down">
        <X className="h-3 w-3" /> declined
      </span>
    ) : s.status === "cancelled" ? (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
        <Ban className="h-3 w-3" /> withdrawn
      </span>
    ) : theirTurn ? (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
        <Hourglass className="h-3 w-3" /> waiting for {partner.display_name}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
        <Hourglass className="h-3 w-3" /> your turn
      </span>
    );

  return (
    <div className="card-bare !p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink truncate">{s.title}</p>
          <p className="text-[12px] text-muted mt-0.5 inline-flex items-center gap-1.5 flex-wrap">
            <Clock className="h-3 w-3" /> {fmtWhen(s)}
            {s.place && (
              <>
                <MapPin className="h-3 w-3 ml-1" /> {s.place}
              </>
            )}
          </p>
          {s.note && <p className="text-[12.5px] text-ink-soft mt-1.5 italic">“{s.note}”</p>}
        </div>
        <div className="shrink-0 text-right">{badge}</div>
      </div>

      {warnings.length > 0 && (
        <p className="text-[11.5px] text-down mt-2">{warnings.join(" · ")}</p>
      )}

      {(s.history?.length ?? 0) > 0 && (
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-2 hover:text-ink transition"
        >
          <History className="h-3 w-3" /> {s.history.length} edit{s.history.length > 1 ? "s" : ""}
        </button>
      )}
      {showHistory && (
        <div className="mt-1.5 space-y-1">
          {s.history.map((h, i) => (
            <p key={i} className="text-[11px] text-muted-2">
              {h.by === me.user_id ? "You" : partner.display_name} changed{" "}
              {Object.keys(h.fields).join(", ")} ·{" "}
              {new Date(h.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
          ))}
        </div>
      )}

      {myTurn && !editing && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => act("accept")}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
          >
            <Check className="h-3.5 w-3.5" /> Accept
          </button>
          <button
            onClick={() => setEditing(true)}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-medium border border-[var(--rule)] hover:border-[var(--accent)] transition disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Suggest edits
          </button>
          <button
            onClick={() => act("reject")}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] text-muted hover:text-down border border-[var(--rule)] hover:border-[var(--down)] transition disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {theirTurn && (
        <div className="mt-3">
          <button
            onClick={() => act("cancel")}
            disabled={busy}
            className="text-[11.5px] text-muted-2 hover:text-down transition"
          >
            withdraw this idea
          </button>
        </div>
      )}

      {editing && (
        <div className="mt-3">
          <SuggestDateForm
            initial={valuesFromSuggestion(s)}
            submitLabel="Send my version"
            busy={busy}
            onSubmit={counter}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}
