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
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/45 backdrop-blur-2xl animate-fadeIn">
      <div className="text-center">
        <div className="label text-accent mb-4 !tracking-[0.3em]">Focus time</div>
        <div className="font-display tabular-nums text-white leading-none text-[84px] md:text-[140px]">
          {mm}:{ss}
        </div>
        <button
          onClick={() => setActive(false)}
          className="mt-10 inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/25 text-white/85 hover:bg-white/10 transition text-sm"
        >
          <X className="h-4 w-4" /> End focus
        </button>
      </div>
    </div>
  );
}
