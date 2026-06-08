import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import dailyEvents from "@/data/daily-events.json";
import { extractFeaturedEvent, isPlausibleFeaturedEvent } from "@/lib/britannica-extract";

// Daily "on this day" fact, in priority order:
//   1. Britannica's actual Featured Event for today, scraped daily by a
//      GitHub Action and committed to public/data/featured-event.json.
//   2. A hand-curated MM-DD dataset of ~80 globally significant dates.
//   3. Wikipedia's editor-picked feed/featured/onthisday[0].
//   4. The older onthisday/selected feed as a final fallback.
export const dynamic = "force-dynamic";

interface CuratedEvent {
  year: number;
  title: string;
  summary: string;
  link?: string;
}
const CURATED: Record<string, CuratedEvent> = dailyEvents as Record<string, CuratedEvent>;

interface BritannicaFile {
  date: string;
  year: number | null;
  title: string;
  summary: string;
  link?: string | null;
  generatedAt?: string;
  sourceUrl?: string;
}

async function readBritannicaFile(): Promise<BritannicaFile | null> {
  try {
    const filePath = path.join(process.cwd(), "public", "data", "featured-event.json");
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as BritannicaFile;
  } catch {
    return null;
  }
}

// Server-side Britannica fetch — used when the committed file is stale
// (GitHub Actions runs are best-effort and routinely delay 5-12 hours; the
// scrape can also fail on heavy bot-detection days). Britannica blocks
// Vercel's egress IPs, so we route through a small chain of public CORS
// proxies that sit on residential / consumer IP ranges.
const MONTH_SLUGS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
async function fetchBritannicaLive(mm: string, dd: string): Promise<BritannicaFile | null> {
  const month = MONTH_SLUGS[Number(mm) - 1];
  const day = String(Number(dd));
  const url = `https://www.britannica.com/on-this-day/${month}-${day}`;
  const tries = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, {
        signal: AbortSignal.timeout(9000),
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
          Accept: "text/html",
        },
      });
      if (!r.ok) continue;
      const html = await r.text();
      if (!html || html.length < 4000) continue;
      const ev = extractFeaturedEvent(html);
      if (ev && isPlausibleFeaturedEvent(ev) && ev.title && ev.summary) {
        return {
          date: `${mm}-${dd}`,
          year: ev.year ?? null,
          title: ev.title,
          summary: ev.summary,
          link: ev.link ?? url,
          sourceUrl: url,
          generatedAt: new Date().toISOString(),
        };
      }
    } catch { /* next proxy */ }
  }
  return null;
}

interface RawPage {
  type?: string;
  title?: string;
  normalizedtitle?: string;
  content_urls?: { desktop?: { page?: string }; mobile?: { page?: string } };
  thumbnail?: { source?: string };
  description?: string;
  extract?: string;
}

interface RawEvent {
  text?: string;
  year?: number;
  pages?: RawPage[];
}

interface RawResp {
  selected?: RawEvent[];
  events?: RawEvent[];
  births?: RawEvent[];
  deaths?: RawEvent[];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseDateParam(d: string | null): Date {
  if (d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (m) {
      // Anchor the local-day at noon UTC so day-of-year math is unambiguous.
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
    }
  }
  return new Date();
}

async function fetchFeed(kind: "selected" | "events" | "births" | "deaths", mm: string, dd: string) {
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/${kind}/${mm}/${dd}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "morning-dashboard/1.0 (personal use)",
      Accept: "application/json",
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [] as RawEvent[];
  const json = (await res.json()) as RawResp;
  return (
    (json.selected ?? json.events ?? json.births ?? json.deaths ?? [])
      .filter(
        (e): e is Required<Pick<RawEvent, "text" | "year">> & RawEvent =>
          typeof e.text === "string" && typeof e.year === "number",
      )
  );
}

// The "extract" field comes back as a single paragraph from Wikipedia. Trim it
// to a short, dashboard-friendly first sentence (or two) and strip any trailing
// pronunciation parens that come right after the subject's name.
function shortenExtract(extract: string | undefined): string | null {
  if (!extract) return null;
  let t = extract.trim();
  // Strip Wikipedia's "(/pronunciation/; foreign-script meaning)" parenthetical.
  t = t.replace(/\s*\([^)]*\)/, "");
  // Take up to two sentences, capped at ~220 chars so the card stays compact.
  const sentences = t.match(/[^.!?]+[.!?]+/g) ?? [t];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > 220) break;
    out += s;
  }
  out = (out || t).trim();
  if (out.length > 240) out = out.slice(0, 237).trimEnd() + "…";
  return out || null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dParam = url.searchParams.get("d");
  const dateAt = parseDateParam(dParam);

  const mm = pad(dateAt.getUTCMonth() + 1);
  const dd = pad(dateAt.getUTCDate());
  const yyyy = dateAt.getUTCFullYear();

  // Primary: the actual Britannica Featured Event for today.
  // First try the file committed by the daily GitHub Action (fastest, no
  // network); if the file is stale (workflow hasn't landed today's run
  // yet — GitHub's cron is best-effort and routinely delays 5-12h),
  // scrape Britannica live through a proxy chain.
  let britannica = await readBritannicaFile();
  if (!britannica || britannica.date !== `${mm}-${dd}`) {
    const fresh = await fetchBritannicaLive(mm, dd);
    if (fresh) britannica = fresh;
  }
  if (britannica && britannica.date === `${mm}-${dd}` && britannica.title && britannica.summary) {
    return NextResponse.json({
      date: `${mm}-${dd}`,
      year: britannica.year ?? null,
      text: britannica.title,
      summary: britannica.summary,
      kind: "featured",
      source: "britannica",
      thumbnail: null,
      pageTitle: britannica.title,
      link: britannica.link ?? britannica.sourceUrl ?? null,
    });
  }

  // Secondary: Wikipedia's editor-curated daily feed.
  // (Reordered so Wikipedia outranks the curated dataset — Wikipedia always
  // returns FRESH content, the curated dataset is the same one-of-80 entry
  // we shipped with the codebase. Curated stays as the last-resort sane
  // default so we never 404.)
  try {
    interface FeedFeaturedPage {
      type?: string;
      title?: string;
      normalizedtitle?: string;
      extract?: string;
      description?: string;
      content_urls?: { desktop?: { page?: string }; mobile?: { page?: string } };
      thumbnail?: { source?: string };
    }
    interface FeedFeaturedEvent { text?: string; year?: number; pages?: FeedFeaturedPage[] }
    interface FeedFeaturedResp {
      tfa?: FeedFeaturedPage;
      onthisday?: FeedFeaturedEvent[];
    }
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`,
      {
        headers: {
          "User-Agent": "morning-dashboard/1.0 (personal use)",
          Accept: "application/json",
        },
        next: { revalidate: 3600 },
      },
    );
    if (res.ok) {
      const json = (await res.json()) as FeedFeaturedResp;
      const event = json.onthisday?.find((e) => e.text && e.pages && e.pages.length > 0);
      const page =
        event?.pages?.find((p) => p.extract && p.thumbnail?.source) ??
        event?.pages?.find((p) => p.extract) ??
        event?.pages?.[0];
      if (event?.year && page?.extract) {
        return NextResponse.json({
          date: `${mm}-${dd}`,
          year: event.year,
          text: event.text ?? page.normalizedtitle ?? page.title ?? "",
          summary: shortenExtract(page.extract) ?? page.description ?? null,
          kind: "featured",
          source: "wikipedia-featured",
          thumbnail: page.thumbnail?.source ?? null,
          pageTitle: page.normalizedtitle ?? page.title ?? null,
          link: page.content_urls?.desktop?.page ?? page.content_urls?.mobile?.page ?? null,
        });
      }
      // No onthisday entries? Use today's featured article instead.
      const tfa = json.tfa;
      if (tfa?.extract && (tfa.normalizedtitle || tfa.title)) {
        return NextResponse.json({
          date: `${mm}-${dd}`,
          year: null,
          text: tfa.normalizedtitle ?? tfa.title ?? "",
          summary: shortenExtract(tfa.extract) ?? tfa.description ?? null,
          kind: "featured",
          source: "wikipedia-featured",
          thumbnail: tfa.thumbnail?.source ?? null,
          pageTitle: tfa.normalizedtitle ?? tfa.title ?? null,
          link: tfa.content_urls?.desktop?.page ?? tfa.content_urls?.mobile?.page ?? null,
        });
      }
    }
  } catch {
    // Final fallback below.
  }

  try {
    // Last-resort: the older Wikimedia "onthisday/selected" feed.
    let pool = await fetchFeed("selected", mm, dd);
    let kind: "selected" | "events" | "births" | "deaths" = "selected";

    const start = Date.UTC(dateAt.getUTCFullYear(), 0, 0);
    const today = Date.UTC(dateAt.getUTCFullYear(), dateAt.getUTCMonth(), dateAt.getUTCDate());
    const dayOfYear = Math.floor((today - start) / 86400000);

    // Rotate kinds across days so we sometimes get "Einstein's birthday" entries.
    if (dayOfYear % 3 === 1) {
      const births = await fetchFeed("births", mm, dd);
      if (births.length > 0) { pool = births; kind = "births"; }
    } else if (dayOfYear % 3 === 2) {
      const deaths = await fetchFeed("deaths", mm, dd);
      if (deaths.length > 0) { pool = deaths; kind = "deaths"; }
    }

    if (pool.length === 0) {
      pool = await fetchFeed("events", mm, dd);
      kind = "events";
    }
    if (pool.length === 0) {
      return NextResponse.json({ error: "no_events" }, { status: 404 });
    }

    const picked = pool[dayOfYear % pool.length];
    const firstPage = picked.pages?.find((p) => p.thumbnail?.source) ?? picked.pages?.[0];
    const link =
      firstPage?.content_urls?.desktop?.page ||
      firstPage?.content_urls?.mobile?.page ||
      null;

    let prefix = "";
    if (kind === "births") prefix = "Born: ";
    else if (kind === "deaths") prefix = "Died: ";

    return NextResponse.json({
      date: `${mm}-${dd}`,
      year: picked.year,
      text: prefix + picked.text,
      summary: shortenExtract(firstPage?.extract) ?? firstPage?.description ?? null,
      kind,
      source: "wikipedia",
      thumbnail: firstPage?.thumbnail?.source ?? null,
      pageTitle: firstPage?.normalizedtitle ?? firstPage?.title ?? null,
      link,
    });
  } catch (e) {
    // Final-final fallback: the curated dataset if today's date is in it,
    // otherwise a 502 with the error. The curated entry is stale but at
    // least the card is never empty.
    const curated = CURATED[`${mm}-${dd}`];
    if (curated) {
      return NextResponse.json({
        date: `${mm}-${dd}`,
        year: curated.year,
        text: curated.title,
        summary: curated.summary,
        kind: "featured",
        source: "curated",
        thumbnail: null,
        pageTitle: curated.title,
        link: curated.link ?? null,
      });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
