// Community feed for the Accounting page — "hot" across several
// accounting/CPA subreddits.
//
// Data strategy, best → fallback:
//   1. Reddit OAuth (app-only) if REDDIT_CLIENT_ID/SECRET are set — the
//      reliable path: real scores, upvote ratio, preview images, hot order.
//   2. Public .json through a proxy chain (Reddit 403s bare datacenter IPs).
//   3. RSS via rss-parser — always works, preserves hot order, image pulled
//      from the post HTML, but no score/ratio.
//
// Posts keep each subreddit's hot order and are interleaved round-robin, so
// the top of the list is the #1 hot from each sub — quality over quantity.

import { NextResponse } from "next/server";
import Parser from "rss-parser";

// Force-dynamic + 0 revalidate so the refresh button truly re-fetches every
// time — Next's own data cache used to swallow the request even when the
// client sent a fresh URL with a nonce.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUBS = ["CPA", "Accounting", "Big4", "tax", "Bookkeeping"];
// Return a deep pool so a single-sub filter still has plenty to show and the
// client can rotate through fresh posts on refresh.
const MAX = 70;

const UA = "web:brief-dashboard:v1.0 (Accounting community feed)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

interface Post {
  id: string;
  title: string;
  subreddit: string;
  permalink: string;
  score: number;
  ratio: number;        // upvote ratio 0..1 (0 = unknown)
  comments: number;
  created: number;
  flair: string | null;
  author: string;
  image: string | null; // preview thumbnail
}

const DEAD = /^\[(removed|deleted|removed by reddit)\]$/i;

function decodeAmp(u: string): string {
  return u.replace(/&amp;/g, "&");
}

// -------- proxy fetch -------------------------------------------------------

function proxies(url: string): string[] {
  // We also rotate through old.reddit.com (which lives on its own rate-limit
  // bucket from www.reddit.com — so when www is throttling cloud egress,
  // old.* often still answers) and through Reddit's `.json` endpoint on the
  // safe-search subdomain.
  const oldUrl = url.replace("://www.reddit.com", "://old.reddit.com");
  const npUrl  = url.replace("://www.reddit.com", "://np.reddit.com");
  return [
    url,
    oldUrl,
    npUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(oldUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(oldUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(oldUrl)}`,
  ];
}
async function fetchText(url: string, headers: Record<string, string>): Promise<string | null> {
  for (const c of proxies(url)) {
    try {
      const res = await fetch(c, { headers, signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 80) return text;
    } catch {
      // next
    }
  }
  return null;
}

// -------- OAuth (optional) --------------------------------------------------

let token: { value: string; exp: number } | null = null;
async function getToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (token && token.exp > Date.now() + 10_000) return token.value;
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return token.value;
  } catch {
    return null;
  }
}

// -------- JSON path ---------------------------------------------------------

interface RedditChild { data?: Record<string, unknown> }
interface RedditListing { data?: { children?: RedditChild[] } }
function str(o: Record<string, unknown>, k: string): string { const v = o[k]; return typeof v === "string" ? v : ""; }
function nm(o: Record<string, unknown>, k: string): number { const v = o[k]; return typeof v === "number" ? v : 0; }

function imageFromJson(d: Record<string, unknown>): string | null {
  // gallery
  const mm = d.media_metadata as Record<string, { s?: { u?: string }; p?: Array<{ u?: string }> }> | undefined;
  if (mm) {
    const first = Object.values(mm)[0];
    const u = first?.s?.u ?? first?.p?.[first.p.length - 1]?.u;
    if (u) return decodeAmp(u);
  }
  // preview
  const preview = d.preview as { images?: Array<{ source?: { url?: string }; resolutions?: Array<{ url?: string }> }> } | undefined;
  const img = preview?.images?.[0];
  if (img) {
    const res = img.resolutions ?? [];
    const mid = res[Math.min(res.length - 1, 2)]?.url ?? img.source?.url;
    if (mid) return decodeAmp(mid);
  }
  // direct image url
  const url = str(d, "url_overridden_by_dest") || str(d, "url");
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) return url;
  // thumbnail (skip the placeholder values)
  const thumb = str(d, "thumbnail");
  if (/^https?:\/\//.test(thumb)) return thumb;
  return null;
}

function mapJson(listing: RedditListing, sub: string): Post[] {
  return (listing?.data?.children ?? [])
    .map((c) => c.data)
    .filter((d): d is Record<string, unknown> =>
      !!d && !d.stickied && !d.over_18 && typeof d.title === "string" && !DEAD.test(d.title as string))
    .map((d) => ({
      id: str(d, "id"),
      title: str(d, "title"),
      subreddit: str(d, "subreddit") || sub,
      permalink: `https://www.reddit.com${str(d, "permalink")}`,
      score: nm(d, "score"),
      ratio: nm(d, "upvote_ratio"),
      comments: nm(d, "num_comments"),
      created: nm(d, "created_utc") * 1000,
      flair: (typeof d.link_flair_text === "string" && d.link_flair_text) || null,
      author: str(d, "author"),
      image: imageFromJson(d),
    }))
    .filter((p) => p.id && p.title);
}

// "Best" on a sub = top-of-week — Reddit's "best" listing is only available
// for the homepage. Top-of-week + sort-by-score gives the highest-quality
// posts the community has surfaced lately, which is what the user wants.
const SORT = "top";
const PERIOD = "week";

async function fetchSubJson(sub: string): Promise<Post[] | null> {
  // OAuth first
  const t = await getToken();
  if (t) {
    try {
      const res = await fetch(`https://oauth.reddit.com/r/${sub}/${SORT}?t=${PERIOD}&limit=20&raw_json=1`, {
        headers: { Authorization: `Bearer ${t}`, "User-Agent": UA },
        signal: AbortSignal.timeout(9000),
        cache: "no-store",
      });
      if (res.ok) {
        const j = (await res.json()) as RedditListing;
        const posts = mapJson(j, sub);
        if (posts.length) return posts;
      }
    } catch {
      // fall through to proxies
    }
  }
  // public json via proxy chain
  const url = `https://www.reddit.com/r/${sub}/${SORT}.json?t=${PERIOD}&limit=20&raw_json=1`;
  const text =
    (await fetchText(url, { "User-Agent": UA, Accept: "application/json" })) ??
    (await fetchText(url, { "User-Agent": BROWSER_UA, Accept: "application/json" }));
  if (!text || text[0] !== "{") return null;
  try {
    const posts = mapJson(JSON.parse(text) as RedditListing, sub);
    return posts.length ? posts : null;
  } catch {
    return null;
  }
}

// -------- RSS fallback ------------------------------------------------------

interface RssItem {
  title?: string; link?: string; id?: string; isoDate?: string; pubDate?: string;
  creator?: string; ["dc:creator"]?: string; content?: string; ["content:encoded"]?: string;
}
const rssParser = new Parser<{}, RssItem>({
  timeout: 9000,
  headers: { "User-Agent": UA, Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml" },
  customFields: { item: [["content:encoded", "content:encoded"], ["dc:creator", "dc:creator"]] },
});
function imageFromHtml(html: string): string | null {
  if (!html) return null;
  const m = /<img[^>]+src="([^"]+)"/i.exec(html);
  if (m && /^https?:\/\//.test(m[1]) && !/award|emoji|icon/i.test(m[1])) return decodeAmp(m[1]);
  const a = /<a[^>]+href="(https?:\/\/(?:i\.redd\.it|i\.imgur\.com|preview\.redd\.it)[^"]+)"/i.exec(html);
  if (a) return decodeAmp(a[1]);
  return null;
}
function commentsFromHtml(html: string): number {
  const m = /(\d[\d,]*)\s+comments?/i.exec(html);
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}
async function fetchSubRss(sub: string): Promise<Post[]> {
  const url = `https://www.reddit.com/r/${sub}/${SORT}/.rss?t=${PERIOD}&limit=20`;
  let feed: Awaited<ReturnType<typeof rssParser.parseURL>> | null = null;
  try {
    feed = await rssParser.parseURL(url);
  } catch {
    const xml = await fetchText(url, { "User-Agent": UA, Accept: "application/atom+xml, application/xml" });
    if (xml) { try { feed = await rssParser.parseString(xml); } catch { feed = null; } }
  }
  if (!feed) return [];
  return (feed.items ?? [])
    .map((it) => {
      const html = it["content:encoded"] || it.content || "";
      const link = it.link ?? "";
      const id = (it.id ?? "").replace(/^t3_/, "") || /comments\/([a-z0-9]+)/.exec(link)?.[1] || link;
      return {
        id,
        title: (it.title ?? "").trim(),
        subreddit: sub,
        permalink: link || `https://www.reddit.com/r/${sub}/`,
        score: 0,
        ratio: 0,
        comments: commentsFromHtml(html),
        created: it.isoDate ? +new Date(it.isoDate) : it.pubDate ? +new Date(it.pubDate) : Date.now(),
        flair: null,
        author: (it["dc:creator"] || it.creator || "").replace(/^\/?u\//, ""),
        image: imageFromHtml(html),
      };
    })
    .filter((p) => p.id && p.title && !DEAD.test(p.title));
}

// -------- handler -----------------------------------------------------------

interface Payload { posts: Post[]; subs: string[]; sort: string; period: string }

// Warm snapshot. The live fetch hits 5 subreddits through OAuth/proxy chains,
// which can take several seconds — far too slow to run on every page load when
// the content barely changes hour to hour. We keep the last good result in
// memory and serve it instantly; the slow path only runs when the snapshot is
// stale or the user explicitly forces a refresh (the client adds ?n=… then).
let snapshot: { at: number; data: Payload } | null = null;
const SNAP_TTL = 1000 * 60 * 20;             // 20 min — fast path
// HARD ceiling: never serve a snapshot older than this, even if every
// upstream is failing. Without this, the "keep last good snapshot if
// upstream returns 0 posts" branch (below) would serve days-old data
// indefinitely whenever Reddit's API was flaky — exactly the "Reddit
// hasn't updated in days" symptom.
const SNAP_HARD_MAX = 1000 * 60 * 60 * 6;    // 6h hard expiry
const CDN_CACHE = "public, s-maxage=1200, stale-while-revalidate=3600";

// Per-sub fetch with retries: JSON → RSS → JSON-after-pause → RSS-after-pause.
// Without retries, transient proxy throttles / Reddit 429s leave entire subs
// empty for the whole snapshot window, which is the "only 1-2 subs return
// content" symptom the user kept hitting.
async function fetchSubResilient(sub: string): Promise<Post[]> {
  const tryOnce = async (): Promise<Post[]> => {
    const j = await fetchSubJson(sub);
    if (j && j.length) return j;
    const r = await fetchSubRss(sub);
    return r;
  };
  // Up to 3 attempts per sub with backoff. The proxy pool above is big
  // enough that two consecutive total failures is rare; three is virtually
  // never (and even when it happens we still want SOMETHING in the
  // payload from the other subs).
  for (let attempt = 0; attempt < 3; attempt++) {
    const got = await tryOnce();
    if (got.length) return got;
    if (attempt < 2) await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
  }
  return [];
}

async function buildPayload(): Promise<Payload> {
  const perSub = await Promise.all(SUBS.map(fetchSubResilient));
  const subsHit = perSub.filter((arr) => arr.length > 0).length;
  // Carry the per-build count so the handler can decide whether the result
  // is "good enough" to cache as the warm snapshot. A single-sub payload
  // would otherwise serve for 20 minutes and look broken.
  (globalThis as { __redditSubsHit?: number }).__redditSubsHit = subsHit;

  // Round-robin interleave, preserving each sub's hot order.
  const seen = new Set<string>();
  const out: Post[] = [];
  for (let i = 0; out.length < MAX; i++) {
    let advanced = false;
    for (const list of perSub) {
      const p = list[i];
      if (p) {
        advanced = true;
        if (!seen.has(p.id)) { seen.add(p.id); out.push(p); if (out.length >= MAX) break; }
      }
    }
    if (!advanced) break;
  }

  // Highest-quality posts first, regardless of which sub they came from.
  out.sort((a, b) => b.score - a.score || b.created - a.created);
  return { posts: out, subs: SUBS, sort: SORT, period: PERIOD };
}

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.has("n"); // manual refresh nonce

  // Serve the warm snapshot immediately unless the user forced a refresh.
  if (!force && snapshot && Date.now() - snapshot.at < SNAP_TTL) {
    return NextResponse.json(snapshot.data, { headers: { "Cache-Control": CDN_CACHE } });
  }

  let payload: Payload;
  try {
    payload = await buildPayload();
  } catch {
    payload = { posts: [], subs: SUBS, sort: SORT, period: PERIOD };
  }

  // Adopt a fresh result as the warm snapshot ONLY when it includes posts
  // from at least 3 of the 5 subs. A single-sub payload (which is what the
  // user kept seeing) shouldn't pin the box for 20 minutes — let the next
  // hit retry the slow path. If we already have a recent snapshot with more
  // sub coverage, prefer that until the hard expiry kicks in.
  const subsHit = (globalThis as { __redditSubsHit?: number }).__redditSubsHit ?? 0;
  if (payload.posts.length > 0 && subsHit >= 3) {
    // Strong fresh result — cache it and serve it.
    snapshot = { at: Date.now(), data: payload };
    return NextResponse.json(payload, { headers: { "Cache-Control": force ? "no-store" : CDN_CACHE } });
  }
  if (snapshot && Date.now() - snapshot.at < SNAP_HARD_MAX) {
    // Fresh result is thin but we have a broader recent snapshot — prefer it.
    return NextResponse.json(snapshot.data, { headers: { "Cache-Control": CDN_CACHE } });
  }
  if (payload.posts.length > 0) {
    // Last resort: serve the thin fresh result WITHOUT caching it, so the
    // next request retries the slow path. Better to show 1-sub content than
    // an empty card.
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  }
  snapshot = null;
  return NextResponse.json({ posts: [], error: "no_posts" }, { status: 502 });
}
