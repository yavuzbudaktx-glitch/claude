"use client";

import { useSyncExternalStore } from "react";
import { Radio } from "lucide-react";
import { subscribeRadio, radioStatus, toggleRadio } from "@/lib/radio";

// SlowTurk radio toggle. State lives in the radio singleton so playback
// survives page navigation; this button just reflects + toggles it.
export function RadioButton() {
  const status = useSyncExternalStore(subscribeRadio, radioStatus, () => "idle" as const);
  const active = status === "playing" || status === "loading";
  const error = status === "error";

  return (
    <button
      onClick={() => toggleRadio()}
      aria-label="SlowTurk radio"
      title={
        error ? "Couldn’t connect to SlowTurk"
        : status === "playing" ? "Stop SlowTurk radio"
        : status === "loading" ? "Connecting…"
        : "Play SlowTurk radio"
      }
      className={`btn-ghost relative ${active ? "!text-accent !border-[var(--accent)]" : ""} ${error ? "!text-down !border-[var(--down)]" : ""}`}
    >
      <Radio className={`h-4 w-4 ${status === "loading" ? "animate-pulse" : ""}`} />
      {status === "playing" && (
        <span
          className="absolute -top-0.5 -right-0.5 flex h-2 w-2"
          aria-hidden
        >
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" style={{ boxShadow: "0 0 8px var(--glow)" }} />
        </span>
      )}
    </button>
  );
}
