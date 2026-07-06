"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Heart } from "lucide-react";

const THRESHOLD = 72;

// Pull down at the top of the page to refresh — with a little heart burst.
// Skips the gesture when the touch starts on the map or a text field.
export function PullToRefresh({ children }: { children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  useEffect(() => {
    function onStart(e: TouchEvent) {
      if (window.scrollY > 4 || refreshing) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest(".leaflet-container, input, textarea, [data-no-ptr], .overflow-y-auto, .overflow-auto")) {
        active.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      active.current = true;
    }
    function onMove(e: TouchEvent) {
      if (!active.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 4) { setPull(0); return; }
      // Resist as it stretches.
      const p = Math.min(120, dy * 0.5);
      setPull(p);
      if (p > 6) e.preventDefault();
    }
    function onEnd() {
      if (!active.current) return;
      active.current = false;
      if (pull >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        setTimeout(() => window.location.reload(), 700);
      } else {
        setPull(0);
      }
      startY.current = null;
    }
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pull, refreshing]);

  const ready = pull >= THRESHOLD || refreshing;

  return (
    <>
      {/* Pull indicator */}
      <div
        className="fixed left-0 right-0 z-[70] flex justify-center pointer-events-none"
        style={{
          top: `calc(env(safe-area-inset-top) + ${Math.min(pull, 90) - 30}px)`,
          opacity: pull > 4 || refreshing ? 1 : 0,
          transition: active.current ? "none" : "top .3s ease, opacity .3s ease",
        }}
      >
        <div
          className="grid place-items-center h-11 w-11 rounded-full text-white shadow-lg"
          style={{
            background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))",
            transform: `scale(${Math.min(1, 0.5 + pull / 120)}) rotate(${pull * 3}deg)`,
          }}
        >
          <Heart className={`h-5 w-5 ${refreshing ? "animate-ping" : ""}`} fill={ready ? "currentColor" : "none"} />
        </div>
      </div>

      {/* Heart burst while refreshing */}
      {refreshing && (
        <div className="fixed inset-x-0 z-[69] pointer-events-none flex justify-center" style={{ top: "calc(env(safe-area-inset-top) + 40px)" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Heart
              key={i}
              className="zuya-heart-float text-accent absolute"
              fill="currentColor"
              style={{
                left: `${-40 + i * 16}px`,
                width: 12 + (i % 3) * 5,
                height: 12 + (i % 3) * 5,
                ["--drift" as string]: `${(i - 3) * 18}px`,
                ["--spin" as string]: `${(i - 3) * 12}deg`,
              }}
            />
          ))}
        </div>
      )}

      <div style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: active.current ? "none" : "transform .3s ease" }}>
        {children}
      </div>
    </>
  );
}
