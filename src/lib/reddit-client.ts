"use client";

// Browser-side Reddit fetch.
//
// WHY THIS EXISTS: Reddit blocks datacenter IPs on its public JSON endpoints.
// That kills BOTH of our server-side paths — Vercel's functions and the GitHub
// Actions harvester — which is why the feed kept collapsing to a single
// subreddit no matter how many proxies we raced. The one machine in this whole
// system that Reddit is happy to serve is the user's own: a residential IP.
//
// Reddit's public *.json endpoints answer simple cross-origin GETs with
// `Access-Control-Allow-Origin: *`, so the browser can read them directly. The
// catch is that it must stay a SIMPLE request — no custom headers at all, or
// the browser sends a CORS preflight that Reddit won't answer. So: plain
// fetch(url), no headers, no credentials.
//
// This is best-effort. Any failure returns null and the caller falls back to
// the /api/reddit route exactly as before.

export interface RedditPostLite {
  id: string;
  title: string;
  subreddit: string;
  permalink: string;
  score: number;
  ratio: number;
  comments: number;
  created: number;
  flair: string | null;
  author: string;
  image: string | null;
}

const DEAD = /^\[(removed|deleted|removed by reddit)\]$/i;

interface Listing {
  data?: { children?: Array<{ data?: Record<string, unknown> }> };
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  return typeof v === "string" ? v : "";
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// Pull a usable preview image out of a post, mirroring the server's logic.
function imageOf(d: Record<string, unknown>): string | null {
  const preview = d.preview as { images?: Array<{ resolutions?: Array<{ url?: string }>; source?: { url?: string } }> } | undefined;
  const first = preview?.images?.[0];
  if (first) {
    const res = Array.isArray(first.resolutions) ? first.resolutions : [];
    const pick = res.length ? res[Math.min(res.length - 1, 2)]?.url : undefined;
    const url = (pick ?? first.source?.url ?? "").replace(/&amp;/g, "&");
    if (url) return url;
  }
  const direct = str(d, "url_overridden_by_dest") || str(d, "url");
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(direct) ? direct : null;
}

function mapListing(json: unknown, fallbackSub: string): RedditPostLite[] {
  const kids = (json as Listing)?.data?.children;
  if (!Array.isArray(kids)) return [];
  const out: RedditPostLite[] = [];
  for (const kid of kids) {
    const d = kid?.data;
    if (!d || typeof d !== "object") continue;
    const rec = d as Record<string, unknown>;
    const title = str(rec, "title");
    const id = str(rec, "id");
    if (!id || !title || DEAD.test(title)) continue;
    if (rec.stickied === true || rec.over_18 === true) continue;
    out.push({
      id,
      title,
      subreddit: str(rec, "subreddit") || fallbackSub,
      permalink: `https://www.reddit.com${str(rec, "permalink")}`,
      score: num(rec, "score"),
      ratio: num(rec, "upvote_ratio"),
      comments: num(rec, "num_comments"),
      created: num(rec, "created_utc") * 1000,
      flair: str(rec, "link_flair_text") || null,
      author: str(rec, "author"),
      image: imageOf(rec),
    });
  }
  return out;
}

// Simple GET only — adding ANY header would trigger a preflight Reddit ignores.
async function getListing(url: string, ms: number): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch top-of-week posts for `subs` straight from the browser, balanced so
 * every subreddit is represented. Returns null if Reddit can't be reached at
 * all, so the caller can fall back to the server route.
 */
export async function fetchRedditFromBrowser(
  subs: string[],
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<{ posts: RedditPostLite[]; subsHit: number } | null> {
  if (typeof window === "undefined" || subs.length === 0) return null;
  const timeoutMs = opts.timeoutMs ?? 7000;
  const max = opts.limit ?? 70;

  // Per-sub in parallel. Reddit's combined `a+b+c` listing is score-sorted
  // globally, so the biggest sub swamps it — fetching each sub separately is
  // what actually guarantees balance, and from a browser we can afford it.
  const results = await Promise.all(
    subs.map(async (sub) => {
      const json = await getListing(
        `https://www.reddit.com/r/${encodeURIComponent(sub)}/top.json?t=week&limit=25&raw_json=1`,
        timeoutMs,
      );
      return mapListing(json, sub);
    }),
  );

  const subsHit = results.filter((r) => r.length > 0).length;
  if (subsHit === 0) return null; // Reddit unreachable — let the server try.

  // Round-robin interleave: the #1 post from each sub, then the #2s, etc.
  const seen = new Set<string>();
  const posts: RedditPostLite[] = [];
  for (let i = 0; posts.length < max; i++) {
    let advanced = false;
    for (const list of results) {
      const p = list[i];
      if (!p) continue;
      advanced = true;
      if (!seen.has(p.id)) {
        seen.add(p.id);
        posts.push(p);
        if (posts.length >= max) break;
      }
    }
    if (!advanced) break;
  }

  return { posts, subsHit };
}
