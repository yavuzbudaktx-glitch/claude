import { useEffect, useRef, useState } from "react";

// Measures a scroll container's available height and returns how many rows of
// ~`rowPx` fit, clamped to [base, max]. Lets a list grow to fill a card that
// has been stretched tall (e.g. by a taller sibling in the same grid row),
// instead of leaving dead space — the "smart box" behaviour.
export function useFitCount(base: number, rowPx: number, max: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(base);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const h = el.clientHeight;
      if (h <= 0) return;
      const n = Math.max(base, Math.min(max, Math.floor(h / rowPx)));
      setCount(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [base, rowPx, max]);

  return [ref, count] as const;
}
