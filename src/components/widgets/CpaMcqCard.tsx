"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { Check, X, GraduationCap, RotateCcw } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";
import { localDateKey } from "@/lib/local-date";
import { CPA_QUESTIONS } from "@/lib/cpa-questions";

// One CPA-exam MCQ a day, deterministic by local date, with an answer streak
// that counts consecutive days you got it right. Answers persist (synced) so
// it stays answered across reloads and devices.

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

interface McqState {
  date: string;       // day this record is for
  picked: number;     // chosen index (-1 = unanswered)
  streak: number;     // consecutive correct days
  lastCorrectDate: string;
}

const SECTION_TONE: Record<string, string> = {
  FAR: "var(--grad-from)", AUD: "var(--grad-via)", REG: "var(--accent)",
  BAR: "#d97706", ISC: "#a855f7", TCP: "var(--up)",
};

export function CpaMcqCard() {
  const today = localDateKey();
  const [state, setState] = usePref<McqState>("hub.cpaMcq", {
    date: "", picked: -1, streak: 0, lastCorrectDate: "",
  });

  const q = useMemo(() => CPA_QUESTIONS[seedIdx(`${today}-cpa-mcq`, CPA_QUESTIONS.length)], [today]);

  const answeredToday = state.date === today && state.picked >= 0;
  const picked = answeredToday ? state.picked : -1;
  const correct = picked === q.answer;

  function choose(i: number) {
    if (answeredToday) return;
    const gotIt = i === q.answer;
    // Streak continues if yesterday was correct; resets otherwise.
    const [y, m, d] = today.split("-").map(Number);
    const yesterday = new Date(y, m - 1, d - 1);
    const yKey = localDateKey(yesterday);
    const continued = state.lastCorrectDate === yKey || state.lastCorrectDate === today;
    const streak = gotIt ? (continued ? state.streak + 1 : 1) : 0;
    setState({
      date: today,
      picked: i,
      streak,
      lastCorrectDate: gotIt ? today : state.lastCorrectDate,
    });
  }

  const tone = SECTION_TONE[q.section] ?? "var(--accent)";

  return (
    <Card
      id="cpa-mcq-card"
      title="Question of the day"
      collapsible={false}
      action={
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          <GraduationCap className="h-3.5 w-3.5 text-accent" />
          {state.streak > 0 ? <span className="font-semibold text-accent tabular-nums">{state.streak}🔥</span> : "CPA"}
        </span>
      }
    >
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
          style={{ background: tone }}
        >
          {q.section}
        </span>
        <span className="label !text-[9px]">multiple choice</span>
      </div>

      <p className="text-[14px] text-ink font-medium leading-snug mb-3">{q.q}</p>

      <div className="space-y-1.5">
        {q.choices.map((c, i) => {
          const isPicked = picked === i;
          const isAnswer = i === q.answer;
          const showState = answeredToday && (isPicked || isAnswer);
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={answeredToday}
              className={`w-full text-left flex items-start gap-2.5 rounded-xl border px-3 py-2 text-[13px] transition ${
                showState && isAnswer
                  ? "border-[var(--up)] bg-[color-mix(in_srgb,var(--up)_12%,transparent)]"
                  : showState && isPicked && !isAnswer
                    ? "border-[var(--down)] bg-[color-mix(in_srgb,var(--down)_12%,transparent)]"
                    : "border-[var(--rule-soft)] hover:border-[var(--accent)] disabled:hover:border-[var(--rule-soft)]"
              } disabled:cursor-default`}
            >
              <span className="font-mono text-[11px] text-muted-2 mt-0.5 shrink-0">{"ABCD"[i]}</span>
              <span className="flex-1 text-ink-soft">{c}</span>
              {showState && isAnswer && <Check className="h-4 w-4 text-up shrink-0 mt-0.5" />}
              {showState && isPicked && !isAnswer && <X className="h-4 w-4 text-down shrink-0 mt-0.5" />}
            </button>
          );
        })}
      </div>

      {answeredToday && (
        <div className="mt-3 rounded-xl bg-[var(--paper-2)] border border-[var(--rule-soft)] p-3">
          <p className={`text-[12px] font-semibold mb-1 ${correct ? "text-up" : "text-down"}`}>
            {correct ? "Correct ✓" : "Not quite"}
          </p>
          <p className="text-[12.5px] text-ink-soft leading-snug">{q.why}</p>
          <p className="text-[11px] text-muted-2 mt-2">Next question at midnight · come back tomorrow to keep the streak</p>
        </div>
      )}

      {!answeredToday && (
        <p className="mt-3 text-[11px] text-muted-2 inline-flex items-center gap-1.5">
          <RotateCcw className="h-3 w-3" /> New question every day
        </p>
      )}
    </Card>
  );
}
