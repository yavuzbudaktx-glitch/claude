"use client";

import { useMemo, useState } from "react";
import { Sparkles, ChevronDown, Check } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";
import { localDateKey } from "@/lib/local-date";

// A one-line-a-day journal under the masthead. Each day's note is keyed by
// local date; over a year it becomes a scrollable timeline of your life.
// Synced via prefs.
export function DailyReflection() {
  const [log, setLog] = usePref<Record<string, string>>("hub.reflections", {});
  const today = localDateKey();
  const [draft, setDraft] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const value = draft ?? log[today] ?? "";
  const hasToday = (log[today] ?? "").trim().length > 0;

  const history = useMemo(
    () => Object.entries(log)
      .filter(([d, v]) => d !== today && v.trim())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30),
    [log, today],
  );

  function save() {
    const v = (draft ?? "").trim();
    if (draft == null) return;
    setLog({ ...log, [today]: v });
    setDraft(null);
    if (v) { setJustSaved(true); setTimeout(() => setJustSaved(false), 1500); }
  }

  function fmtDay(key: string) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div className="relative max-w-xl">
      <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--glass-border)] bg-[var(--paper)] px-3.5 py-2 backdrop-blur-md shadow-[var(--shadow-card)]">
        <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--grad-via)" }} />
        <input
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="What mattered today?"
          maxLength={140}
          className="flex-1 min-w-0 bg-transparent text-[13.5px] text-ink focus:outline-none placeholder:text-muted-2"
        />
        {justSaved && <Check className="h-3.5 w-3.5 text-up shrink-0 animate-fadeIn" />}
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-muted-2 hover:text-accent transition shrink-0"
            title="Past reflections"
            aria-label="Past reflections"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {showHistory && history.length > 0 && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--paper-2)] backdrop-blur-xl shadow-[var(--shadow-hover)] p-2 animate-fadeIn">
          <div className="label px-2 py-1.5">Your timeline</div>
          <ul className="max-h-[260px] overflow-y-auto divide-rule">
            {history.map(([d, v]) => (
              <li key={d} className="flex gap-3 px-2 py-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-2 pt-0.5 w-12 shrink-0">{fmtDay(d)}</span>
                <span className="text-[12.5px] text-ink-soft leading-snug">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasToday && !showHistory && (
        <span className="sr-only">Saved for today.</span>
      )}
    </div>
  );
}
