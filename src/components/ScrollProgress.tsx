"use client";

import { useEffect, useState } from "react";

// A thin gradient bar pinned to the very top of the viewport that fills as you
// scroll down the page. A quiet bit of polish that also doubles as a "how far
// through am I" cue on the long dashboard.
export function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        setPct(max > 0 ? (h.scrollTop / max) * 100 : 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[120] h-[3px] pointer-events-none" aria-hidden>
      <div
        className="h-full origin-left transition-[width] duration-75"
        style={{
          width: `${pct}%`,
          background: "linear-gradient(90deg, var(--grad-from), var(--grad-via), var(--grad-to))",
          boxShadow: pct > 0.5 ? "0 0 10px var(--glow)" : "none",
        }}
      />
    </div>
  );
}
