"use client";

import { useEffect, useState } from "react";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";

// Today's local-date as a stable string; recomputed at LOCAL midnight so any
// component keyed on it (SWR cache keys, iframe `key={...}` re-mounts, daily
// picks) flips to the new day automatically. The first re-render is timed to
// the actual midnight boundary, then we poll every minute as a safety net in
// case the timer drifted (browser tab was inactive, the system clock changed,
// etc).
export function useDailyKey(): string {
  const [k, setK] = useState<string>(() => localDateKey());
  useEffect(() => {
    const tick = () => setK(localDateKey());
    // First flip right at the next local midnight (+1s slack).
    const t = setTimeout(tick, Math.max(1000, msUntilLocalMidnight()));
    const id = setInterval(tick, 60_000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, []);
  return k;
}
