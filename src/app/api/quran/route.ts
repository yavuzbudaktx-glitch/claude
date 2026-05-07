import { NextResponse } from "next/server";
import { fetchDailyAyah } from "@/lib/quran";

// Run dynamically so the verse picker sees the date the client is on.
// alquran.cloud responses are cached for an hour via the inner fetch.
export const dynamic = "force-dynamic";

function parseDateParam(d: string | null): Date {
  if (d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (m) {
      // Anchor at noon UTC so day-of-year math is unambiguous regardless of TZ.
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
    }
  }
  return new Date();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = parseDateParam(url.searchParams.get("d"));
  try {
    const ayah = await fetchDailyAyah(date);
    return NextResponse.json(ayah);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "quran_unavailable" },
      { status: 502 },
    );
  }
}
