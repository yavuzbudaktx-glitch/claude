"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, SendHorizontal, Sparkles, Hand, Flame } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import {
  ZUYA_QUESTIONS,
  ZUYA_SPICY_QUESTIONS,
  ZUYA_SPICY_OFFSET,
  getZuyaQuestion,
} from "@/lib/zuya/questions";
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
  const [poked, setPoked] = useState(false);

  const partnerReal = !!partner.user_id && partner.user_id !== "pending-partner";

  async function poke() {
    if (poked || !partnerReal) return;
    setPoked(true);
    void supabase
      .from("zuya_notifications")
      .insert({
        user_id: partner.user_id,
        kind: "question_nudge",
        payload: { name: me.display_name },
      })
      .then(() => {}, () => {});
    fetch("/api/zuya/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "question", text: "Günün sorusunu bekliyorum 👀" }),
    }).catch(() => {});
  }

  // Local spicy state is only used as a fallback when the shared meta table
  // isn't available. The SHARED spicy choice lives in `meta`.
  const [spicyLocal, setSpicyLocal] = useState(false);
  const [meta, setMeta] = useState<{ spicy: boolean; locked: boolean } | null>(null);
  useEffect(() => { setSpicyLocal(false); setMeta(null); }, [day]);

  const questionIdx = useMemo(
    () => zuyaSeedIdx(`${day}-zuya-question`, ZUYA_QUESTIONS.length),
    [day],
  );
  const spicyIdx = useMemo(
    () => zuyaSeedIdx(`${day}-zuya-spicy`, ZUYA_SPICY_QUESTIONS.length),
    [day],
  );
  // Effective spice = the shared meta value if we have one, else local.
  const spicy = meta ? meta.spicy : spicyLocal;
  const chosenIdx = spicy ? ZUYA_SPICY_OFFSET + spicyIdx : questionIdx;

  const mine = answers.find((a) => a.user_id === me.user_id && a.day === day);
  const theirs = answers.find((a) => a.user_id === partner.user_id && a.day === day);
  // Question for a past day: prefer the recorded index (list may grow).
  const q = getZuyaQuestion(mine?.question_idx ?? theirs?.question_idx ?? chosenIdx);

  // The spice toggle is only allowed while NEITHER partner has locked the
  // day. Locked = the shared meta says so (set when the first person answers),
  // or I've already answered. This is the "only spice it when the other
  // person also hasn't answered" rule the user asked for.
  const spiceLocked = !!meta?.locked || !!mine;

  const loadMeta = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("zuya_daily_meta")
        .select("spicy, locked")
        .eq("day", day)
        .maybeSingle();
      if (!error && data) setMeta({ spicy: !!data.spicy, locked: !!data.locked });
    } catch { /* table not migrated yet — fall back to local spicy */ }
  }, [supabase, day]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("zuya_daily_answers")
      .select("*")
      .eq("day", day);
    setAnswers((data as ZuyaDailyAnswerRow[]) ?? []);
    const rows = (data as ZuyaDailyAnswerRow[]) ?? [];
    setPartnerHasAnswered(rows.some((r) => r.user_id === partner.user_id));
  }, [supabase, day, partner.user_id]);

  useEffect(() => {
    void load();
    void loadMeta();
  }, [load, loadMeta]);

  useZuyaTableEvent("zuya_daily_answers", () => void load());
  useZuyaTableEvent("zuya_daily_meta", () => void loadMeta());

  // Toggle the SHARED spice choice. Writes the meta row so the partner's
  // client converges on the same question. Falls back to local-only when the
  // table isn't there.
  async function toggleSpice() {
    if (spiceLocked) return;
    const next = !spicy;
    setSpicyLocal(next);
    setMeta((m) => (m ? { ...m, spicy: next } : { spicy: next, locked: false }));
    try {
      await supabase.from("zuya_daily_meta").upsert(
        { day, spicy: next, question_idx: next ? ZUYA_SPICY_OFFSET + spicyIdx : questionIdx, set_by: me.user_id, updated_at: new Date().toISOString() },
        { onConflict: "day" },
      );
    } catch { /* local fallback already applied */ }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      // Lock the day's question FIRST (so the partner is pinned to the same
      // spicy/normal question), then record the answer against that same idx.
      const lockedIdx = meta ? chosenIdx : (mine?.question_idx ?? theirs?.question_idx ?? chosenIdx);
      try {
        await supabase.from("zuya_daily_meta").upsert(
          { day, spicy, question_idx: lockedIdx, locked: true, set_by: me.user_id, updated_at: new Date().toISOString() },
          { onConflict: "day" },
        );
      } catch { /* meta table optional */ }
      const { error } = await supabase.from("zuya_daily_answers").insert({
        user_id: me.user_id,
        day,
        question_idx: lockedIdx,
        answer: text,
      });
      if (!error) {
        setDraft("");
        void load();
        void loadMeta();
      }
    } finally {
      setBusy(false);
    }
  }

  const revealed = !!mine && !!theirs;
  const isToday = day === today;

  return (
    <Card id="zuya-question-card" title="Question of the day" collapsible={false}>
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

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] text-ink font-medium leading-snug">{q.en}</p>
          <p className="text-[12.5px] text-muted italic mt-1">{q.tr}</p>
        </div>
        {isToday && partnerReal && !theirs && (
          <button
            onClick={() => void poke()}
            disabled={poked}
            title={`${partner.display_name}'ı dürt — cevap versin`}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition ${
              poked
                ? "border-[var(--rule)] text-muted"
                : "border-[var(--accent)] text-accent hover:bg-[var(--accent-soft)]"
            }`}
          >
            <Hand className="h-3.5 w-3.5" /> {poked ? "Dürtüldü" : "Dürt"}
          </button>
        )}
      </div>

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
            <div className="flex items-center gap-2">
              <button
                disabled={busy || !draft.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
              >
                <SendHorizontal className="h-3.5 w-3.5" /> Answer blind
              </button>
              <button
                type="button"
                onClick={() => void toggleSpice()}
                disabled={spiceLocked}
                title={
                  spiceLocked
                    ? "Locked in — one of you already answered"
                    : spicy ? "Back to the normal question" : "Make it spicy (for both of you)"
                }
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-[13px] font-semibold border transition disabled:opacity-40 ${
                  spicy
                    ? "border-transparent text-white"
                    : "border-[var(--rule)] text-muted hover:text-accent hover:border-[var(--accent)]"
                }`}
                style={spicy ? { background: "linear-gradient(135deg, #c2452d, #d64570)" } : undefined}
              >
                <Flame className="h-3.5 w-3.5" /> {spicy ? "Spicy" : "Spice it"}
              </button>
            </div>
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
