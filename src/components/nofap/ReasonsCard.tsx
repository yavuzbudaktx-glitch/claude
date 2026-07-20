"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { usePref, usePrefsLoaded } from "@/components/PrefsProvider";

const MAX_REASONS = 20;
const MAX_LEN = 140;

// The user's own ammunition — shown again inside panic mode when it matters.
export function ReasonsCard() {
  const loaded = usePrefsLoaded();
  const [reasons, setReasons] = usePref<string[]>("nofap.reasons", []);
  const [draft, setDraft] = useState("");

  const add = () => {
    const t = draft.trim().slice(0, MAX_LEN);
    if (!t) return;
    setReasons((prev) => {
      if (prev.includes(t) || prev.length >= MAX_REASONS) return prev;
      return [...prev, t];
    });
    setDraft("");
  };

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted">
        Write down why you&apos;re doing this. These get thrown in your face mid-urge — make them hurt.
      </p>

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="e.g. I want my focus and self-respect back"
          maxLength={MAX_LEN}
          disabled={!loaded}
          className="flex-1 min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--paper)] px-3 py-2 text-[13px] text-ink placeholder:text-muted-2 outline-none focus:border-[var(--accent)] transition"
        />
        <button onClick={add} className="btn-ghost !px-2.5" title="Add reason" aria-label="Add reason" disabled={!loaded}>
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {reasons.length === 0 ? (
        <p className="text-[12px] text-muted-2 italic">
          Empty. A man fighting for nothing loses to everything.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {reasons.map((r, i) => (
            <li
              key={`${i}-${r}`}
              className="group flex items-start justify-between gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--paper)] px-3 py-2"
            >
              <span className="text-[13px] text-ink-soft leading-snug">{r}</span>
              <button
                onClick={() => setReasons((prev) => prev.filter((_, j) => j !== i))}
                className="text-muted-2 hover:text-down transition shrink-0 mt-0.5"
                title="Remove"
                aria-label={`Remove reason: ${r}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
