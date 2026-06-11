// Internet Archive — one OLD CARTOON per day. Cartoon collections only,
// hard-limited to items dated before 2004, restricted to actual film items
// (mediatype:movies — the umbrella collection otherwise returns its own
// sub-collection pages as the top "downloads" hits, which is why the tab
// went blank/garbage). Daily seeded; ?r=N salts for "Another".

import { NextResponse } from "next/server";

export const revalidate = 3600;
export const maxDuration = 30;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// Cartoon shelves, most-specific first. We walk down the list if a query
// returns nothing (a single collection can be throttled on a given day).
const COLLECTIONS = [
  "more_animation",          // the classic_cartoons successor shelf
  "animationandcartoons",    // the big umbrella (~50k items)
  "classic_cartoons",
];

interface IADoc { identifier?: string; title?: string; mediatype?: string; year?: string; description?: string | string[] }
interface IAResp { response?: { docs?: IADoc[] } }

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

async function getJson(url: string): Promise<IAResp | null> {
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(12000), cache: "no-store" });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text[0] !== "{") continue;
      return JSON.parse(text) as IAResp;
    } catch { /* next */ }
  }
  return null;
}

async function search(collection: string, withYearFilter: boolean): Promise<IADoc[]> {
  const fields = "identifier,title,mediatype,year";
  // mediatype:movies keeps us on actual films (the umbrella collection's
  // top-by-downloads docs are otherwise its own SUB-COLLECTIONS).
  const q = withYearFilter
    ? `collection:${collection} AND mediatype:movies AND year:[1900 TO 2003]`
    : `collection:${collection} AND mediatype:movies`;
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
    `&fl[]=${fields.split(",").join("&fl[]=")}&rows=300&output=json&sort[]=downloads+desc`;
  const j = await getJson(url);
  return (j?.response?.docs ?? []).filter((d) => {
    if (!d.identifier) return false;
    if (d.mediatype && d.mediatype !== "movies") return false;
    // HARD pre-2004 rule, even on the no-year-filter fallback: items without
    // a year field at all are allowed (most early cartoons), anything 2004+
    // is dropped.
    const y = parseInt(String(d.year ?? ""), 10);
    return !Number.isFinite(y) || y < 2004;
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  for (const collection of COLLECTIONS) {
    // Year-filtered query first; if the Archive chokes on the range query,
    // retry the same collection without it (client filter still enforces
    // pre-2004).
    let docs = await search(collection, true);
    if (docs.length === 0) docs = await search(collection, false);
    if (docs.length === 0) continue;

    const idx = seedIdx(dateKey + ":pick:" + refresh, docs.length);
    const d = docs[idx];
    return NextResponse.json(
      {
        identifier: d.identifier,
        title: d.title || d.identifier,
        mediatype: d.mediatype || "",
        year: d.year || "",
        description: "",
        imageUrl: `https://archive.org/services/img/${d.identifier}`,
        pageUrl: `https://archive.org/details/${d.identifier}`,
        source: "Internet Archive",
        collection,
      },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
    );
  }
  return NextResponse.json({ error: "no_item" }, { status: 502 });
}
