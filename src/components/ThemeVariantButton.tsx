"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Palette, X, Check } from "lucide-react";
import { applyTheme, getTheme, THEMES, type ThemeId } from "@/lib/theme";

export function ThemeVariantButton() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("aurora");
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setTheme(getTheme()); }, []);

  function choose(id: ThemeId) {
    applyTheme(id);
    setTheme(id);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Theme variant"
        title="Theme variant"
        className="btn-ghost"
      >
        <Palette className="h-4 w-4" />
      </button>

      {open && typeof window !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[58] bg-black/20 backdrop-blur-sm animate-fadeIn" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed top-[72px] right-5 md:right-10 z-[60] w-[min(360px,calc(100vw-2.5rem))] card !p-4 animate-fadeIn">
            <div className="flex items-center justify-between mb-3">
              <span className="label flex items-center gap-1.5">
                <Palette className="h-3 w-3" /> Theme
              </span>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted-2 hover:text-ink transition">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="space-y-1.5">
              {THEMES.map((t) => {
                const on = theme === t.id;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => choose(t.id)}
                      className={`group w-full text-left rounded-xl border p-2.5 transition ${
                        on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule)] hover:border-[var(--rule)] hover:bg-[var(--rule-soft)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {/* color swatch trio */}
                        <span className="inline-flex items-center gap-0.5">
                          {t.id === "aurora" && (
                            <>
                              <span className="h-3 w-3 rounded-full" style={{ background: "#0284c7" }} />
                              <span className="h-3 w-3 rounded-full" style={{ background: "#22d3ee" }} />
                              <span className="h-3 w-3 rounded-full" style={{ background: "#d97706" }} />
                            </>
                          )}
                          {t.id === "paper" && (
                            <>
                              <span className="h-3 w-3 rounded-full border border-[#d6d3c5]" style={{ background: "#f7f3e9" }} />
                              <span className="h-3 w-3 rounded-full" style={{ background: "#1a1814" }} />
                              <span className="h-3 w-3 rounded-full" style={{ background: "#a16207" }} />
                            </>
                          )}
                          {t.id === "terminal" && (
                            <>
                              <span className="h-3 w-3 rounded-sm" style={{ background: "#000" }} />
                              <span className="h-3 w-3 rounded-sm" style={{ background: "#22ff77" }} />
                              <span className="h-3 w-3 rounded-sm" style={{ background: "#ffb454" }} />
                            </>
                          )}
                        </span>
                        <span className="text-[13px] font-semibold text-ink">{t.label}</span>
                        {on && <Check className="ml-auto h-3.5 w-3.5 text-accent" />}
                      </div>
                      <p className="text-[11.5px] text-muted leading-snug">{t.description}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
