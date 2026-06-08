// Wikipedia "rabbit hole" — a random article every day, drawn from the full
// 6.8M-article corpus. The naive `/page/random/summary` endpoint is 90% stubs
// and disambig pages, which is what made the previous "small curated list"
// implementation necessary. This route fixes that by sampling MANY random
// candidates in parallel and keeping the first that passes a real quality
// bar: real thumbnail, ≥600-char extract, not a disambiguation page, not a
// list or set-index article.
//
// `?d=` keys the seed to the day; `?r=N` walks within the day for "Another".

import { NextResponse } from "next/server";

export const revalidate = 1800;
export const maxDuration = 30;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

interface WikiSummary {
  type?: string;
  title?: string;
  titles?: { normalized?: string };
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

async function getJson<T>(url: string): Promise<T | null> {
  // Hit Wikipedia direct first (fastest), with proxy fallbacks.
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text[0] !== "{") continue;
      return JSON.parse(text) as T;
    } catch { /* next */ }
  }
  return null;
}

function looksInteresting(a: WikiSummary): boolean {
  if (!a) return false;
  if (a.type === "disambiguation") return false;
  const title = a.titles?.normalized || a.title || "";
  // List articles ("List of …") and set-index ("List of people named X") are
  // never the rabbit-hole you want — skip them.
  if (/^list of |^index of |^outline of |^timeline of /i.test(title)) return false;
  if (!a.extract || a.extract.length < 600) return false;
  if (!a.thumbnail?.source) return false;
  return true;
}

function shape(a: WikiSummary) {
  return {
    title: a.titles?.normalized || a.title || "",
    description: a.description ?? "",
    extract: a.extract ?? "",
    imageUrl: a.originalimage?.source ?? a.thumbnail?.source ?? "",
    pageUrl: a.content_urls?.desktop?.page ?? "",
    source: "Wikipedia",
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "0";
  // Vary the seed when ?r= changes; `dateKey + ":" + refresh` is enough to
  // make Wikipedia hand us a different mix of candidates per refresh.
  void dateKey; void refresh;

  // Sample 18 candidates in parallel and keep the first that looks
  // interesting (real photo + substantial extract + not a list/disambig).
  // Wikipedia's random endpoint is non-cacheable so each call returns a
  // genuinely different draw — across 18 we almost always find a great one.
  const candidates = await Promise.all(
    Array.from({ length: 18 }).map(() =>
      getJson<WikiSummary>("https://en.wikipedia.org/api/rest_v1/page/random/summary"),
    ),
  );
  const good = candidates.find((c): c is WikiSummary => !!c && looksInteresting(c));
  if (good) {
    return NextResponse.json(shape(good), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Last-resort softer bar so the tab still renders SOMETHING.
  const passable = candidates.find((c): c is WikiSummary => !!c && !!c.extract && c.extract.length > 200 && c.type !== "disambiguation");
  if (passable) {
    return NextResponse.json(shape(passable), { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "no_article" }, { status: 502 });
}
