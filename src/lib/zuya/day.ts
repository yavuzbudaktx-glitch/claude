// Every "daily" concept in Zuya — thought-counter reset, daily question,
// daily photo, wordle-race word — keys off this one helper so they all roll
// over at the same local midnight, on the client and the server alike.

// The couple's home timezone. Change this single line if they move.
export const ZUYA_TZ = "America/Chicago";

/** Today's date key, YYYY-MM-DD, in the couple's timezone. */
export function zuyaToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZUYA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Deterministic index into a list of length n for a given string key. */
export function zuyaSeedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}
