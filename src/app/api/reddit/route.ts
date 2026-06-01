// Community feed for the Accounting page — r/CPA + r/Accounting "hot".
//
// Reddit's bare JSON endpoints (.json) 403 most datacenter IPs and even
// a lot of public CORS proxies now. RSS is far more tolerant, so we go
// RSS-first via rss-parser (which handles both Atom and proxy chaining)
// and fall back to .json through a proxy chain if RSS yields nothing.

import { NextResponse } from "next/server";
import Parser from "rss-parser";

export const revalidate = 600;
export const dynamic = "force-dynamic"; // so a manual refresh truly refetches

const SUBS = ["CPA", "Accounting"];

// A Reddit-style application UA is much less likely to get bounced than a
// generic Chrome string — datacenter Chrome UAs are the #1 anti-bot signal.
const UA = "web:brief-dashboard:v1.0 (Accounting page community feed)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

interface Post {
  id: string;
  title: string;
  subreddit: string;
  permalink: string;
  score: number;
  comments: number;
  created: number;
  flair: string | null;
  author: string;
}

function candidates(url: string): string[] {
  return [
    url,
    `https://r.jina.ai/${url}`, // read-only reader proxy; treats target as plain text
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
}

async function fetchText(url: string, headers: Record<string, string>): Promise<string | null> {
  for (const c of candidates(url)) {
    try {
      const res = await fetch(c, { headers, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 100) return text;
    } catch {
      // try next strategy
    }
  }
  return null;
}

// -------- RSS path (primary) ------------------------------------------------

interface RssItem {
  title?: string;
  link?: string;
  id?: string;
  isoDate?: string;
  pubDate?: string;
  creator?: string;
  ["dc:creator"]?: string;
  content?: string;
  ["content:encoded"]?: string;
}

const rssParser = new Parser<{}, RssItem>({
  timeout: 9000,
  headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
  customFields: { item: [["content:encoded", "content:encoded"], ["dc:creator", "dc:creator"]] },
});

// RSS items carry score/comments only inside the HTML body, like
// "[link] [10 comments]" with a "submitted by /u/foo" prefix. Pull what
// we can; otherwise leave 0 so the UI shows a clean dash.
function parseMeta(html: string): { score: number; comments: number; author: string | null } {
  if (!html) return { score: 0, comments: 0, author: null };
  // Reddit's content sometimes embeds "submitted by <a>/u/foo</a>"
  const authorM = /\/u\/([A-Za-z0-9_-]+)/.exec(html);
  const commentsM = /(\d[\d,]*)\s+comments?/i.exec(html);
  return {
    score: 0,
    comments: commentsM ? Number(commentsM[1].replace(/,/g, "")) : 0,
    author: authorM ? authorM[1] : null,
  };
}

async function fetchSubRss(sub: string): Promise<Post[]> {
  const url = `https://www.reddit.com/r/${sub}/hot/.rss?limit=25`;
  // rss-parser will fetch directly; if Reddit blocks the direct hit, we hand
  // it proxied text instead.
  let feed: Awaited<ReturnType<typeof rssParser.parseURL>> | null = null;
  try {
    feed = await rssParser.parseURL(url);
  } catch {
    const xml = await fetchText(url, { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" });
    if (xml) { try { feed = await rssParser.parseString(xml); } catch { feed = null; } }
  }
  if (!feed) return [];

  return (feed.items ?? [])
    .map((it) => {
      const rawId = it.id ?? "";
      const id = rawId.replace(/^t3_/, "").replace(/.*\//, "") || (it.link ?? "").replace(/.*\/comments\/([a-z0-9]+).*/, "$1");
      const meta = parseMeta(it["content:encoded"] || it.content || "");
      const author = (it["dc:creator"] || it.creator || meta.author || "").replace(/^\/?u\//, "");
      return {
        id,
        title: (it.title ?? "").trim(),
        subreddit: sub,
        permalink: it.link ?? `https://www.reddit.com/r/${sub}/`,
        score: 0,
        comments: meta.comments,
        created: it.isoDate ? +new Date(it.isoDate) : it.pubDate ? +new Date(it.pubDate) : Date.now(),
        flair: null,
        author,
      };
    })
    .filter((p) => p.id && p.title);
}

// -------- JSON path (fallback, richer metadata) ----------------------------

interface RedditChild { data?: Record<string, unknown> }
interface RedditListing { data?: { children?: RedditChild[] } }
function s(o: Record<string, unknown>, k: string): string { const v = o[k]; return typeof v === "string" ? v : ""; }
function n(o: Record<string, unknown>, k: string): number { const v = o[k]; return typeof v === "number" ? v : 0; }

async function fetchSubJson(sub: string): Promise<Post[]> {
  const url = `https://www.reddit.com/r/${sub}/hot.json?limit=25&raw_json=1`;
  const text = await fetchText(url, { "User-Agent": UA, Accept: "application/json" })
    ?? await fetchText(url, { "User-Agent": BROWSER_UA, Accept: "application/json" });
  if (!text) return [];
  let listing: RedditListing;
  try { listing = JSON.parse(text) as RedditListing; } catch { return []; }

  return (listing?.data?.children ?? [])
    .map((c) => c.data)
    .filter((d): d is Record<string, unknown> => !!d && !d.stickied && !d.over_18 && typeof d.title === "string")
    .map((d) => ({
      id: s(d, "id"),
      title: s(d, "title"),
      subreddit: s(d, "subreddit") || sub,
      permalink: `https://www.reddit.com${s(d, "permalink")}`,
      score: n(d, "score"),
      comments: n(d, "num_comments"),
      created: n(d, "created_utc") * 1000,
      flair: (typeof d.link_flair_text === "string" && d.link_flair_text) || null,
      author: s(d, "author"),
    }))
    .filter((p) => p.id && p.title);
}

// Merge JSON-enriched score/flair onto an RSS post when we have both.
function mergeJsonIntoRss(rss: Post[], json: Post[]): Post[] {
  const byId = new Map(json.map((p) => [p.id, p]));
  return rss.map((p) => {
    const j = byId.get(p.id);
    if (!j) return p;
    return {
      ...p,
      score: j.score || p.score,
      comments: j.comments || p.comments,
      flair: j.flair || p.flair,
      author: j.author || p.author,
      permalink: j.permalink || p.permalink,
    };
  });
}

export async function GET() {
  // RSS in parallel — fast, almost always succeeds
  const rssSettled = await Promise.allSettled(SUBS.map(fetchSubRss));
  const rss = rssSettled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // JSON in parallel — best-effort enrichment for scores/flair/comments.
  // If RSS is empty (the rare case where everything blocked us), fall back
  // to JSON-only.
  const jsonSettled = await Promise.allSettled(SUBS.map(fetchSubJson));
  const json = jsonSettled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const base = rss.length > 0 ? mergeJsonIntoRss(rss, json) : json;
  if (base.length === 0) {
    return NextResponse.json({ posts: [], error: "no_posts" }, { status: 502 });
  }

  const seen = new Set<string>();
  const posts = base
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => {
      // Prefer score order; if both are 0 (RSS-only), recent first.
      if (a.score || b.score) return b.score - a.score;
      return b.created - a.created;
    })
    .slice(0, 30);

  return NextResponse.json(
    { posts },
    { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1800" } },
  );
}
