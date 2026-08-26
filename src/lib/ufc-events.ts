// Which UFC cards the dashboard is willing to show.
//
// Plain module, no "use client" — the server route and the browser fallback
// both import it, because the whole reason Dana White's Contender Series ended
// up on the card is that those two paths were deciding this separately and only
// one of them had a filter.
//
// The rule: numbered cards and the big named specials. Nothing else. Fight
// Nights are explicitly out — including the ones that carry a number, like
// "UFC on ESPN 62", which a naive "has UFC and a digit" test happily accepts.

/** Never wanted, regardless of anything else — the developmental shows, plus
 *  Noche UFC, which is a headline card but not one worth surfacing here. Noche
 *  is listed as an exclusion rather than just left off the allowlist below,
 *  because ESPN sometimes files it under a numbered-looking name that the
 *  general rule would otherwise let through. */
const FEEDER = /dana white|contender series|road to ufc|ultimate fighter|\btuf\b|\bnoche\b/i;

/** Fight Nights, under every banner ESPN files them as. */
const FIGHT_NIGHT = /fight night|ufc on\s+(?:espn|abc|fox|fx|fuel|versus|sport)/i;

/** "UFC 320", "UFC 320: Ankalaev vs Pereira 2", "UFC Freedom 250". */
const NUMBERED = /^\s*ufc\b[^:]*?\b\d{1,4}\b/i;

/** Named specials that carry no number but are unmistakably headline cards. */
const SPECIAL = /white house/i;

/**
 * True when the event is one worth putting on the dashboard. Pass every name
 * variant you have (ESPN gives both `name` and `shortName`, and which one
 * carries the number varies) — a feeder match in ANY of them disqualifies the
 * event, and a headline match in ANY of them qualifies it.
 */
export function isBigUfcEvent(...names: Array<string | null | undefined>): boolean {
  const candidates = names.filter((n): n is string => !!n && n.trim().length > 0);
  if (candidates.length === 0) return false;
  if (candidates.some((n) => FEEDER.test(n))) return false;
  return candidates.some(
    (n) => SPECIAL.test(n) || (!FIGHT_NIGHT.test(n) && NUMBERED.test(n)),
  );
}
