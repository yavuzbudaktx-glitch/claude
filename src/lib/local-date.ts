// Helpers for client widgets that should rotate their content at the user's
// *local* midnight (not UTC midnight, which is mid-evening for the user).

export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Day key that rolls over at a custom local hour instead of midnight —
// e.g. localDateKeyAt(5): anything logged before 5 AM still counts toward
// the previous day (late-night snacks stay on yesterday's tally).
export function localDateKeyAt(rolloverHour: number, d: Date = new Date()): string {
  return localDateKey(new Date(d.getTime() - rolloverHour * 3600_000));
}

// Milliseconds from now until the next local 00:00:01.
export function msUntilLocalMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return tomorrow.getTime() - now.getTime();
}
