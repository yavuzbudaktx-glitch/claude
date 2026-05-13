import { NextResponse } from "next/server";
import { fetchDailyHadith } from "@/lib/hadith";

export const dynamic = "force-dynamic";

function parseDateParam(d: string | null): Date {
  if (d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
  }
  return new Date();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = parseDateParam(url.searchParams.get("d"));
  try {
    const hadith = await fetchDailyHadith(date);
    return NextResponse.json(hadith);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "hadith_unavailable" },
      { status: 502 },
    );
  }
}
