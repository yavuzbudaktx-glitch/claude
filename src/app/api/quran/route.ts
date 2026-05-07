import { NextResponse } from "next/server";
import { fetchDailyAyah } from "@/lib/quran";

// Run dynamically so the verse picker sees the current UTC day each request.
// alquran.cloud responses are cached for an hour via the inner fetch.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ayah = await fetchDailyAyah();
    return NextResponse.json(ayah);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "quran_unavailable" },
      { status: 502 },
    );
  }
}
