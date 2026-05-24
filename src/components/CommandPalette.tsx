"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft } from "lucide-react";
import { emitCommand, scrollToSection } from "@/lib/commands";
import { useCity, searchCities, type GeoResult } from "@/lib/use-city";
import { createClient } from "@/lib/supabase/client";

// Client created lazily inside the handler so the palette (mounted in the
// root layout) never instantiates Supabase during SSR/prerender.

type Mode = "root" | "city" | "ticker" | "task";

interface Action {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

function setTheme(next: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  try { localStorage.setItem("theme", next); } catch {}
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("root");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setCity } = useCity();

  // City search state
  const [cityResults, setCityResults] = useState<GeoResult[]>([]);

  const close = useCallback(() => {
    setOpen(false);
    setMode("root");
    setQuery("");
    setCityResults([]);
    setSel(0);
  }, []);

  // ⌘K / Ctrl+K toggles; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setMode("root");
        setQuery("");
        setSel(0);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open, mode]);

  // The masthead command button opens the palette via this event.
  useEffect(() => {
    const openEvt = () => { setOpen(true); setMode("root"); setQuery(""); setSel(0); };
    window.addEventListener("morning:open-palette", openEvt);
    return () => window.removeEventListener("morning:open-palette", openEvt);
  }, []);

  // Debounced city geocoding.
  useEffect(() => {
    if (mode !== "city") return;
    if (query.trim().length < 2) { setCityResults([]); return; }
    const h = setTimeout(async () => setCityResults(await searchCities(query)), 250);
    return () => clearTimeout(h);
  }, [query, mode]);

  const NEWS = useMemo(
    () => [
      ["World", "world"], ["Türkiye", "turkey"], ["Dallas", "dallas"],
      ["Tech & AI", "tech"], ["Finance", "finance"],
    ] as const,
    [],
  );
  const SECTIONS = useMemo(
    () => [
      ["Calendar / Inbox", "sec-calendar"], ["News", "sec-news"],
      ["Prayer & Hadith", "sec-prayer"], ["Tasks", "sec-tasks"],
      ["Watchlist", "sec-watchlist"], ["Süper Lig", "sec-superlig"],
      ["UFC", "sec-ufc"], ["Body", "sec-body"],
    ] as const,
    [],
  );

  const actions = useMemo<Action[]>(() => {
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    const list: Action[] = [
      { id: "theme", label: `Switch to ${isDark ? "light" : "dark"} mode`, hint: "Theme", run: () => { setTheme(isDark ? "light" : "dark"); close(); } },
      { id: "focus", label: "Start focus mode", hint: "Focus", run: () => { emitCommand({ kind: "focus" }); close(); } },
      { id: "scratch", label: "Open scratchpad", hint: "Note", run: () => { emitCommand({ kind: "scratchpad" }); close(); } },
      { id: "city", label: "Change city…", hint: "Location", run: () => { setMode("city"); setQuery(""); setSel(0); } },
      { id: "ticker", label: "Add ticker…", hint: "Watchlist", run: () => { setMode("ticker"); setQuery(""); setSel(0); } },
      { id: "task", label: "Add task…", hint: "Tasks", run: () => { setMode("task"); setQuery(""); setSel(0); } },
      { id: "refresh", label: "Refresh all data", hint: "Reload", run: () => window.location.reload() },
      ...NEWS.map(([label, value]) => ({
        id: `news-${value}`,
        label: `News: ${label}`,
        hint: "Headlines",
        run: () => { emitCommand({ kind: "news-tab", value }); scrollToSection("sec-news"); close(); },
      })),
      ...SECTIONS.map(([label, id]) => ({
        id: `go-${id}`,
        label: `Go to ${label}`,
        hint: "Jump",
        run: () => { scrollToSection(id); close(); },
      })),
    ];
    const q = query.trim().toLowerCase();
    return q ? list.filter((a) => a.label.toLowerCase().includes(q)) : list;
  }, [query, NEWS, SECTIONS, close]);

  useEffect(() => { setSel(0); }, [query, mode]);

  async function addTask(title: string) {
    const t = title.trim();
    if (!t) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("tasks").insert({ title: t, quadrant: "do", user_id: user.id, status: "not_started" });
    }
    close();
  }

  function onRootKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, actions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); actions[sel]?.run(); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] px-4 bg-black/40 backdrop-blur-sm" onMouseDown={close}>
      <div className="w-full max-w-lg card !p-0 overflow-hidden animate-fadeIn" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b rule">
          <Search className="h-4 w-4 text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (mode === "root") onRootKeyDown(e);
              else if (e.key === "Enter") {
                e.preventDefault();
                if (mode === "ticker") { emitCommand({ kind: "watchlist-add", value: query }); scrollToSection("sec-watchlist"); close(); }
                else if (mode === "task") addTask(query);
              }
            }}
            placeholder={
              mode === "city" ? "Search any city…"
              : mode === "ticker" ? "Ticker symbol, e.g. META — then Enter"
              : mode === "task" ? "What needs doing? — then Enter"
              : "Type a command…"
            }
            className="flex-1 bg-transparent text-[15px] text-ink focus:outline-none placeholder:text-muted-2"
          />
          {mode !== "root" && (
            <button onClick={() => { setMode("root"); setQuery(""); }} className="text-[11px] text-muted hover:text-ink">esc</button>
          )}
        </div>

        <div className="max-h-[50vh] overflow-auto py-1.5">
          {mode === "root" && actions.map((a, i) => (
            <button
              key={a.id}
              onMouseEnter={() => setSel(i)}
              onClick={a.run}
              className={`w-full text-left flex items-center justify-between gap-3 px-4 py-2 text-[14px] ${i === sel ? "bg-hl text-ink" : "text-ink-soft"}`}
            >
              <span>{a.label}</span>
              <span className="flex items-center gap-2">
                {a.hint && <span className="label !text-[9px]">{a.hint}</span>}
                {i === sel && <CornerDownLeft className="h-3.5 w-3.5 text-muted" />}
              </span>
            </button>
          ))}
          {mode === "root" && actions.length === 0 && (
            <div className="px-4 py-6 text-center text-muted text-sm">No matching command.</div>
          )}

          {mode === "city" && (
            <>
              {cityResults.map((r, i) => (
                <button
                  key={`${r.lat},${r.lon},${i}`}
                  onClick={() => { setCity({ name: r.name, admin: r.admin, country: r.country, lat: r.lat, lon: r.lon, timezone: r.timezone }); close(); }}
                  className="w-full text-left flex items-baseline justify-between gap-3 px-4 py-2 text-[14px] text-ink-soft hover:bg-hl"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="text-[11px] text-muted shrink-0">{[r.admin, r.country].filter(Boolean).join(", ")}</span>
                </button>
              ))}
              {query.trim().length >= 2 && cityResults.length === 0 && (
                <div className="px-4 py-6 text-center text-muted text-sm">Searching…</div>
              )}
            </>
          )}

          {(mode === "ticker" || mode === "task") && (
            <div className="px-4 py-4 text-[13px] text-muted">
              Press <span className="kbd">Enter</span> to {mode === "ticker" ? "add the ticker to your watchlist" : "add the task"}.
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t rule flex items-center gap-3 text-[10px] text-muted">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> navigate</span>
          <span><span className="kbd">↵</span> run</span>
          <span><span className="kbd">esc</span> close</span>
          <span className="ml-auto">⌘K</span>
        </div>
      </div>
    </div>
  );
}
