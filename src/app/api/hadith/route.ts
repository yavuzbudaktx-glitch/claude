import { NextResponse } from "next/server";
import { dailyHadith } from "@/lib/hadith";
import { localDateKey } from "@/lib/local-date";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const param = url.searchParams.get("d") ?? "";
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : localDateKey();
  try {
    const hadith = dailyHadith(dateKey);
    return NextResponse.json(hadith);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "hadith_unavailable" },
      { status: 502 },
    );
  }
}
