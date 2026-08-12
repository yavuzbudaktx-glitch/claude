import { NextResponse } from "next/server";
import { findFighterDrivePhoto } from "@/lib/ufc-photos";
import { findLocalFighterPhoto } from "@/lib/local-fighter-photos";

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

// Build the list of slug candidates we should try on UFC.com for a given
// fighter name. UFC.com often disambiguates with a -1 / -2 suffix on
// common names (alex-pereira-1, magomed-ankalaev-1 ...). Walking these
// in order catches the disambiguated pages without needing a full search
// API. The ̀-ͯ range is the Unicode "combining marks" block —
// using the explicit escape works across all source-file encodings.
function ufcAthleteSlugCandidates(name: string): string[] {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-");
  if (!base) return [];
  return [base, `${base}-1`, `${base}-2`];
}

export interface UfcAthletePage {
  photo: string | null;
  record: string | null;
  country: string | null;
  division: string | null;
  status: string | null;
}

function findUfcPhoto(html: string, fighterName: string): string | null {
  // UFC's CDN filenames typically embed the fighter's surname, e.g.
  // ".../2024-01/PEREIRA_ALEX_03-09.png". Pull every Cloudfront URL on
  // the page and prefer the one whose filename includes this fighter's
  // last name — otherwise we silently pick up an opponent's portrait or
  // the page's hero card image.
  const all = [
    ...html.matchAll(
      /https?:\/\/dmxg5wxfqgb4u\.cloudfront\.net\/[^"'\s)]+\.(?:png|jpg|jpeg|webp)/gi,
    ),
  ].map((m) => m[0]);
  if (all.length === 0) return null;

  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tokens = normalize(fighterName).split(/\s+/).filter((t) => t.length >= 4);
  if (tokens.length === 0) return all[0];

  // First pass: filename contains every meaningful name token.
  for (const url of all) {
    const filename = normalize(url.split("/").pop() ?? "");
    if (tokens.every((t) => filename.includes(t))) return url;
  }
  // Second pass: filename contains at least the LAST name.
  const last = tokens[tokens.length - 1];
  for (const url of all) {
    const filename = normalize(url.split("/").pop() ?? "");
    if (filename.includes(last)) return url;
  }
  // No name match — fall back to the first URL (likely the hero card).
  return all[0];
}

function parseUfcAthleteHtml(html: string, fighterName: string): UfcAthletePage | null {
  const photo = findUfcPhoto(html, fighterName);

  // Record: UFC.com shows "20-4-0 (W-L-D)" in a stat block.
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

async function fetchUfcAthletePage(name: string): Promise<UfcAthletePage | null> {
  if (!name) return null;
  // Walk each candidate slug; first page that yields a Cloudfront photo
  // wins. If nothing has a photo but one page had record/stats, fall back
  // to that so we at least populate the textual stats.
  let textOnlyFallback: UfcAthletePage | null = null;
  for (const slug of ufcAthleteSlugCandidates(name)) {
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
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }
    // Verify the page is actually for *this* fighter before trusting its
    // photo URL. UFC.com's slug routing sometimes silently redirects to a
    // different fighter or a generic landing, which is why the user kept
    // seeing the wrong person's pose photo.
    if (!pageMatchesFighter(html, name)) continue;
    const parsed = parseUfcAthleteHtml(html, name);
    if (!parsed) continue;
    if (parsed.photo) return parsed;
    if (!textOnlyFallback) textOnlyFallback = parsed;
  }
  return textOnlyFallback;
}

function pageMatchesFighter(html: string, fighterName: string): boolean {
  const tokens = fighterName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  // Check the <title>, <h1>, and og:title against the fighter's name tokens.
  // We require ALL meaningful name tokens (≥3 chars) to appear so a slug
  // collision with a different fighter who shares a first or last name
  // doesn't pass.
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const haystack = [
    titleMatch?.[1] ?? "",
    h1Match ? stripHtml(h1Match[1]) : "",
    ogTitleMatch?.[1] ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return tokens.every((t) => haystack.includes(t));
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
  // Local photos in /public/fighters/ are the top-priority source — the
  // user dropped their curated set there, so when we find a match we
  // serve it directly and skip every external fetch path.
  const localPhoto = findLocalFighterPhoto(f.name);

  // Otherwise hit external sources in parallel for the rest of the data.
  const [drivePhoto, ufc, wiki, espn] = await Promise.all([
    localPhoto ? Promise.resolve(null) : findFighterDrivePhoto(f.name),
    fetchUfcAthletePage(f.name),
    fetchWikipediaThumbnail(f.name),
    athleteId ? fetchAthleteRecord(athleteId) : Promise.resolve({ record: null, headshot: null }),
  ]);

  // Photo priority: local /public/fighters > user's Drive folder >
  // UFC.com pose shot > Wikipedia infobox > ESPN constructed URL >
  // ESPN detail headshot.
  const ufcPhoto = ufc?.photo ?? null;
  const primary = localPhoto ?? drivePhoto ?? ufcPhoto ?? wiki ?? f.headshot ?? espn.headshot ?? null;
  const fallback =
    primary === localPhoto
      ? drivePhoto ?? ufcPhoto ?? wiki ?? f.headshot ?? espn.headshot ?? null
      : primary === drivePhoto
        ? ufcPhoto ?? wiki ?? f.headshot ?? espn.headshot ?? null
        : primary === ufcPhoto
          ? wiki ?? f.headshot ?? espn.headshot ?? null
          : primary === wiki
            ? f.headshot ?? espn.headshot ?? null
            : primary === f.headshot
              ? espn.headshot ?? wiki ?? null
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

// Vercel kills the function at its wall-clock limit, and enrichment is the
// expensive half: it scrapes ufc.com athlete pages and Wikipedia for photos,
// records and nationality, several fetches per fighter. When those are slow the
// whole route died and the card showed nothing at all — with no fallback,
// because ESPN's scoreboard is the only source here.
//
// So the route now has a DEADLINE. The scoreboard (the part that actually
// matters) is fetched first and returned no matter what; enrichment only runs
// with whatever time is left, and anything that throws or overruns is dropped
// rather than taking the response with it.
const BUDGET_MS = 7200;

export async function GET() {
  const started = Date.now();
  const left = () => BUDGET_MS - (Date.now() - started);

  const now = new Date();
  const from = new Date(now.getTime() - 120 * 86400000);
  const to = new Date(now.getTime() + 180 * 86400000);

  let events: UfcEvent[] = [];
  let rawByEvent = new Map<string, EspnMmaEvent>();
  try {
    const got = await fetchScoreboard(from, to);
    events = got.events;
    rawByEvent = got.rawByEvent;
  } catch {
    events = [];
  }

  const sorted = [...events].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const t = now.getTime();
  let previous: UfcEvent | null = null;
  let upcoming: UfcEvent | null = null;
  for (const ev of sorted) {
    const eventTime = +new Date(ev.date);
    if (eventTime <= t || ev.isFinished) previous = ev;
    else if (!upcoming) upcoming = ev;
  }

  // Enrich only while there's budget, and never let it fail the request. The
  // un-enriched event still has the names, date, weight class and method —
  // everything except photos and records — so a partial answer is far better
  // than the empty card this used to return.
  async function tryEnrich(ev: UfcEvent | null): Promise<UfcEvent | null> {
    if (!ev) return null;
    const raw = rawByEvent.get(ev.id);
    if (!raw || left() < 1200) return ev;
    try {
      return await Promise.race([
        enrichEvent(ev, raw),
        new Promise<UfcEvent>((resolve) => setTimeout(() => resolve(ev), Math.max(800, left()))),
      ]);
    } catch {
      return ev;
    }
  }

  const [enrichedPrev, enrichedNext] = await Promise.all([
    tryEnrich(previous),
    tryEnrich(upcoming),
  ]);

  return NextResponse.json(
    {
      previous: enrichedPrev,
      upcoming: enrichedNext,
      source: events.length ? "espn" : "none",
    } satisfies UfcPayload,
    { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" } },
  );
}
