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
  /** Alternate URL the card tries when `headshot` 404s in the browser. */
  headshotFallback: string | null;
  record: string | null;
  /** Country / nationality, e.g. "Brazil". */
  country: string | null;
  /** Fighting style / division summary, e.g. "Light Heavyweight". */
  division: string | null;
  /** Status — "Champion", "Active", etc. */
  status: string | null;
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
    // ESPN omits the headshot field on the scoreboard payload more often
    // than not. Construct the canonical CDN URL from the athlete id so the
    // fighter portrait still resolves.
    const headshotFromHref = c.athlete.headshot?.href ?? null;
    const headshotFromId = c.athlete.id
      ? `https://a.espncdn.com/i/headshots/mma/players/full/${c.athlete.id}.png`
      : null;
    return {
      name: c.athlete.fullName ?? c.athlete.displayName ?? "",
      headshot: headshotFromHref ?? headshotFromId,
      headshotFallback: null, // filled in by enrichEvent (UFC.com / Wikipedia).
      record: recordSummary(c),
      country: null,
      division: null,
      status: null,
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

// ---------- UFC.com athlete page scraper ------------------------------------
//
// UFC.com hosts every fighter at /athlete/{slug} with their pose photo on
// the UFC's own Cloudfront CDN plus structured stats (record, country,
// division, status). Scraping it gives us a much higher hit rate than ESPN
// for newer fighters.

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function ufcAthleteSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export interface UfcAthletePage {
  photo: string | null;
  record: string | null;
  country: string | null;
  division: string | null;
  status: string | null;
}

async function fetchUfcAthletePage(name: string): Promise<UfcAthletePage | null> {
  if (!name) return null;
  const slug = ufcAthleteSlug(name);
  if (!slug) return null;
  const url = `https://www.ufc.com/athlete/${slug}`;
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // Hero photo lives on UFC's Cloudfront CDN; first occurrence on the page
  // is the athlete's pose image.
  let photo: string | null = null;
  const photoMatch = html.match(
    /https?:\/\/dmxg5wxfqgb4u\.cloudfront\.net\/[^"'\s)]+\.(?:png|jpg|jpeg|webp)/i,
  );
  if (photoMatch) photo = photoMatch[0];

  // Record: UFC.com shows "20-4-0 (W-L-D)" in a stat block. Match the
  // common patterns flexibly.
  let record: string | null = null;
  const recordMatch =
    html.match(/(\d{1,3})-(\d{1,3})-(\d{1,3})\s*\([^)]*W-L[^)]*\)/i) ??
    html.match(/Record[\s\S]{0,200}?(\d{1,3}-\d{1,3}-\d{1,3})/i);
  if (recordMatch) {
    record = recordMatch[3] ? `${recordMatch[1]}-${recordMatch[2]}-${recordMatch[3]}` : recordMatch[1];
  }

  // Country: usually in a "hero-profile__division-body" or under a flag.
  let country: string | null = null;
  const countryMatch =
    html.match(/Country<\/[a-z]+>\s*<[^>]+>\s*([^<]+?)\s*</i) ??
    html.match(/Place of Birth[\s\S]{0,400}?<[^>]+>\s*([^,<\n]+,\s*[^<\n]+)\s*</i);
  if (countryMatch) country = stripHtml(countryMatch[1]);

  // Division/weight class: shown as "Light Heavyweight Division" etc.
  let division: string | null = null;
  const divisionMatch =
    html.match(/hero-profile__division-title[^>]*>\s*([^<]+?)\s*</i) ??
    html.match(/Division<\/[a-z]+>\s*<[^>]+>\s*([^<]+?)\s*</i);
  if (divisionMatch) division = stripHtml(divisionMatch[1]).replace(/\s*Division$/i, "");

  // Status: "Active", "Champion", etc.
  let status: string | null = null;
  const statusMatch =
    html.match(/Status<\/[a-z]+>\s*<[^>]+>\s*([^<]+?)\s*</i) ??
    html.match(/hero-profile__tag[^>]*>\s*([^<]+?)\s*</i);
  if (statusMatch) status = stripHtml(statusMatch[1]);

  if (!photo && !record && !country && !division && !status) return null;
  return { photo, record, country, division, status };
}

async function fetchWikipediaThumbnail(name: string): Promise<string | null> {
  // Wikipedia's REST summary endpoint returns a `thumbnail.source` for any
  // page that has an infobox image — virtually every notable UFC fighter
  // has one. We use this as a fallback when ESPN's headshot 404s in the
  // browser, since ESPN omits portraits for less-famous fighters.
  if (!name) return null;
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      name.replace(/\s+/g, "_"),
    )}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
    };
    return json.thumbnail?.source ?? json.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

async function enrichFighter(f: UfcFighter | null, athleteId: string | undefined): Promise<UfcFighter | null> {
  if (!f) return null;
  // Fetch UFC.com athlete page, Wikipedia thumbnail, and (if needed) the
  // ESPN athlete-detail record in parallel.
  const [ufc, wiki, espn] = await Promise.all([
    fetchUfcAthletePage(f.name),
    fetchWikipediaThumbnail(f.name),
    athleteId ? fetchAthleteRecord(athleteId) : Promise.resolve({ record: null, headshot: null }),
  ]);

  // UFC.com's pose photo wins when present; fall back to ESPN's URL, then
  // Wikipedia thumbnail. headshotFallback gets whichever non-primary
  // candidate is left so the client has at least one backup.
  const ufcPhoto = ufc?.photo ?? null;
  const primary = ufcPhoto ?? f.headshot ?? espn.headshot ?? wiki ?? null;
  const fallback =
    primary === ufcPhoto
      ? f.headshot ?? espn.headshot ?? wiki ?? null
      : primary === f.headshot
        ? espn.headshot ?? wiki ?? null
        : primary === espn.headshot
          ? wiki ?? null
          : null;

  return {
    ...f,
    record: ufc?.record ?? f.record ?? espn.record ?? null,
    country: ufc?.country ?? f.country ?? null,
    division: ufc?.division ?? f.division ?? null,
    status: ufc?.status ?? f.status ?? null,
    headshot: primary,
    headshotFallback: fallback,
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
