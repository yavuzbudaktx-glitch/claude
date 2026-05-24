"use client";

import { useEffect, useRef, useState } from "react";
import { StickyNote } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";
import { useCommand } from "@/lib/commands";

// A persistent sticky note in the masthead. The button shows an accent dot
// when the note has content, so you can tell at a glance there's something
// written. Synced across devices via the prefs store.
export function Scratchpad() {
  const [note, setNote] = usePref<string>("scratchpad", "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useCommand((c) => { if (c.kind === "scratchpad") setOpen(true); });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const hasNote = (note ?? "").trim().length > 0;

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Scratchpad"
        title="Scratchpad"
        className={`btn-ghost relative ${hasNote ? "!text-accent !border-[var(--accent)]" : ""}`}
      >
        <StickyNote className="h-4 w-4" />
        {hasNote && (
          <span
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent"
            style={{ boxShadow: "0 0 8px var(--glow)" }}
          />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 card !p-2.5">
          <div className="label mb-1.5">Scratchpad</div>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={7}
            placeholder="Jot anything — it stays here and syncs across your devices."
            className="w-full bg-transparent text-[13px] leading-relaxed text-ink resize-y focus:outline-none placeholder:text-muted-2"
          />
        </div>
      )}
    </span>
  );
}
