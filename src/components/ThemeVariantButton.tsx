"use client";

import { useEffect, useRef, useState } from "react";
import { Palette, Check, Sparkles, SwatchBook } from "lucide-react";
import { applyTheme, applyThemeDom, getTheme, THEMES, type ThemeId } from "@/lib/theme";

const SWATCHES: Record<ThemeId, string[]> = {
  aurora:     ["#0284c7", "#22d3ee", "#d97706"],
  galaxy:     ["#0b0628", "#c084fc", "#22d3ee"],
  forest:     ["#0e1a12", "#4ade80", "#a3c585"],
  water:      ["#04212e", "#34d3e0", "#7fe7d9"],
  rain:       ["#0a0f16", "#6db3e6", "#cfe4f5"],
  sunset:     ["#3a0e22", "#ff7a59", "#ffd17a"],
  mosaic:     ["#f5f5ef", "#1b4f9c", "#14837e"],
  stainedglass: ["#0a0a18", "#ff4f6a", "#5b9cff"],
  deco:       ["#0c2a23", "#d4af37", "#0b6e54"],
  cyberpunk:  ["#0a0014", "#ff2a6d", "#22d3ee"],
  renaissance:["#cbb287", "#8f2f1c", "#b0862c"],
  marble:     ["#f6f3ee", "#1a1814", "#c9a24a"],
  subway:     ["#f6f3eb", "#0d3b66", "#c9a24a"],
  terminal:   ["#000000", "#22ff77", "#ffb454"],
  accounting: ["#f6f2e2", "#176b3c", "#b3261e"],
  mono:       ["#ffffff", "#000000", "#737373"],
  newspaper:  ["#f7f3e8", "#111111", "#9a1010"],
  blueprint:  ["#0e3a64", "#ffffff", "#7fc6ff"],
  comic:      ["#fff8e6", "#ff2d2d", "#111111"],
};

export function ThemeVariantButton() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"concept" | "theme">("concept");
  // Lazy initial value reads the saved theme synchronously on first client
  // render — so a mouse-leave from a hover preview restores the SAVED theme.
  const [theme, setTheme] = useState<ThemeId>(() => (typeof window === "undefined" ? "aurora" : getTheme()));
  const wrapRef = useRef<HTMLDivElement>(null);

  // Open the picker into whichever section the saved theme belongs to.
  useEffect(() => {
    if (!open) return;
    const t = THEMES.find((x) => x.id === theme);
    if (t) setSection(t.kind);
  }, [open, theme]);

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

  const concepts = THEMES.filter((t) => t.kind === "concept");
  const palettes = THEMES.filter((t) => t.kind === "theme");

  // Name + swatches only — the long descriptions were noise once you know the
  // themes, so the picker is now a compact two-up grid you can scan at once.
  const renderEntry = (t: (typeof THEMES)[number]) => {
    const on = theme === t.id;
    return (
      <li key={t.id}>
        <button
          onClick={() => choose(t.id)}
          onMouseEnter={() => applyThemeDom(t.id)}      /* live preview only — never writes localStorage */
          onMouseLeave={() => applyThemeDom(theme)}     /* restore the saved theme */
          className={`group w-full text-left rounded-xl border px-2 py-2 transition ${
            on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent hover:bg-[var(--rule-soft)]"
          }`}
          title={t.label}
        >
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5 shrink-0">
              {SWATCHES[t.id].map((c, i) => (
                <span key={i} className="h-3 w-3 rounded-full border border-[var(--rule)]" style={{ background: c }} />
              ))}
            </span>
            <span className="text-[12.5px] font-medium text-ink truncate">{t.label}</span>
            {on && <Check className="ml-auto h-3.5 w-3.5 text-accent shrink-0" />}
          </span>
        </button>
      </li>
    );
  };

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
        <div className="fixed inset-x-2 top-[64px] md:absolute md:right-0 md:top-[calc(100%+8px)] z-[70] w-[300px] max-w-[calc(100vw-1rem)] max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--glass-border)] bg-[var(--paper-2)] backdrop-blur-xl shadow-[var(--shadow-hover)] p-2.5 animate-fadeIn origin-top-right">
          {/* Section toggle — two real buttons, not stacked sections. */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--rule-soft)] mb-2">
            <button
              onClick={() => setSection("concept")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition ${
                section === "concept"
                  ? "bg-[var(--paper)] text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <Sparkles className="h-3 w-3" /> Concepts
              <span className="text-[10px] text-muted-2 ml-0.5">{concepts.length}</span>
            </button>
            <button
              onClick={() => setSection("theme")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition ${
                section === "theme"
                  ? "bg-[var(--paper)] text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <SwatchBook className="h-3 w-3" /> Themes
              <span className="text-[10px] text-muted-2 ml-0.5">{palettes.length}</span>
            </button>
          </div>

          <ul className="grid grid-cols-2 gap-0.5">
            {(section === "concept" ? concepts : palettes).map(renderEntry)}
          </ul>

          <p className="px-1.5 pt-2 text-[10px] text-muted-2">Hover to preview · click to keep</p>
        </div>
      )}
    </div>
  );
}
