// Random Wikipedia rabbithole — a genuinely random article with a preview
// (title, extract, thumbnail). No key. Each call returns a fresh one, so the
// client just re-fetches to roll again.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

interface WikiSummary {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

async function getJson(url: string): Promise<WikiSummary | null> {
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text[0] !== "{") continue;
      return JSON.parse(text) as WikiSummary;
    } catch { /* next */ }
  }
  return null;
}

export async function GET() {
  // Pull a few candidates and keep the first that has a decent extract — random
  // pages are often stubs/disambiguation, which make a poor preview.
  for (let i = 0; i < 5; i++) {
    const s = await getJson("https://en.wikipedia.org/api/rest_v1/page/random/summary");
    if (s && s.extract && (s.extract.length > 120) && s.type !== "disambiguation") {
      return NextResponse.json(
        {
          title: s.title ?? "",
          description: s.description ?? "",
          extract: s.extract ?? "",
          imageUrl: s.thumbnail?.source ?? s.originalimage?.source ?? "",
          pageUrl: s.content_urls?.desktop?.page ?? "",
          source: "Wikipedia",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  return NextResponse.json({ error: "no_article" }, { status: 502 });
}
