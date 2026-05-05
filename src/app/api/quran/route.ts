import { NextResponse } from "next/server";
import { fetchDailyAyah } from "@/lib/quran";

export const revalidate = 86400;

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
