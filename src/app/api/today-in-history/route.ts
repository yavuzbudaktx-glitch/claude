import { NextResponse } from "next/server";
import dailyEvents from "@/data/daily-events.json";

// Daily "on this day" fact. Britannica's own site blocks every cloud
// IP (including Vercel and every public CORS proxy we tried with a
// 403), so instead of live-scraping we use a hand-curated dataset of
// ~80 globally significant dates keyed by MM-DD. For days not in the
// dataset we fall back to Wikipedia's editor-curated /feed/featured
// endpoint, then the older onthisday/selected feed.
export const dynamic = "force-dynamic";

interface CuratedEvent {
  year: number;
  title: string;
  summary: string;
  link?: string;
}
const CURATED: Record<string, CuratedEvent> = dailyEvents as Record<string, CuratedEvent>;

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

  // Primary: hand-curated MM-DD dataset of ~80 globally notable
  // historical events. Always wins when there's an entry for today.
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

  // Secondary: Wikipedia's editor-curated daily feed.
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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
