"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StickyNote, X } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";
import { useCommand } from "@/lib/commands";

// Persistent sticky note. The button lives in the action row; when opened
// the panel is rendered through a portal as a fixed top-right overlay, so
// it never affects the layout of the buttons around it (no shifting, no
// breakage on narrow widths).
export function Scratchpad() {
  const [note, setNote] = usePref<string>("scratchpad", "");
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useCommand((c) => { if (c.kind === "scratchpad") setOpen(true); });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasNote = (note ?? "").trim().length > 0;
  const chars = (note ?? "").length;

  return (
    <>
      <button
        ref={buttonRef}
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
      {open && typeof window !== "undefined" && createPortal(
        <>
          <div
            className="fixed inset-0 z-[58] bg-black/15 backdrop-blur-[2px] animate-fadeIn"
            aria-hidden
          />
          <div
            ref={panelRef}
            className="fixed top-[72px] right-5 md:right-10 z-[60] w-[min(360px,calc(100vw-2.5rem))] card !p-4 animate-fadeIn origin-top-right"
          >
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
              rows={10}
              placeholder="Jot anything — it stays here and syncs across your devices."
              className="w-full rounded-xl bg-[var(--rule-soft)] px-3 py-2.5 text-[13px] leading-relaxed text-ink resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2"
            />
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
