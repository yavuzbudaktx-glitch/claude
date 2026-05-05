import { NextResponse } from "next/server";
import { fetchAllFeeds } from "@/lib/feeds";

export const revalidate = 900;

export async function GET() {
  try {
    const grouped = await fetchAllFeeds(5);
    return NextResponse.json(grouped);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "news_unavailable" },
      { status: 502 },
    );
  }
}
