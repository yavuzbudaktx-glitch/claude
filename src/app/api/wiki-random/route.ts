// Wikipedia "rabbit hole" — Featured Articles only.
//
// Random Wikipedia is 90% stubs. Wikipedia's *Featured Articles* are the
// ~6,000 articles editors have explicitly vetted as the best on the site
// (they get a tiny gold-star icon and went through formal review). Every
// one of them is comprehensive, well-illustrated, and interesting — the
// exact "rabbit hole" feeling without the noise.
//
// We pull the full list of Featured Article titles (paginated, ~500 per
// page through the categorymembers API), cache it for a week, then pick
// deterministically per day. `?r=N` bumps to a different one for "Another".

import { NextResponse } from "next/server";

export const revalidate = 3600;
export const maxDuration = 30;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
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

interface CmResp {
  query?: { categorymembers?: Array<{ title?: string; ns?: number }> };
  continue?: { cmcontinue?: string };
}

let poolCache: { at: number; titles: string[] } | null = null;
const POOL_TTL = 1000 * 60 * 60 * 24 * 7; // one week

async function getFeaturedTitles(): Promise<string[]> {
  if (poolCache && Date.now() - poolCache.at < POOL_TTL && poolCache.titles.length > 1000) {
    return poolCache.titles;
  }
  const out: string[] = [];
  let cmcontinue: string | undefined;
  // Walk up to ~14 pages of 500 = 7000 titles (covers the entire category
  // with a little headroom).
  for (let i = 0; i < 14; i++) {
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&list=categorymembers" +
      "&cmtitle=Category%3AFeatured+articles&cmtype=page&cmlimit=500&format=json&origin=*" +
      (cmcontinue ? `&cmcontinue=${encodeURIComponent(cmcontinue)}` : "");
    const j = await getJson<CmResp>(url);
    if (!j) break;
    for (const m of j.query?.categorymembers ?? []) {
      if (m.ns === 0 && m.title) out.push(m.title);
    }
    cmcontinue = j.continue?.cmcontinue;
    if (!cmcontinue) break;
  }
  if (out.length > 1000) poolCache = { at: Date.now(), titles: out };
  return out;
}

interface WikiSummary {
  title?: string;
  titles?: { normalized?: string };
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "0";

  const titles = await getFeaturedTitles();
  if (titles.length === 0) {
    return NextResponse.json({ error: "no_pool" }, { status: 502 });
  }

  // Walk a small window of candidates so a featured article whose summary
  // endpoint blips doesn't break the tab.
  for (let attempt = 0; attempt < 5; attempt++) {
    const idx = seedIdx(`${dateKey}:fa:${refresh}:${attempt}`, titles.length);
    const title = titles[idx];
    const s = await getJson<WikiSummary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    );
    if (s && s.extract && s.extract.length > 200) {
      return NextResponse.json(
        {
          title: s.titles?.normalized || s.title || title,
          description: s.description ?? "",
          extract: s.extract,
          imageUrl: s.originalimage?.source ?? s.thumbnail?.source ?? "",
          pageUrl: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
          source: "Wikipedia · Featured Article",
        },
        { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
      );
    }
  }
  return NextResponse.json({ error: "no_article" }, { status: 502 });
}
