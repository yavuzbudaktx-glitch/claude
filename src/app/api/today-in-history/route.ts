import { NextResponse } from "next/server";

export const revalidate = 86400;

interface RawPage {
  type?: string;
  title?: string;
  normalizedtitle?: string;
  content_urls?: { desktop?: { page?: string }; mobile?: { page?: string } };
  thumbnail?: { source?: string };
  description?: string;
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

async function fetchFeed(kind: "selected" | "events" | "births" | "deaths", mm: string, dd: string) {
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/${kind}/${mm}/${dd}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "morning-dashboard/1.0 (personal use)",
      Accept: "application/json",
    },
    next: { revalidate: 86400 },
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

export async function GET() {
  const now = new Date();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());

  try {
    // Wikipedia "selected" is the curated set shown on the front page —
    // the same one Wikipedia editors pick out as the most historically
    // significant events of the day.
    let pool = await fetchFeed("selected", mm, dd);
    let kind: "selected" | "events" | "births" | "deaths" = "selected";

    // Mix in births/deaths every 3rd day so we sometimes get "Einstein's birthday" type entries.
    const start = Date.UTC(now.getUTCFullYear(), 0, 0);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const dayOfYear = Math.floor((today - start) / 86400000);

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
