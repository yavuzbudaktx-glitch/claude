"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useCommand } from "@/lib/commands";

// A full-screen blur with a large count-up timer. Opened from the masthead
// button or the command palette (the "focus" command).
export function FocusMode() {
  const [active, setActive] = useState(false);
  const [secs, setSecs] = useState(0);

  useCommand((c) => {
    if (c.kind === "focus") {
      setSecs(0);
      setActive(true);
    }
  });

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActive(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);

  if (!active) return null;

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 backdrop-blur-xl animate-fadeIn">
      <div
        className="flex flex-col items-center gap-4 px-12 py-9 rounded-3xl border border-white/10 bg-white/[0.06]"
        style={{ boxShadow: "0 0 70px -12px var(--glow), inset 0 1px 0 rgba(255,255,255,0.08)" }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.4em] text-white/55">Focus</div>
        <div className="font-display tabular-nums text-white/95 leading-none text-5xl md:text-6xl">
          {mm}:{ss}
        </div>
        <button
          onClick={() => setActive(false)}
          className="mt-1 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-white/20 text-white/70 hover:bg-white/10 hover:text-white transition text-[13px]"
        >
          <X className="h-3.5 w-3.5" /> End
        </button>
      </div>
    </div>
  );
}
