// Wikipedia rabbit hole — but the GOOD kind. Instead of truly random (which
// is 90% obscure stubs), we pull Wikipedia's own curated daily feed: today's
// Featured Article + the day's most-read articles. Those are the things the
// world is actually reading and the editors chose to spotlight. ?r=N selects
// which one, so "Another" walks the pool.

import { NextResponse } from "next/server";

export const revalidate = 1800;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

interface WikiArticle {
  title?: string;
  titles?: { normalized?: string };
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
  type?: string;
}
interface FeaturedResp {
  tfa?: WikiArticle;
  mostread?: { articles?: WikiArticle[] };
}

async function getJson<T>(url: string): Promise<T | null> {
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
      return JSON.parse(text) as T;
    } catch { /* next */ }
  }
  return null;
}

function shape(a: WikiArticle) {
  return {
    title: a.titles?.normalized || a.title || "",
    description: a.description ?? "",
    extract: a.extract ?? "",
    imageUrl: a.thumbnail?.source ?? a.originalimage?.source ?? "",
    pageUrl: a.content_urls?.desktop?.page ?? "",
    source: "Wikipedia",
  };
}

export async function GET(req: Request) {
  const n = Number(new URL(req.url).searchParams.get("r") ?? "0") || 0;
  // Yesterday (UTC) — today's feed isn't always populated yet early in the day.
  const d = new Date(Date.now() - 18 * 60 * 60 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");

  const feed = await getJson<FeaturedResp>(
    `https://en.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`,
  );

  const pool: WikiArticle[] = [];
  if (feed?.tfa) pool.push(feed.tfa);
  for (const a of feed?.mostread?.articles ?? []) {
    if (a.extract && a.extract.length > 80 && a.type !== "disambiguation") pool.push(a);
  }

  if (pool.length === 0) {
    // Last resort: a random summary (rare).
    const s = await getJson<WikiArticle>("https://en.wikipedia.org/api/rest_v1/page/random/summary");
    if (s?.extract) return NextResponse.json(shape(s), { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "no_article" }, { status: 502 });
  }

  const pick = pool[((n % pool.length) + pool.length) % pool.length];
  return NextResponse.json(shape(pick), { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=7200" } });
}
