"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Radio, Settings2, X } from "lucide-react";
import {
  subscribeRadio, radioStatus, toggleRadio,
  getCustomRadioUrl, setCustomRadioUrl,
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
  const [url, setUrl] = useState("");
  const pressTimer = useRef<number | null>(null);
  useEffect(() => { if (editing) setUrl(getCustomRadioUrl()); }, [editing]);

  function onPointerDown() {
    pressTimer.current = window.setTimeout(() => setEditing(true), 550);
  }
  function clearPress() {
    if (pressTimer.current != null) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => toggleRadio()}
        onContextMenu={(e) => { e.preventDefault(); setEditing(true); }}
        onPointerDown={onPointerDown}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        aria-label="SlowTurk radio"
        title={
          error ? "Couldn't reach SlowTurk — long-press to set a custom URL"
          : active ? "Stop SlowTurk · long-press to set URL"
          : loading ? "Connecting…"
          : "Play SlowTurk radio · long-press to set URL"
        }
        className={`btn-ghost relative overflow-visible ${active || loading ? "!text-accent !border-[var(--accent)] !bg-[var(--accent-soft)]" : ""} ${error ? "!text-down !border-[var(--down)]" : ""}`}
        style={active ? { boxShadow: "0 0 18px -4px var(--glow), inset 0 1px 0 rgba(255,255,255,0.08)" } : undefined}
      >
        {/* Idle / loading / error: keep the radio glyph. Playing: hide it and
            show the equalizer instead, so the button looks alive. */}
        {!active && <Radio className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />}
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
