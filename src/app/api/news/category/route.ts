import { NextResponse } from "next/server";
import { fetchCategoryFeeds, CATEGORY_ORDER, type NewsCategory } from "@/lib/feeds";

// Always fresh — this backs the manual per-tab refresh button, so it must
// never serve a cached response.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const c = new URL(req.url).searchParams.get("c") as NewsCategory | null;
    if (!c || !CATEGORY_ORDER.includes(c)) {
      return NextResponse.json({ error: "bad_category" }, { status: 400 });
    }
    const items = await fetchCategoryFeeds(c, 30, 6);
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "news_unavailable" },
      { status: 502 },
    );
  }
}
