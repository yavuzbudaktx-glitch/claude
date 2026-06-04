// CPA video feed for the Accounting page — Logan Graf's channel uploads via
// YouTube's public Atom feed (no API key, no scraping, no egress games — the
// /feeds/videos.xml endpoint is reachable from serverless runtimes that the
// regular /@handle pages are not). We resolve the @handle → channel ID once
// (canonical / og:url / externalId) via proxies and cache it.

import { NextResponse } from "next/server";
import Parser from "rss-parser";

export const revalidate = 3600;

// `staticId` short-circuits the page scrape — when we already know the UC ID
// the route is one network call away from a result.
const CHANNELS: Array<{ handle: string; label: string; staticId?: string }> = [
  { handle: "logangrafcpa", label: "Logan Graf" },
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

interface Video {
  id: string; title: string; published: string; thumb: string;
  channel: string;
  channelLabel: string;
  channelUrl: string;
}

const idCache = new Map<string, string>();

async function getHtml(url: string): Promise<string | null> {
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const res = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 1000) return text;
    } catch { /* next */ }
  }
  return null;
}

async function resolveChannelId(handle: string, staticId?: string): Promise<string | null> {
  if (staticId) return staticId;
  const hit = idCache.get(handle);
  if (hit) return hit;
  const html = await getHtml(`https://www.youtube.com/@${handle}`);
  if (!html) return null;
  const m =
    /<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html) ||
    /<meta[^>]+property="og:url"[^>]+content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html) ||
    /"externalId":"(UC[\w-]{22})"/.exec(html) ||
    /"channelId":"(UC[\w-]{22})"/.exec(html);
  if (m) { idCache.set(handle, m[1]); return m[1]; }
  return null;
}

interface YtItem {
  title?: string;
  pubDate?: string;
  isoDate?: string;
  id?: string;
  ["yt:videoId"]?: string;
  ["media:group"]?: {
    ["media:thumbnail"]?: { $?: { url?: string; height?: string; width?: string } } | Array<{ $?: { url?: string; height?: string; width?: string } }>;
    ["media:description"]?: string;
  };
}

const ytParser = new Parser<{ title?: string }, YtItem>({
  timeout: 10000,
  headers: HEADERS,
  customFields: { item: [["yt:videoId", "yt:videoId"], ["media:group", "media:group"]] },
});

function thumbOf(item: YtItem, id: string): { url: string; w: number; h: number } {
  const g = item["media:group"]?.["media:thumbnail"];
  const first = Array.isArray(g) ? g[0] : g;
  return {
    url: first?.$?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    w: Number(first?.$?.width ?? 0),
    h: Number(first?.$?.height ?? 0),
  };
}
function looksLikeShort(item: YtItem, t: { w: number; h: number }): boolean {
  const title = (item.title ?? "").toLowerCase();
  if (/#short|#shorts/.test(title)) return true;
  if (t.w > 0 && t.h > 0 && t.h >= t.w) return true;
  return false;
}

async function fetchUploads(channelId: string, channel: { handle: string; label: string }): Promise<Video[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  let feed: Awaited<ReturnType<typeof ytParser.parseURL>> | null = null;
  try {
    feed = await ytParser.parseURL(url);
  } catch {
    const xml = await getHtml(url);
    if (xml) { try { feed = await ytParser.parseString(xml); } catch { feed = null; } }
  }
  if (!feed) return [];
  return (feed.items ?? [])
    .filter((it) => {
      const id = it["yt:videoId"] ?? (it.id ?? "").replace(/^yt:video:/, "");
      return !looksLikeShort(it, thumbOf(it, id));
    })
    .map((it) => {
      const id = it["yt:videoId"] ?? (it.id ?? "").replace(/^yt:video:/, "");
      return {
        id, title: (it.title ?? "").trim(),
        published: it.isoDate ?? it.pubDate ?? "",
        thumb: thumbOf(it, id).url,
        channel: channel.handle,
        channelLabel: channel.label,
        channelUrl: `https://www.youtube.com/@${channel.handle}/videos`,
      };
    })
    .filter((v) => v.id && v.title);
}

function seedIndex(dateKey: string, n: number): number {
  let h = 0;
  for (const c of dateKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

export async function GET(req: Request) {
  const dateKey = new URL(req.url).searchParams.get("d") ?? new Date().toISOString().slice(0, 10);

  const perChannel = await Promise.all(
    CHANNELS.map(async (ch) => {
      const id = await resolveChannelId(ch.handle, ch.staticId);
      return id ? fetchUploads(id, ch) : ([] as Video[]);
    }),
  );

  const seen = new Set<string>();
  const videos: Video[] = [];
  for (let i = 0; ; i++) {
    let advanced = false;
    for (const list of perChannel) {
      const v = list[i];
      if (v) {
        advanced = true;
        if (!seen.has(v.id)) { seen.add(v.id); videos.push(v); }
      }
    }
    if (!advanced) break;
  }

  if (videos.length === 0) {
    return NextResponse.json({ error: "no_videos", channels: CHANNELS }, { status: 502 });
  }

  return NextResponse.json(
    { videos, seed: seedIndex(dateKey, videos.length), channels: CHANNELS },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=21600" } },
  );
}
