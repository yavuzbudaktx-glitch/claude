"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { localDateKey } from "@/lib/local-date";

// ============================================================================
//   Lift log — the "what did I actually lift" half of the Body card.
//
//   This data rides INSIDE the existing `body_profile` jsonb blob (see
//   BodyCard's coerce/mergeBody), so there is no migration to run. The shape
//   is chosen for the merge, not for the UI: every set is its own record with
//   a stable id, a created stamp and a modified stamp, because sets are
//   exactly the thing two devices race on — you log on your phone at the rack
//   while yesterday's tab is still open on the laptop. Per-record ids let the
//   sync UNION the two logs instead of picking a winning array, which is the
//   only rule that cannot silently throw away work you already did.
// ============================================================================

export interface LiftSet {
  id: string;        // stable per set — this is the merge key
  date: string;      // day key the set belongs to (rollover-aware, YYYY-MM-DD)
  ex: string;        // exercise name as typed ("Bench Press")
  weight: number;    // lbs; 0 means bodyweight (pull-ups, dips)
  reps: number;
  at: number;        // created, epoch ms — orders sets inside a day
  mt: number;        // last modified, epoch ms — per-set last-writer-wins
  del?: boolean;     // tombstone — see unionLifts for why we never hard-delete
  plan?: "A" | "B";  // which workout template was active when it was logged
}

export type PlanId = "A" | "B";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME = 40;
const MAX_WEIGHT = 2000;
const MAX_REPS = 500;
const DAY_MS = 86_400_000;
// How long a deleted set keeps its tombstone. Long enough that any device
// that was offline when you deleted has certainly synced by then, short
// enough that the blob doesn't grow tombstones forever.
const TOMBSTONE_DAYS = 60;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* fall through to the manual id */ }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Two spellings of the same lift ("bench press" / "Bench Press") have to land
// in the same history or the personal-best numbers split in half.
export function exKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function sortLifts(list: LiftSet[]): LiftSet[] {
  return [...list].sort(
    (a, b) => a.date.localeCompare(b.date) || a.at - b.at || a.id.localeCompare(b.id),
  );
}

// Defensive load: anything malformed is skipped, never thrown on. A legacy
// blob simply has no `lifts` key, which yields an empty log rather than
// wiping the fields around it.
export function coerceLifts(raw: unknown): LiftSet[] {
  if (!Array.isArray(raw)) return [];
  const cutoff = localDateKey(new Date(Date.now() - TOMBSTONE_DAYS * DAY_MS));
  const byId = new Map<string, LiftSet>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.slice(0, 64) : "";
    const date = typeof o.date === "string" ? o.date : "";
    const ex = typeof o.ex === "string" ? o.ex.trim().slice(0, MAX_NAME) : "";
    if (!id || !DATE_RE.test(date) || !ex) continue;
    const weight = Number(o.weight);
    const reps = Number(o.reps);
    if (!Number.isFinite(weight) || !Number.isFinite(reps)) continue;
    const del = o.del === true;
    // Drop stale tombstones; keep every live set no matter how old.
    if (del && date < cutoff) continue;
    const atRaw = Number(o.at);
    const at = Number.isFinite(atRaw) ? atRaw : 0;
    const mtRaw = Number(o.mt);
    const set: LiftSet = {
      id,
      date,
      ex,
      weight: clamp(Math.round(weight * 10) / 10, 0, MAX_WEIGHT),
      reps: clamp(Math.round(reps), 0, MAX_REPS),
      at,
      mt: Number.isFinite(mtRaw) ? mtRaw : at,
    };
    if (del) set.del = true;
    const planRaw = typeof o.plan === "string" ? o.plan : "";
    if (planRaw === "A" || planRaw === "B") set.plan = planRaw;
    // A duplicate id can only come from a corrupted blob — keep the copy that
    // was modified last instead of dropping the row.
    const prev = byId.get(id);
    if (!prev || set.mt >= prev.mt) byId.set(id, set);
  }
  return sortLifts(Array.from(byId.values()));
}

// THE merge rule for logged sets: UNION BY SET ID.
//
// Two phones both appending sets on the same day is normal (a second tab
// counts as a second device), so "newest blob wins" would silently delete one
// side's sets — the exact failure mode mergeBody already guards weight history
// against. A union can't: a set that exists on either side survives.
//
// When both sides know the same id (you edited a set in two places) we keep
// the copy with the newer `mt`; ties go to LOCAL, matching the card's existing
// rule that the device you just touched is the source of truth for what it
// just changed. Deleting writes a tombstone (`del: true`) instead of removing
// the record, because a removal would simply be re-added by the union the
// next time a device holding a stale copy syncs.
export function unionLifts(remote: LiftSet[], local: LiftSet[]): LiftSet[] {
  const byId = new Map<string, LiftSet>();
  for (const s of remote) byId.set(s.id, s);
  for (const s of local) {
    const prev = byId.get(s.id);
    if (!prev || s.mt >= prev.mt) byId.set(s.id, s);
  }
  return sortLifts(Array.from(byId.values()));
}

// Pull exercise names out of a freeform plan textarea so the plan and the log
// aren't two unrelated features: "Bench 4×8" → "Bench", "- 3x10 Rows" →
// "Rows". Strips bullets, set×rep specs and weight tokens; whatever text is
// left is the name.
export function parsePlanExercises(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const name = line
      .trim()
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/\d+\s*[x×]\s*\d+/gi, " ")            // 4×8, 3 x 10
      .replace(/@?\s*\d+(\.\d+)?\s*(lbs?|kgs?)?/gi, " ") // @225, 225 lbs
      .replace(/\s[x×]\s*$/i, " ")                    // a lone trailing "x"
      .replace(/[·:,;–—-]+\s*$/, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_NAME);
    const k = exKey(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(name);
    if (out.length >= 12) break;
  }
  return out;
}

// Epley estimated 1RM. Used only to RANK sets against each other, so the
// exact formula matters less than the fact that it rewards both more weight
// and more reps — 185×5 counts as a better top set than 190×1.
function score(s: LiftSet): number {
  return s.weight * (1 + Math.max(0, s.reps) / 30);
}

function topOf(sets: LiftSet[]): LiftSet | null {
  let best: LiftSet | null = null;
  for (const s of sets) {
    if (!best) { best = s; continue; }
    const d = score(s) - score(best);
    if (d > 0 || (d === 0 && s.reps > best.reps)) best = s;
  }
  return best;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtSet(s: LiftSet): string {
  return `${s.weight === 0 ? "BW" : fmtNum(s.weight)} × ${s.reps}`;
}

function fmtDay(key: string, withWeekday = false): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString(
    undefined,
    withWeekday ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric" },
  );
}

interface ExGroup { key: string; name: string; sets: LiftSet[] }

// Sets of one day, bucketed per exercise in the order they were first logged.
function groupByExercise(sets: LiftSet[]): ExGroup[] {
  const m = new Map<string, ExGroup>();
  for (const s of sets) {
    const k = exKey(s.ex);
    const g = m.get(k);
    if (g) g.sets.push(s);
    else m.set(k, { key: k, name: s.ex, sets: [s] });
  }
  return Array.from(m.values());
}

function volumeOf(sets: LiftSet[]): number {
  return sets.reduce((a, s) => a + s.weight * s.reps, 0);
}

function planOf(sets: LiftSet[]): PlanId | null {
  for (const s of sets) if (s.plan) return s.plan;
  return null;
}

function deltaOf(dayTop: LiftSet, prevTop: LiftSet): { text: string; up: boolean } {
  const dw = Math.round((dayTop.weight - prevTop.weight) * 10) / 10;
  if (Math.abs(dw) >= 0.1) {
    return { text: `${dw > 0 ? "+" : "−"}${fmtNum(Math.abs(dw))} lbs`, up: dw > 0 };
  }
  const dr = dayTop.reps - prevTop.reps;
  if (dr !== 0) {
    return { text: `${dr > 0 ? "+" : "−"}${Math.abs(dr)} rep${Math.abs(dr) === 1 ? "" : "s"}`, up: dr > 0 };
  }
  return { text: "matched", up: false };
}

const HISTORY_PEEK = 3;

const numInput =
  "min-h-[36px] w-full rounded-lg bg-[var(--rule-soft)] px-1.5 text-center text-[13px] tabular-nums text-ink " +
  "border border-transparent placeholder:text-muted-2 placeholder:text-[10.5px] " +
  "focus:outline-none focus:bg-[var(--paper)] focus:border-[var(--accent)] transition";

const editInput =
  "h-7 w-11 rounded-md bg-[var(--rule-soft)] px-1 text-center text-[12px] tabular-nums text-ink " +
  "focus:outline-none focus:bg-[var(--paper)] focus:ring-1 focus:ring-[var(--accent)]";

export function LiftTracker({
  lifts,
  onLifts,
  plan,
  planExercises,
  today,
}: {
  lifts: LiftSet[];
  /** Functional update so two quick taps in a row can't drop a set. */
  onLifts: (update: (cur: LiftSet[]) => LiftSet[]) => void;
  plan: PlanId;
  planExercises: string[];
  /** Rollover-aware day key — the same "today" the nutrition counters use. */
  today: string;
}) {
  const listId = useId();
  const weightRef = useRef<HTMLInputElement>(null);
  const [exDraft, setExDraft] = useState("");
  const [wDraft, setWDraft] = useState("");
  const [repsDraft, setRepsDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editW, setEditW] = useState("");
  const [editR, setEditR] = useState("");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showAllDays, setShowAllDays] = useState(false);

  // Tombstoned sets stay in the blob for the sync but never in the UI.
  const live = useMemo(() => sortLifts(lifts.filter((s) => !s.del)), [lifts]);

  // exercise key → that exercise's sets, oldest first (sortLifts order).
  const byEx = useMemo(() => {
    const m = new Map<string, LiftSet[]>();
    for (const s of live) {
      const k = exKey(s.ex);
      const arr = m.get(k);
      if (arr) arr.push(s);
      else m.set(k, [s]);
    }
    return m;
  }, [live]);

  // Days that have sets, newest first.
  const days = useMemo(() => {
    const m = new Map<string, LiftSet[]>();
    for (const s of live) {
      const arr = m.get(s.date);
      if (arr) arr.push(s);
      else m.set(s.date, [s]);
    }
    return Array.from(m.entries())
      .map(([date, sets]) => ({ date, sets }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [live]);

  const todaySets = useMemo(() => live.filter((s) => s.date === today), [live, today]);
  const todayGroups = useMemo(() => groupByExercise(todaySets), [todaySets]);
  const history = useMemo(() => days.filter((d) => d.date !== today), [days, today]);

  // Every name we've logged, most recently used first — this is what turns
  // "Bench Press" into a chip instead of a retype.
  const loggedNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i];
      const k = exKey(s.ex);
      if (!seen.has(k)) seen.set(k, s.ex);
    }
    return Array.from(seen.values());
  }, [live]);

  // Chip row: today's plan first (that's what you're about to do), then
  // whatever else you've been lifting.
  const suggestions = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const n of [...planExercises, ...loggedNames]) {
      const k = exKey(n);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(n);
      if (out.length >= 10) break;
    }
    return out;
  }, [planExercises, loggedNames]);

  const allNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of [...planExercises, ...loggedNames]) {
      const k = exKey(n);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(n);
    }
    return out.slice(0, 60);
  }, [planExercises, loggedNames]);

  function lastSetFor(name: string): LiftSet | null {
    const arr = byEx.get(exKey(name));
    return arr && arr.length ? arr[arr.length - 1] : null;
  }

  // Everything the "am I lifting more than last time" line needs, for one
  // exercise on one day.
  function progressFor(key: string, day: string) {
    const all = byEx.get(key) ?? [];
    const before = all.filter((s) => s.date < day);
    const prevDate = before.length ? before[before.length - 1].date : null;
    const prevTop = prevDate ? topOf(before.filter((s) => s.date === prevDate)) : null;
    const bestBefore = topOf(before);
    const dayTop = topOf(all.filter((s) => s.date === day));
    const bestEver = topOf(all);
    return {
      prevTop,
      prevDate,
      bestEver,
      dayTop,
      isPr: !!(dayTop && bestBefore && score(dayTop) > score(bestBefore) + 1e-9),
    };
  }

  function logSet(name: string, weight: number, reps: number) {
    const now = Date.now();
    const set: LiftSet = {
      id: newId(),
      date: today,
      ex: name.trim().slice(0, MAX_NAME),
      weight: clamp(Math.round(weight * 10) / 10, 0, MAX_WEIGHT),
      reps: clamp(Math.round(reps), 1, MAX_REPS),
      at: now,
      mt: now,
      plan,
    };
    onLifts((cur) => [...cur, set]);
  }

  const parsedWeight = (() => {
    const raw = wDraft.trim().replace(",", ".");
    if (raw === "") return 0; // blank = bodyweight, not a parse failure
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  })();
  const parsedReps = (() => {
    const n = Number(repsDraft.trim());
    return Number.isFinite(n) && n >= 1 ? Math.round(n) : NaN;
  })();
  const canAdd = exDraft.trim() !== "" && Number.isFinite(parsedWeight) && Number.isFinite(parsedReps);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    logSet(exDraft, parsedWeight, parsedReps);
    // Drafts stay put on purpose: tapping + again logs the next identical set,
    // which is exactly what straight sets look like.
  }

  function pickExercise(name: string) {
    setExDraft(name);
    // Prefill with what you did last time so a repeat session is one tap.
    const last = lastSetFor(name);
    if (last) {
      setWDraft(last.weight === 0 ? "" : fmtNum(last.weight));
      setRepsDraft(String(last.reps));
    }
    const el = weightRef.current;
    if (el) requestAnimationFrame(() => { el.focus(); el.select(); });
  }

  function beginEdit(s: LiftSet) {
    setEditing(s.id);
    setEditW(s.weight === 0 ? "" : fmtNum(s.weight));
    setEditR(String(s.reps));
  }

  function saveEdit(id: string) {
    const rawW = editW.trim().replace(",", ".");
    const w = rawW === "" ? 0 : Number(rawW);
    const r = Number(editR.trim());
    if (!Number.isFinite(w) || w < 0 || !Number.isFinite(r) || r < 1) { setEditing(null); return; }
    const now = Date.now();
    onLifts((cur) =>
      cur.map((s) =>
        s.id === id
          ? {
              ...s,
              weight: clamp(Math.round(w * 10) / 10, 0, MAX_WEIGHT),
              reps: clamp(Math.round(r), 1, MAX_REPS),
              mt: now,
            }
          : s,
      ),
    );
    setEditing(null);
  }

  // Soft delete. See unionLifts: a hard delete gets resurrected by the union
  // as soon as a device with a stale copy syncs.
  function removeSet(id: string) {
    const now = Date.now();
    onLifts((cur) => cur.map((s) => (s.id === id ? { ...s, del: true, mt: now } : s)));
    setEditing(null);
  }

  function renderGroup(g: ExGroup, day: string) {
    const p = progressFor(g.key, day);
    const isToday = day === today;
    const delta = p.dayTop && p.prevTop ? deltaOf(p.dayTop, p.prevTop) : null;
    return (
      <li key={g.key} className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12.5px] font-medium text-ink truncate" title={g.name}>{g.name}</span>
          {p.isPr && (
            <span
              className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.1em] text-white"
              style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
              title="Best set you've logged for this lift"
            >
              PR
            </span>
          )}
          {p.bestEver && (
            <span className="ml-auto shrink-0 metalabel tabular-nums" title="Personal best set">
              PB {fmtSet(p.bestEver)}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {g.sets.map((s) =>
            editing === s.id ? (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--paper)] px-1.5 py-1"
              >
                <input
                  value={editW}
                  onChange={(e) => setEditW(e.target.value)}
                  type="text"
                  inputMode="decimal"
                  placeholder="BW"
                  aria-label="Weight in pounds"
                  className={editInput}
                />
                <span className="text-[11px] text-muted-2">×</span>
                <input
                  value={editR}
                  onChange={(e) => setEditR(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(s.id); }}
                  type="text"
                  inputMode="numeric"
                  placeholder="reps"
                  aria-label="Reps"
                  className={editInput}
                />
                <button
                  type="button"
                  onClick={() => saveEdit(s.id)}
                  aria-label="Save set"
                  className="h-8 w-8 grid place-items-center rounded-md text-accent hover:bg-[var(--accent-soft)] transition"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeSet(s.id)}
                  aria-label="Delete set"
                  className="h-8 w-8 grid place-items-center rounded-md text-muted hover:text-down transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  aria-label="Cancel"
                  className="h-8 w-8 grid place-items-center rounded-md text-muted-2 hover:text-ink transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <button
                key={s.id}
                type="button"
                onClick={() => beginEdit(s)}
                title="Edit or delete this set"
                className={`min-h-[32px] inline-flex items-center rounded-lg border px-2 text-[12px] tabular-nums transition ${
                  p.dayTop && p.dayTop.id === s.id && g.sets.length > 1
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ink"
                    : "border-[var(--rule)] bg-[var(--rule-soft)] text-ink-soft hover:border-[var(--accent)] hover:text-ink"
                }`}
              >
                {fmtSet(s)}
              </button>
            ),
          )}
          {isToday && (
            <button
              type="button"
              onClick={() => {
                const last = g.sets[g.sets.length - 1];
                if (last) logSet(last.ex, last.weight, last.reps);
              }}
              title={`Same again — another ${g.name} set`}
              aria-label={`Log another ${g.name} set`}
              className="btn-ghost !h-8 !w-8 !rounded-lg"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2 min-w-0">
          {p.prevTop && p.prevDate ? (
            <>
              <span className="metalabel truncate">
                last {fmtDay(p.prevDate)} · <span className="tabular-nums">{fmtSet(p.prevTop)}</span>
              </span>
              {delta && (
                <span
                  className={`shrink-0 text-[10.5px] font-semibold tabular-nums ${delta.up ? "text-up" : "text-muted-2"}`}
                >
                  {delta.text}
                </span>
              )}
            </>
          ) : (
            <span className="metalabel">first time logged</span>
          )}
        </div>
      </li>
    );
  }

  const todayVolume = Math.round(volumeOf(todaySets));

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="label shrink-0">Log · today</span>
        <span className="ml-auto shrink-0 metalabel tabular-nums">
          {todaySets.length > 0
            ? `${todaySets.length} set${todaySets.length === 1 ? "" : "s"} · ${todayVolume.toLocaleString()} lbs`
            : "nothing yet"}
        </span>
      </div>

      {/* Quick add. Exercise / weight / reps / + on one line so a set is
          three touches at most, and the drafts survive the submit so extra
          sets of the same thing are a single tap on +. */}
      <form
        onSubmit={submit}
        className="grid grid-cols-[minmax(0,1fr)_54px_48px_36px] sm:grid-cols-[minmax(0,1fr)_72px_62px_38px] gap-1.5"
      >
        <input
          value={exDraft}
          onChange={(e) => setExDraft(e.target.value)}
          list={listId}
          placeholder="Exercise"
          maxLength={MAX_NAME}
          aria-label="Exercise"
          autoComplete="off"
          className="min-h-[36px] w-full rounded-lg bg-[var(--rule-soft)] px-2.5 text-[13px] text-ink border border-transparent placeholder:text-muted-2 focus:outline-none focus:bg-[var(--paper)] focus:border-[var(--accent)] transition"
        />
        <input
          ref={weightRef}
          value={wDraft}
          onChange={(e) => setWDraft(e.target.value)}
          type="text"
          inputMode="decimal"
          placeholder="lbs"
          maxLength={6}
          aria-label="Weight in pounds (blank for bodyweight)"
          className={numInput}
        />
        <input
          value={repsDraft}
          onChange={(e) => setRepsDraft(e.target.value)}
          type="text"
          inputMode="numeric"
          placeholder="reps"
          maxLength={3}
          aria-label="Reps"
          className={numInput}
        />
        <button
          type="submit"
          disabled={!canAdd}
          aria-label="Log set"
          title="Log set"
          className="btn-ghost !h-9 !w-9 !rounded-lg disabled:opacity-35 disabled:pointer-events-none"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
      <datalist id={listId}>
        {allNames.map((n) => <option key={n} value={n} />)}
      </datalist>

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => pickExercise(n)}
              title={`Log ${n}`}
              className={`chip min-h-[32px] inline-flex items-center max-w-[46%] sm:max-w-[170px] truncate !text-[11.5px] ${
                exKey(n) === exKey(exDraft) ? "chip-active" : ""
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {todayGroups.length > 0 ? (
        <ul className="mt-3.5 space-y-3">{todayGroups.map((g) => renderGroup(g, today))}</ul>
      ) : (
        <p className="mt-3 text-[12px] italic text-muted-2 leading-relaxed">
          {suggestions.length > 0
            ? "Tap a lift above, check the weight, hit +. Every extra tap on + logs another set."
            : "Type the lift, the weight and the reps, then hit +. Names you use are remembered as chips."}
        </p>
      )}

      {history.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--rule-soft)]">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="label shrink-0">History</span>
            <span className="h-px flex-1 bg-[var(--rule-soft)]" aria-hidden />
            {history.length > HISTORY_PEEK && (
              <button
                type="button"
                onClick={() => setShowAllDays((v) => !v)}
                className="metalabel shrink-0 hover:text-accent transition"
              >
                {showAllDays ? "recent only" : `all ${history.length} days`}
              </button>
            )}
          </div>
          <ul className="space-y-1 max-h-[280px] overflow-y-auto pr-0.5">
            {(showAllDays ? history : history.slice(0, HISTORY_PEEK)).map((d) => {
              const open = openDay === d.date;
              const groups = groupByExercise(d.sets);
              const tag = planOf(d.sets);
              return (
                <li key={d.date} className="rounded-xl border border-[var(--rule-soft)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenDay(open ? null : d.date)}
                    aria-expanded={open}
                    className="w-full min-h-[36px] flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--rule-soft)] transition"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-muted-2 transition-transform ${open ? "" : "-rotate-90"}`}
                    />
                    <span className="text-[12px] text-ink-soft shrink-0">{fmtDay(d.date, true)}</span>
                    {tag && <span className="metalabel shrink-0">· {tag}</span>}
                    <span className="ml-auto shrink-0 metalabel tabular-nums">
                      {d.sets.length} · {Math.round(volumeOf(d.sets)).toLocaleString()} lbs
                    </span>
                  </button>
                  {open ? (
                    <ul className="px-2.5 pb-3 pt-0.5 space-y-3">
                      {groups.map((g) => renderGroup(g, d.date))}
                    </ul>
                  ) : (
                    <div className="px-2.5 pb-1.5 pl-[30px] text-[11px] text-muted-2 truncate">
                      {groups
                        .map((g) => {
                          const t = topOf(g.sets);
                          return t ? `${g.name} ${fmtSet(t)}` : g.name;
                        })
                        .join("  ·  ")}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
