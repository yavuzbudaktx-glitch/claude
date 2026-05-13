import { NextResponse } from "next/server";

// UFC schedule + last/next numbered-event fetcher.
//
// We use ESPN's public MMA endpoints:
//   - /apis/site/v2/sports/mma/ufc/scoreboard?dates=YYYYMMDD-YYYYMMDD
//     returns events (cards) inside a 90d window. Each event has a list of
//     "competitions" (individual fights). The main event is conventionally
//     the LAST competition in the array — that's the fight whose result we
//     surface.
//   - /apis/common/v3/sports/mma/ufc/athletes/{id}
//     enriches the winner with current record + headshot.
//
// Numbered events only: filter event.shortName to /^UFC \d+/i so we
// exclude UFC Fight Night and UFC on ESPN-style cards entirely.

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

interface EspnAthleteRef {
  id?: string;
  fullName?: string;
  displayName?: string;
  headshot?: { href?: string };
}
interface EspnMmaCompetitor {
  athlete?: EspnAthleteRef;
  winner?: boolean;
  record?: Array<{ summary?: string; displayValue?: string; type?: string }>;
}
interface EspnMmaCompetition {
  competitors?: EspnMmaCompetitor[];
  status?: { type?: { completed?: boolean; description?: string; state?: string } };
  type?: { text?: string };
  notes?: Array<{ headline?: string; type?: string }>;
}
interface EspnMmaEvent {
  id?: string;
  name?: string;
  shortName?: string;
  date?: string;
  competitions?: EspnMmaCompetition[];
  status?: { type?: { completed?: boolean; state?: string } };
}
interface EspnMmaScoreboardResp { events?: EspnMmaEvent[] }

export interface UfcFighter {
  name: string;
  headshot: string | null;
  record: string | null;
  winner: boolean;
}
export interface UfcEvent {
  id: string;
  name: string;
  shortName: string;
  date: string;
  isFinished: boolean;
  fighterA: UfcFighter | null;
  fighterB: UfcFighter | null;
  method: string | null;
  weightClass: string | null;
}
export interface UfcPayload {
  previous: UfcEvent | null;
  upcoming: UfcEvent | null;
  source: string;
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; }

function isNumberedUfc(name: string | undefined): boolean {
  if (!name) return false;
  // Match "UFC 312", "UFC 312:", "UFC Freedom 250" — anything with "UFC"
  // followed by a numeric token. Excludes "UFC Fight Night ..." which
  // never contains a standalone digit after "UFC".
  return /^UFC[^:]*\b\d{1,3}\b/i.test(name);
}

async function jsonFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function parseEvent(e: EspnMmaEvent): UfcEvent | null {
  const shortName = e.shortName ?? e.name ?? "";
  if (!isNumberedUfc(shortName) && !isNumberedUfc(e.name)) return null;
  const id = e.id ?? "";
  const date = e.date ?? "";
  if (!date) return null;

  // Main event = last competition on the card.
  const comps = e.competitions ?? [];
  const main = comps[comps.length - 1];
  const competitors = main?.competitors ?? [];
  const a = competitors[0];
  const b = competitors[1];

  const recordSummary = (c: EspnMmaCompetitor | undefined): string | null => {
    if (!c?.record?.length) return null;
    const overall = c.record.find((r) => r.type === "total" || r.type === "overall");
    return overall?.summary ?? overall?.displayValue ?? c.record[0]?.summary ?? c.record[0]?.displayValue ?? null;
  };
  const fighter = (c: EspnMmaCompetitor | undefined): UfcFighter | null => {
    if (!c?.athlete) return null;
    return {
      name: c.athlete.fullName ?? c.athlete.displayName ?? "",
      headshot: c.athlete.headshot?.href ?? null,
      record: recordSummary(c),
      winner: !!c.winner,
    };
  };

  const method =
    main?.notes?.find((n) => n.type === "decision" || n.headline)?.headline ??
    main?.status?.type?.description ??
    null;

  return {
    id,
    name: e.name ?? shortName,
    shortName,
    date,
    isFinished: !!main?.status?.type?.completed || !!e.status?.type?.completed,
    fighterA: fighter(a),
    fighterB: fighter(b),
    method,
    weightClass: main?.type?.text ?? null,
  };
}

async function fetchAthleteRecord(athleteId: string): Promise<{ record: string | null; headshot: string | null }> {
  // ESPN's athlete-detail endpoint includes a current record string and a
  // higher-resolution headshot than the one on the event response.
  interface AthleteResp {
    athlete?: {
      headshot?: { href?: string };
      statsSummary?: { displayValue?: string };
      records?: Array<{ summary?: string; displayValue?: string; type?: string }>;
    };
  }
  const json = await jsonFetch<AthleteResp>(
    `https://site.web.api.espn.com/apis/common/v3/sports/mma/ufc/athletes/${athleteId}`,
  );
  const a = json?.athlete;
  if (!a) return { record: null, headshot: null };
  const rec =
    a.statsSummary?.displayValue ??
    a.records?.find((r) => r.type === "total" || r.type === "overall")?.summary ??
    a.records?.[0]?.displayValue ??
    null;
  return { record: rec ?? null, headshot: a.headshot?.href ?? null };
}

async function enrichFighter(f: UfcFighter | null, athleteId: string | undefined): Promise<UfcFighter | null> {
  if (!f) return null;
  if (f.record && f.headshot) return f; // already complete
  if (!athleteId) return f;
  const { record, headshot } = await fetchAthleteRecord(athleteId);
  return {
    ...f,
    record: f.record ?? record,
    headshot: f.headshot ?? headshot,
  };
}

async function enrichEvent(ev: UfcEvent, raw: EspnMmaEvent): Promise<UfcEvent> {
  const comps = raw.competitions ?? [];
  const main = comps[comps.length - 1];
  const competitors = main?.competitors ?? [];
  const idA = competitors[0]?.athlete?.id;
  const idB = competitors[1]?.athlete?.id;
  const [a, b] = await Promise.all([
    enrichFighter(ev.fighterA, idA),
    enrichFighter(ev.fighterB, idB),
  ]);
  return { ...ev, fighterA: a, fighterB: b };
}

async function fetchScoreboard(from: Date, to: Date): Promise<{ events: UfcEvent[]; rawByEvent: Map<string, EspnMmaEvent> }> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${ymd(from)}-${ymd(to)}`;
  const json = await jsonFetch<EspnMmaScoreboardResp>(url);
  const rawByEvent = new Map<string, EspnMmaEvent>();
  const events: UfcEvent[] = [];
  for (const raw of json?.events ?? []) {
    const parsed = parseEvent(raw);
    if (parsed) {
      events.push(parsed);
      rawByEvent.set(parsed.id, raw);
    }
  }
  return { events, rawByEvent };
}

export async function GET() {
  const now = new Date();
  const from = new Date(now.getTime() - 120 * 86400000);
  const to = new Date(now.getTime() + 180 * 86400000);

  const { events, rawByEvent } = await fetchScoreboard(from, to);

  const sorted = [...events].sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const t = now.getTime();
  let previous: UfcEvent | null = null;
  let upcoming: UfcEvent | null = null;
  for (const ev of sorted) {
    const eventTime = +new Date(ev.date);
    if (eventTime <= t || ev.isFinished) previous = ev;
    else if (!upcoming) upcoming = ev;
  }

  const [enrichedPrev, enrichedNext] = await Promise.all([
    previous ? enrichEvent(previous, rawByEvent.get(previous.id)!) : Promise.resolve(null),
    upcoming ? enrichEvent(upcoming, rawByEvent.get(upcoming.id)!) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    previous: enrichedPrev,
    upcoming: enrichedNext,
    source: "espn",
  } satisfies UfcPayload);
}
