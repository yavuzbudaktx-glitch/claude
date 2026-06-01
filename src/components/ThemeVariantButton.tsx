"use client";

import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { applyTheme, getTheme, THEMES, type ThemeId } from "@/lib/theme";

const SWATCHES: Record<ThemeId, string[]> = {
  aurora:     ["#0284c7", "#22d3ee", "#d97706"],
  paper:      ["#f7f3e9", "#1a1814", "#a16207"],
  terminal:   ["#000000", "#22ff77", "#ffb454"],
  galaxy:     ["#0b0628", "#c084fc", "#22d3ee"],
  cowboy:     ["#ecdcc0", "#a85535", "#5d2f12"],
  accounting: ["#f8fafb", "#1e3a5f", "#15803d"],
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
        <div className="absolute right-0 top-[calc(100%+8px)] z-[70] w-[270px] rounded-2xl border border-[var(--glass-border)] bg-[var(--paper-2)] backdrop-blur-xl shadow-[var(--shadow-hover)] p-2.5 animate-fadeIn origin-top-right">
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
