"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, SendHorizontal, Sparkles } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import { ZUYA_QUESTIONS } from "@/lib/zuya/questions";
import { zuyaToday, zuyaSeedIdx } from "@/lib/zuya/day";
import type { ZuyaDailyAnswerRow } from "@/types/zuya";

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// One question a day; both answer blind. The partner's answer physically
// doesn't leave the database (RLS) until you've answered that day.
export function DailyQuestionCard() {
  const { supabase, me, partner } = useZuya();
  const today = zuyaToday();
  const [day, setDay] = useState(today);
  const [answers, setAnswers] = useState<ZuyaDailyAnswerRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [partnerHasAnswered, setPartnerHasAnswered] = useState(false);

  const questionIdx = useMemo(
    () => zuyaSeedIdx(`${day}-zuya-question`, ZUYA_QUESTIONS.length),
    [day],
  );

  const mine = answers.find((a) => a.user_id === me.user_id && a.day === day);
  const theirs = answers.find((a) => a.user_id === partner.user_id && a.day === day);
  // Question for a past day: prefer the recorded index (list may grow).
  const q = ZUYA_QUESTIONS[mine?.question_idx ?? theirs?.question_idx ?? questionIdx];

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("zuya_daily_answers")
      .select("*")
      .eq("day", day);
    setAnswers((data as ZuyaDailyAnswerRow[]) ?? []);
    // "Has the partner answered?" without seeing the row: count with head.
    // RLS hides their row pre-reveal, so this only works post-reveal — show a
    // soft hint instead when we can't know.
    const rows = (data as ZuyaDailyAnswerRow[]) ?? [];
    setPartnerHasAnswered(rows.some((r) => r.user_id === partner.user_id));
  }, [supabase, day, partner.user_id]);

  useEffect(() => {
    void load();
  }, [load]);

  useZuyaTableEvent("zuya_daily_answers", () => void load());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("zuya_daily_answers").insert({
        user_id: me.user_id,
        day,
        question_idx: questionIdx,
        answer: text,
      });
      if (!error) {
        setDraft("");
        void load();
      }
    } finally {
      setBusy(false);
    }
  }

  const revealed = !!mine && !!theirs;
  const isToday = day === today;

  return (
    <Card id="zuya-question-card" title="Question of the day" meta="günün sorusu" collapsible={false}>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setDay(shiftDay(day, -1))}
          className="grid place-items-center h-7 w-7 rounded-full hover:bg-[var(--hl)] transition"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4 text-muted" />
        </button>
        <span className="label">
          {isToday
            ? "today · bugün"
            : new Date(`${day}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
        <button
          onClick={() => setDay(shiftDay(day, 1))}
          disabled={isToday}
          className="grid place-items-center h-7 w-7 rounded-full hover:bg-[var(--hl)] transition disabled:opacity-30"
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4 text-muted" />
        </button>
      </div>

      <p className="text-[15px] text-ink font-medium leading-snug">{q.en}</p>
      <p className="text-[12.5px] text-muted italic mt-1">{q.tr}</p>

      <div className="mt-4">
        {!mine && (
          <form onSubmit={submit} className="space-y-2.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                isToday
                  ? "Your answer — they can't see it until they answer too…"
                  : "You never answered this one — it's not too late…"
              }
              rows={3}
              maxLength={4000}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
            />
            <button
              disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
            >
              <SendHorizontal className="h-3.5 w-3.5" /> Answer blind
            </button>
          </form>
        )}

        {mine && !theirs && (
          <div className="rounded-2xl bg-[var(--paper-2)] border border-[var(--rule-soft)] p-3.5">
            <p className="text-[13px] text-ink-soft whitespace-pre-wrap">{mine.answer}</p>
            <p className="text-[11.5px] text-muted mt-2 inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              {partnerHasAnswered
                ? "revealing…"
                : `waiting for ${partner.display_name} — answers reveal together`}
            </p>
          </div>
        )}

        {revealed && (
          <div className="space-y-2.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent">
              <Sparkles className="h-3 w-3" /> revealed together
            </span>
            {[{ row: mine!, who: me }, { row: theirs!, who: partner }].map(({ row, who }) => (
              <div
                key={row.id}
                className="rounded-2xl bg-[var(--paper-2)] border border-[var(--rule-soft)] p-3.5"
              >
                <p className="label mb-1">{who.display_name}</p>
                <p className="text-[13px] text-ink-soft whitespace-pre-wrap">{row.answer}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
