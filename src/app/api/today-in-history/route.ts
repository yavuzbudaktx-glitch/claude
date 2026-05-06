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
  events?: RawEvent[];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export async function GET() {
  const now = new Date();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());

  try {
    const res = await fetch(
      `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${mm}/${dd}`,
      {
        headers: {
          "User-Agent": "morning-dashboard/1.0 (personal use)",
          Accept: "application/json",
        },
        next: { revalidate: 86400 },
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `wikimedia ${res.status}` },
        { status: 502 },
      );
    }
    const json = (await res.json()) as RawResp;
    const events = (json.events ?? []).filter(
      (e): e is Required<Pick<RawEvent, "text" | "year">> & RawEvent =>
        typeof e.text === "string" && typeof e.year === "number",
    );
    if (events.length === 0) {
      return NextResponse.json({ error: "no_events" }, { status: 404 });
    }

    const start = Date.UTC(now.getUTCFullYear(), 0, 0);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const dayOfYear = Math.floor((today - start) / 86400000);
    const picked = events[dayOfYear % events.length];

    const firstPage = picked.pages?.find((p) => p.thumbnail?.source) ?? picked.pages?.[0];
    const link =
      firstPage?.content_urls?.desktop?.page ||
      firstPage?.content_urls?.mobile?.page ||
      null;

    return NextResponse.json({
      date: `${mm}-${dd}`,
      year: picked.year,
      text: picked.text,
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
