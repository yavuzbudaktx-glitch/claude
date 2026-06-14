// Wikipedia rabbit hole — high-quality articles only.
//
// Strategy, in this order:
//   (1) Wikipedia's "Today's Featured Article" — the SINGLE article editors
//       hand-pick to feature on the main page every day. It's curated for
//       interest by definition, and it's a different article daily.
//   (2) "On this day" article picks — the editor-selected pages tied to
//       today's historical events (these are reliably substantive).
//   (3) Random pick from Category:Featured articles, filtered to skip the
//       topics that aren't rabbit-holey for a personal dashboard (chemistry
//       compounds, individual military operations, baseball seasons, etc).
//
// `?d=` keys to the local day; `?r=N` bumps the seed for "Another" while
// keeping today's curated pick for the no-r case.

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

interface WikiSummary {
  type?: string;
  title?: string; titles?: { normalized?: string };
  description?: string; extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}
interface FeedResp { tfa?: WikiSummary; onthisday?: Array<{ pages?: WikiSummary[] }> }
interface CmResp { query?: { categorymembers?: Array<{ title?: string; ns?: number }> }; continue?: { cmcontinue?: string } }

// Skip Featured Articles whose titles match this — they're vetted but dull
// for a personal dashboard. (Battles / sports seasons / single-element pages
// have the highest density of Featured Articles and are the lowest density
// of "something I'd want to read on a Tuesday morning".)
const BORING_PATTERN = /^(battle of|operation |\d{4}.*(season|championship|world series|super bowl|stanley cup|nba finals|grand prix|formula one|fa cup)|election\b|.*-class (destroyer|submarine|frigate|cruiser|battleship)|.* coin\b|hms |uss |ss .* \(ship|hurricane .* \(|tropical storm|category:|list of)/i;

function shape(a: WikiSummary, sourceLabel = "Wikipedia"): {
  title: string; description: string; extract: string;
  imageUrl: string; pageUrl: string; source: string;
} {
  const title = a.titles?.normalized || a.title || "";
  return {
    title,
    description: a.description ?? "",
    extract: a.extract ?? "",
    imageUrl: a.originalimage?.source ?? a.thumbnail?.source ?? "",
    pageUrl: a.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    source: sourceLabel,
  };
}

function isWorthwhile(a: WikiSummary | null | undefined): a is WikiSummary {
  if (!a) return false;
  if (a.type === "disambiguation") return false;
  const title = a.titles?.normalized || a.title || "";
  if (!title || BORING_PATTERN.test(title)) return false;
  if (!a.extract || a.extract.length < 300) return false;
  if (!(a.originalimage?.source || a.thumbnail?.source)) return false;
  return true;
}

// ---- Featured-Articles pool (cached for a week) ---------------------------
let poolCache: { at: number; titles: string[] } | null = null;
const POOL_TTL = 1000 * 60 * 60 * 24 * 7;

async function getFeaturedTitles(): Promise<string[]> {
  if (poolCache && Date.now() - poolCache.at < POOL_TTL && poolCache.titles.length > 1000) {
    return poolCache.titles;
  }
  const out: string[] = [];
  let cmcontinue: string | undefined;
  for (let i = 0; i < 14; i++) {
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&list=categorymembers" +
      "&cmtitle=Category%3AFeatured+articles&cmtype=page&cmlimit=500&format=json&origin=*" +
      (cmcontinue ? `&cmcontinue=${encodeURIComponent(cmcontinue)}` : "");
    const j = await getJson<CmResp>(url);
    if (!j) break;
    for (const m of j.query?.categorymembers ?? []) {
      if (m.ns === 0 && m.title && !BORING_PATTERN.test(m.title)) out.push(m.title);
    }
    cmcontinue = j.continue?.cmcontinue;
    if (!cmcontinue) break;
  }
  if (out.length > 1000) poolCache = { at: Date.now(), titles: out };
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  // (1) When the user hasn't asked for "Another", serve Today's Featured
  //     Article — the single curated pick.
  if (!refresh) {
    const d = new Date(dateKey + "T00:00:00Z");
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const feed = await getJson<FeedResp>(`https://en.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`);
    if (feed?.tfa && isWorthwhile(feed.tfa)) {
      return NextResponse.json(shape(feed.tfa, "Wikipedia · Today's Featured Article"), {
        headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" },
      });
    }
    // (2) Fallback to a substantive "on this day" article.
    for (const ev of feed?.onthisday ?? []) {
      for (const p of ev.pages ?? []) {
        if (isWorthwhile(p)) {
          return NextResponse.json(shape(p, "Wikipedia · On this day"), {
            headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" },
          });
        }
      }
    }
  }

  // (3) "Another" or feed unavailable — random Featured Article.
  const titles = await getFeaturedTitles();
  if (titles.length === 0) {
    return NextResponse.json({ error: "no_pool" }, { status: 502 });
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const idx = seedIdx(`${dateKey}:fa:${refresh}:${attempt}`, titles.length);
    const t = titles[idx];
    if (BORING_PATTERN.test(t)) continue;
    const s = await getJson<WikiSummary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, "_"))}`,
    );
    if (isWorthwhile(s)) {
      return NextResponse.json(shape(s!, "Wikipedia · Featured Article"), {
        headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" },
      });
    }
  }
  return NextResponse.json({ error: "no_article" }, { status: 502 });
}
