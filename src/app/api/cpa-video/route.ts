// Logan Graf CPA — his own uploads, surfaced one-at-a-time on the
// Accounting page with a "shuffle" refresh.
//
//   1. Resolve the @logangrafcpa handle to its channel ID. We trust ONLY
//      the page-owner signals — the <link rel="canonical">, og:url, and
//      "externalId" — never a bare `channel/UC…` match, which on a channel
//      page can point at a *recommended* channel and is exactly how you end
//      up showing "videos tagged him" instead of his own.
//   2. Pull the channel's uploads via the videos.xml Atom feed (this is the
//      channel's own uploads, newest first). Page-scrape fallback if needed.
//
// We return the whole list so the client can shuffle through instantly, plus
// a per-date seed index so each day opens on a different video by default.

import { NextResponse } from "next/server";
import Parser from "rss-parser";

export const revalidate = 3600;

const HANDLE = "logangrafcpa";
const CHANNEL_URL = `https://www.youtube.com/@${HANDLE}/videos`;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

interface Video { id: string; title: string; published: string; thumb: string }

let cachedChannelId: string | null = null;
let cachedTitle: string | null = null;

async function getHtml(url: string): Promise<string | null> {
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const res = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 1000) return text;
    } catch {
      // next
    }
  }
  return null;
}

async function resolveChannelId(): Promise<string | null> {
  if (cachedChannelId) return cachedChannelId;
  const html = await getHtml(`https://www.youtube.com/@${HANDLE}`);
  if (!html) return null;
  const m =
    /<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html) ||
    /<meta[^>]+property="og:url"[^>]+content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html) ||
    /"externalId":"(UC[\w-]{22})"/.exec(html) ||
    /"channelId":"(UC[\w-]{22})"/.exec(html);
  if (m) {
    cachedChannelId = m[1];
    const t = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/.exec(html);
    cachedTitle = t ? t[1] : null;
    return cachedChannelId;
  }
  return null;
}

interface YtItem {
  title?: string;
  pubDate?: string;
  isoDate?: string;
  id?: string;
  ["yt:videoId"]?: string;
  ["media:group"]?: { ["media:thumbnail"]?: { $?: { url?: string } } | Array<{ $?: { url?: string } }> };
}

const ytParser = new Parser<{ title?: string }, YtItem>({
  timeout: 10000,
  headers: HEADERS,
  customFields: { item: [["yt:videoId", "yt:videoId"], ["media:group", "media:group"]] },
});

function thumbOf(item: YtItem, id: string): string {
  const g = item["media:group"]?.["media:thumbnail"];
  const first = Array.isArray(g) ? g[0] : g;
  return first?.$?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

async function fetchUploads(channelId: string): Promise<Video[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  // rss-parser can fetch directly; if that's blocked, hand it proxied XML.
  let feed: Awaited<ReturnType<typeof ytParser.parseURL>> | null = null;
  try {
    feed = await ytParser.parseURL(url);
  } catch {
    const xml = await getHtml(url);
    if (xml) { try { feed = await ytParser.parseString(xml); } catch { feed = null; } }
  }
  if (!feed) return [];
  if (feed.title) cachedTitle = feed.title;
  return (feed.items ?? [])
    .map((it) => {
      const id = it["yt:videoId"] ?? (it.id ?? "").replace(/^yt:video:/, "");
      return { id, title: (it.title ?? "").trim(), published: it.isoDate ?? it.pubDate ?? "", thumb: thumbOf(it, id) };
    })
    .filter((v) => v.id && v.title);
}

// Last-ditch fallback: scrape the /videos page for the owner's video IDs.
async function scrapeVideos(): Promise<Video[]> {
  const html = await getHtml(CHANNEL_URL);
  if (!html) return [];
  const out: Video[] = [];
  const seen = new Set<string>();
  // videoRenderer blocks carry the id then a title runs/text shortly after.
  const re = /"videoId":"([\w-]{11})"(?:(?!"videoId").){0,400}?"text":"((?:[^"\\]|\\.)*?)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 20) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    let title = "";
    try { title = JSON.parse(`"${m[2]}"`); } catch { title = m[2]; }
    if (title && !/^\d+:\d+$/.test(title)) {
      out.push({ id, title, published: "", thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` });
    }
  }
  return out;
}

function seedIndex(dateKey: string, n: number): number {
  let h = 0;
  for (const c of dateKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

export async function GET(req: Request) {
  const dateKey = new URL(req.url).searchParams.get("d") ?? new Date().toISOString().slice(0, 10);

  const channelId = await resolveChannelId();
  let videos: Video[] = [];
  if (channelId) videos = await fetchUploads(channelId);
  if (videos.length === 0) videos = await scrapeVideos();

  if (videos.length === 0) {
    return NextResponse.json({ error: "no_videos", channelUrl: CHANNEL_URL }, { status: 502 });
  }

  return NextResponse.json(
    {
      videos,
      seed: seedIndex(dateKey, videos.length),
      channelUrl: CHANNEL_URL,
      channelTitle: cachedTitle ?? "Logan Graf, CPA",
      channelId,
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=21600" } },
  );
}
