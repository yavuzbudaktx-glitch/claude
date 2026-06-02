"use client";

import { useEffect, useRef, useState } from "react";
import { StickyNote, X } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";
import { useCommand } from "@/lib/commands";

// Persistent sticky note. Opens as a quiet little popover anchored next to
// the button — no backdrop, no portal, nothing covers the page. Click
// outside or press Esc to close.
export function Scratchpad() {
  const [note, setNote] = usePref<string>("scratchpad", "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useCommand((c) => { if (c.kind === "scratchpad") setOpen(true); });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasNote = (note ?? "").trim().length > 0;
  const chars = (note ?? "").length;

  return (
    <div ref={wrapRef} className="relative inline-flex">
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
        <div className="fixed right-3 top-[58px] md:absolute md:right-0 md:top-[calc(100%+8px)] z-[70] w-[min(320px,calc(100vw-1.5rem))] rounded-2xl border border-[var(--glass-border)] bg-[var(--paper-2)] backdrop-blur-xl shadow-[var(--shadow-hover)] p-3.5 animate-fadeIn origin-top-right">
          <div className="flex items-center justify-between mb-2">
            <span className="label flex items-center gap-1.5">
              <StickyNote className="h-3 w-3" /> Scratchpad
            </span>
            <div className="flex items-center gap-2">
              {hasNote && <span className="font-mono text-[10px] text-muted-2">{chars} chars</span>}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted-2 hover:text-ink transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={9}
            placeholder="Jot anything — it stays here and syncs across your devices."
            className="w-full rounded-xl bg-[var(--rule-soft)] px-3 py-2.5 text-[13px] leading-relaxed text-ink resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2"
          />
        </div>
      )}
    </div>
  );
}
