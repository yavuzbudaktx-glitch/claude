"use client";

import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { applyTheme, getTheme, THEMES, type ThemeId } from "@/lib/theme";

const SWATCHES: Record<ThemeId, string[]> = {
  aurora:     ["#0284c7", "#22d3ee", "#d97706"],
  galaxy:     ["#0b0628", "#c084fc", "#22d3ee"],
  forest:     ["#0e1a12", "#4ade80", "#a3c585"],
  water:      ["#04212e", "#34d3e0", "#7fe7d9"],
  lust:       ["#1a0306", "#e0294a", "#e8b06a"],
  terminal:   ["#000000", "#22ff77", "#ffb454"],
  accounting: ["#f8fafb", "#1e3a5f", "#15803d"],
  nord:       ["#2e3440", "#88c0d0", "#a3be8c"],
  mono:       ["#ffffff", "#000000", "#737373"],
  newspaper:  ["#f7f3e8", "#111111", "#9a1010"],
  blueprint:  ["#0e3a64", "#ffffff", "#7fc6ff"],
  comic:      ["#fff8e6", "#ff2d2d", "#111111"],
  sketch:     ["#fbfaf3", "#2b2b2b", "#b58a3a"],
};

export function ThemeVariantButton() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("aurora");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTheme(getTheme()); }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(id: ThemeId) {
    applyTheme(id);
    setTheme(id);
    setOpen(false);
  }

  return (
    <div className="relative inline-flex" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Theme"
        title="Theme"
        className={`btn-ghost ${open ? "!text-accent !border-[var(--accent)]" : ""}`}
      >
        <Palette className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-x-2 top-[64px] md:absolute md:right-0 md:top-[calc(100%+8px)] z-[70] w-[280px] max-w-[calc(100vw-1rem)] max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--glass-border)] bg-[var(--paper-2)] backdrop-blur-xl shadow-[var(--shadow-hover)] p-2.5 animate-fadeIn origin-top-right">
          <div className="label px-1.5 pb-2 flex items-center gap-1.5">
            <Palette className="h-3 w-3" /> Theme
          </div>
          <ul className="space-y-1">
            {THEMES.map((t) => {
              const on = theme === t.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => choose(t.id)}
                    onMouseEnter={() => applyTheme(t.id)}        /* live preview on hover */
                    onMouseLeave={() => applyTheme(theme)}        /* restore on leave */
                    className={`group w-full text-left rounded-xl border p-2.5 transition ${
                      on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent hover:bg-[var(--rule-soft)]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-0.5">
                        {SWATCHES[t.id].map((c, i) => (
                          <span key={i} className="h-3.5 w-3.5 rounded-full border border-[var(--rule)]" style={{ background: c }} />
                        ))}
                      </span>
                      <span className="text-[13px] font-semibold text-ink">{t.label}</span>
                      {on && <Check className="ml-auto h-3.5 w-3.5 text-accent" />}
                    </div>
                    <p className="text-[11px] text-muted leading-snug mt-1">{t.description}</p>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-1.5 pt-1.5 text-[10px] text-muted-2">Hover to preview · click to keep</p>
        </div>
      )}
    </div>
  );
}
