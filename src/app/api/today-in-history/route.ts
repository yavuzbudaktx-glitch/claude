import { NextResponse } from "next/server";
import { fetchBritannicaFeaturedEvent } from "@/lib/britannica";

// Primary source for the daily fact is Britannica's "Featured Event" on
// britannica.com/on-this-day — it's hand-picked daily by editors and skews
// to the genuinely interesting (vs. Wikipedia's "selected", which can be
// uneven). We scrape Britannica's HTML once per day, then fall back to
// Wikipedia if the scrape comes back empty so the card never goes blank.
export const dynamic = "force-dynamic";

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

  // Primary: Britannica's hand-picked Featured Event.
  try {
    const britannica = await fetchBritannicaFeaturedEvent();
    if (britannica && britannica.title) {
      return NextResponse.json({
        date: `${mm}-${dd}`,
        year: britannica.year ?? null,
        text: britannica.title,
        summary: britannica.summary,
        kind: "featured",
        thumbnail: britannica.thumbnail,
        pageTitle: britannica.title,
        link: britannica.link,
      });
    }
  } catch {
    // Fall through to Wikipedia.
  }

  try {
    // Wikipedia "selected" is the curated set shown on the front page — the
    // same set Wikipedia editors call out as the most historically significant
    // events of the day. Used here as a backstop when Britannica scraping
    // returns nothing.
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
