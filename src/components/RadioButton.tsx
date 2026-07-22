"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { RadioTower, Settings2, X, Radio, BookOpenText, Shuffle } from "lucide-react";
import {
  subscribeRadio, radioStatus, toggleRadio, stopRadio, playRadioSource,
  prefetchQuranLibrary, ensureYtPlayer, getCustomRadioUrl, setCustomRadioUrl, type RadioSource,
} from "@/lib/radio";

// Equalizer animation: three thin bars that breathe at offset rates while
// the radio is playing. Reads as "live audio" at a glance.
function Equalizer() {
  return (
    <span className="absolute inset-0 grid place-items-center pointer-events-none">
      <span className="flex items-end gap-[2px] h-4">
        <span className="w-[2.5px] rounded-full bg-accent animate-eq1" />
        <span className="w-[2.5px] rounded-full bg-accent animate-eq2" />
        <span className="w-[2.5px] rounded-full bg-accent animate-eq3" />
      </span>
    </span>
  );
}

export function RadioButton() {
  const status = useSyncExternalStore(subscribeRadio, radioStatus, () => "idle" as const);
  const active = status === "playing";
  const loading = status === "loading";
  const error = status === "error";

  // Long-press / right-click opens the custom-URL popover so the user can
  // paste their own stream if the published mirrors stop working.
  const btnRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [url, setUrl] = useState("");
  const pressTimer = useRef<number | null>(null);
  useEffect(() => { if (editing) setUrl(getCustomRadioUrl()); }, [editing]);

  function onPointerDown() {
    pressTimer.current = window.setTimeout(() => { setPicking(false); setEditing(true); }, 550);
  }
  function clearPress() {
    if (pressTimer.current != null) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  // Click: if something's playing, stop it. Otherwise open the 3-option picker
  // so the user chooses a source before anything plays.
  function onClick() {
    if (active || loading) { stopRadio(); return; }
    setPicking((p) => {
      const next = !p;
      if (next) {
        ensureYtPlayer();          // build the YouTube player now so a pick plays instantly
        prefetchQuranLibrary();    // warm the Quran list before they pick it
      }
      return next;
    });
  }
  function pick(source: RadioSource) {
    setPicking(false);
    playRadioSource(source);
  }

  const RADIO_SOURCES: Array<{ id: RadioSource; label: string; sub: string; icon: typeof Radio }> = [
    { id: "kral",  label: "Kral Türk",         sub: "live akustik broadcast",   icon: Radio },
    { id: "quran", label: "Relaxing Quran",    sub: "random recitation",        icon: BookOpenText },
    { id: "mix",   label: "Mix radio",         sub: "personalized station",     icon: Shuffle },
  ];

  return (
    <>
      <button
        ref={btnRef}
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); setPicking(false); setEditing(true); }}
        onPointerDown={onPointerDown}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        aria-label="Radio"
        title={
          error ? "Couldn't start the radio — long-press to set a custom URL"
          : active ? "Stop radio · long-press to set URL"
          : loading ? "Connecting…"
          : "Play radio · pick a source · long-press to set URL"
        }
        className={`btn-ghost relative overflow-visible ${active || loading ? "!text-accent !border-[var(--accent)] !bg-[var(--accent-soft)]" : ""} ${error ? "!text-down !border-[var(--down)]" : ""}`}
        style={active ? { boxShadow: "0 0 18px -4px var(--glow), inset 0 1px 0 rgba(255,255,255,0.08)" } : undefined}
      >
        {/* Idle / loading / error: broadcast-tower glyph. Playing: hide it and
            show the equalizer instead, so the button looks alive. */}
        {!active && <RadioTower className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />}
        {active && <Equalizer />}

        {/* Pulsing ring while loading */}
        {loading && (
          <span
            className="absolute inset-0 rounded-[12px] pointer-events-none"
            style={{ boxShadow: "0 0 0 0 var(--accent)", animation: "radioPing 1.4s ease-out infinite" }}
            aria-hidden
          />
        )}

        {/* "LIVE" dot when playing */}
        {active && (
          <span
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent"
            style={{ boxShadow: "0 0 10px var(--glow)" }}
            aria-hidden
          />
        )}
      </button>

      {picking && typeof window !== "undefined" && createPortal(
        // The menu is an OPAQUE panel (var(--bg) is a solid colour in every
        // theme) with NO backdrop-filter, nested inside the dim overlay. An
        // earlier version used the frosted `.card` class, whose own
        // backdrop-filter stacked on top of the overlay's blur and rendered
        // fully transparent on some GPUs — "screen blurs but no menu". A solid
        // panel can't be nuked by that interaction.
        <div
          className="fixed inset-0 z-[60] bg-black/25 backdrop-blur-sm animate-fadeIn flex items-start justify-end"
          style={{ paddingTop: 66, paddingRight: 20, paddingLeft: 20 }}
          onClick={() => setPicking(false)}
        >
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className="w-[min(300px,100%)] rounded-2xl p-2 animate-fadeIn"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--glass-border)",
              boxShadow: "0 18px 50px -12px rgba(0,0,0,0.5)",
            }}
          >
            <div className="px-2 py-1.5 label flex items-center gap-1.5">
              <RadioTower className="h-3 w-3" /> Pick a station
            </div>
            <div className="flex flex-col gap-0.5">
              {RADIO_SOURCES.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => pick(s.id)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--rule-soft)] transition group"
                  >
                    <span className="grid place-items-center h-8 w-8 shrink-0 rounded-lg bg-[var(--accent-soft)] text-accent">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink leading-tight">{s.label}</span>
                      <span className="block text-[11px] text-muted leading-tight">{s.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {editing && typeof window !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[58] bg-black/25 backdrop-blur-sm animate-fadeIn" onClick={() => setEditing(false)} aria-hidden />
          <div className="fixed top-[72px] right-5 md:right-10 z-[60] w-[min(380px,calc(100vw-2.5rem))] card !p-4 animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <span className="label flex items-center gap-1.5">
                <Settings2 className="h-3 w-3" /> SlowTurk stream
              </span>
              <button onClick={() => setEditing(false)} aria-label="Close" className="text-muted-2 hover:text-ink transition">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11.5px] text-muted leading-relaxed mb-2.5">
              If the published mirrors aren&rsquo;t working, paste a direct stream URL
              from <a href="https://mytuner-radio.com/radio/slow-turk-420894/" target="_blank" rel="noreferrer" className="text-accent hover:underline">mytuner-radio</a> here (inspect the page &rarr; copy the .m3u8 / .mp3).
            </p>
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/slowturk/playlist.m3u8"
              className="w-full rounded-lg bg-[var(--rule-soft)] px-2.5 py-1.5 font-mono text-[12px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => { setCustomRadioUrl(""); setUrl(""); }}
                className="text-[12px] text-muted hover:text-ink transition"
              >
                clear
              </button>
              <button
                onClick={() => { setCustomRadioUrl(url); setEditing(false); toggleRadio(); }}
                className="btn-primary !py-1.5 !px-3 !text-[12.5px]"
              >
                Save &amp; play
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
