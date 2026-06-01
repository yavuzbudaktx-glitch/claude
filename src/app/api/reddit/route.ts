// Community feed for the Accounting page — r/CPA + r/Accounting "hot".
//
// Reddit's public .json endpoints 403 a bare datacenter request, so we go
// through the same direct→public-proxy fetch chain the watchlist/UFC widgets
// use. raw_json=1 returns already-unescaped titles.

import { NextResponse } from "next/server";

export const revalidate = 600; // 10 minutes

const SUBS = ["CPA", "Accounting"];
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

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

interface RedditChild { data?: Record<string, unknown> }
interface RedditListing { data?: { children?: RedditChild[] } }

function candidates(url: string): string[] {
  return [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
}

async function fetchJson(url: string): Promise<RedditListing | null> {
  for (const c of candidates(url)) {
    try {
      const res = await fetch(c, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text[0] !== "{") continue;
      return JSON.parse(text) as RedditListing;
    } catch {
      // try next strategy
    }
  }
  return null;
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  return typeof v === "string" ? v : "";
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  return typeof v === "number" ? v : 0;
}

async function fetchSub(sub: string): Promise<Post[]> {
  const listing = await fetchJson(`https://www.reddit.com/r/${sub}/hot.json?limit=25&raw_json=1`);
  const children = listing?.data?.children ?? [];
  return children
    .map((c) => c.data)
    .filter((d): d is Record<string, unknown> => !!d && !d.stickied && !d.over_18 && typeof d.title === "string")
    .map((d) => ({
      id: str(d, "id"),
      title: str(d, "title"),
      subreddit: str(d, "subreddit") || sub,
      permalink: `https://www.reddit.com${str(d, "permalink")}`,
      score: num(d, "score"),
      comments: num(d, "num_comments"),
      created: num(d, "created_utc") * 1000,
      flair: (typeof d.link_flair_text === "string" && d.link_flair_text) || null,
      author: str(d, "author"),
    }));
}

export async function GET() {
  const settled = await Promise.allSettled(SUBS.map(fetchSub));
  const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const seen = new Set<string>();
  const posts = all
    .filter((p) => p.id && p.title && (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  return NextResponse.json(
    { posts },
    { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1800" } },
  );
}
