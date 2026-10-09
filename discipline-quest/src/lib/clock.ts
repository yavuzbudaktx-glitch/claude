/**
 * App clock. Normally real time; `?now=2026-10-10T08:20` pins a time offset for the session
 * (used for testing day rollovers). `?now=reset` clears it.
 */
const KEY = "dq-clock-offset";
let offset: number | null = null;

function load(): number {
  if (offset !== null) return offset;
  offset = 0;
  if (typeof window === "undefined") return offset;
  try {
    const param = new URLSearchParams(window.location.search).get("now");
    if (param === "reset") sessionStorage.removeItem(KEY);
    else if (param) {
      const t = new Date(param).getTime();
      if (!Number.isNaN(t)) sessionStorage.setItem(KEY, String(t - Date.now()));
    }
    offset = Number(sessionStorage.getItem(KEY) ?? 0) || 0;
  } catch {
    offset = 0;
  }
  return offset;
}

export function getNow(): Date {
  return new Date(Date.now() + load());
}

export function isClockShifted(): boolean {
  return load() !== 0;
}
