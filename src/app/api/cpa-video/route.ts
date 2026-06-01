// Daily "CPA video" from Logan Graf's YouTube channel.
//
// Two-stage fetch:
//   1. Resolve the @logangrafcpa handle to a channel ID by scraping the
//      channel page once and stashing the result on a module global. The
//      result lives as long as the Lambda instance.
//   2. Pull the channel's videos.xml feed (latest ~15 uploads) and pick a
//      deterministic-per-day video so the page is stable for the whole day
//      but rotates at local midnight.
//
// The picker is keyed off the requested date (sent by the client so we
// follow the user's timezone, not the server's), with a sensible fallback.

import { NextResponse } from "next/server";
import Parser from "rss-parser";

export const revalidate = 3600; // 1h floor; the rotation is date-keyed anyway

const HANDLE = "logangrafcpa";
const CHANNEL_URL = `https://www.youtube.com/@${HANDLE}/videos`;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

let cachedChannelId: string | null = null;

async function resolveChannelId(): Promise<string | null> {
  if (cachedChannelId) return cachedChannelId;
  try {
    const res = await fetch(`https://www.youtube.com/@${HANDLE}`, {
      headers: HEADERS,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // The channel ID appears in several places; "channelId" / "externalId"
    // / "browseId" are the most reliable.
    const m =
      /"channelId":"(UC[\w-]{22})"/.exec(html) ||
      /"externalId":"(UC[\w-]{22})"/.exec(html) ||
      /"browseId":"(UC[\w-]{22})"/.exec(html) ||
      /<meta[^>]+itemprop="(?:channelId|identifier)"[^>]+content="(UC[\w-]{22})"/.exec(html) ||
      /channel\/(UC[\w-]{22})/.exec(html);
    if (m) {
      cachedChannelId = m[1];
      return cachedChannelId;
    }
  } catch {
    // fall through
  }
  return null;
}

interface YtItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  id?: string;
  ["yt:videoId"]?: string;
  ["media:group"]?: { ["media:thumbnail"]?: { $?: { url?: string } } | Array<{ $?: { url?: string } }> };
}

const ytParser = new Parser<{}, YtItem>({
  timeout: 9000,
  headers: HEADERS,
  customFields: {
    item: [
      ["yt:videoId", "yt:videoId"],
      ["media:group", "media:group"],
    ],
  },
});

function thumbOf(item: YtItem): string {
  const g = item["media:group"];
  const t = g?.["media:thumbnail"];
  const first = Array.isArray(t) ? t[0] : t;
  return first?.$?.url ?? "";
}

async function fetchVideos(channelId: string): Promise<Array<{ id: string; title: string; published: string; thumb: string }>> {
  try {
    const feed = await ytParser.parseURL(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    );
    return (feed.items ?? [])
      .map((it) => {
        const id = it["yt:videoId"] ?? (it.id ?? "").replace(/^yt:video:/, "");
        return {
          id,
          title: (it.title ?? "").trim(),
          published: it.isoDate ?? it.pubDate ?? "",
          thumb: thumbOf(it),
        };
      })
      .filter((v) => v.id && v.title);
  } catch {
    return [];
  }
}

// Deterministic per-day picker: a small hash of the date string mod N.
function pickIndex(dateKey: string, n: number): number {
  let h = 0;
  for (const c of dateKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey =
    url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);

  const channelId = await resolveChannelId();
  if (!channelId) {
    return NextResponse.json(
      { error: "channel_unresolved", channelUrl: CHANNEL_URL },
      { status: 502 },
    );
  }
  const videos = await fetchVideos(channelId);
  if (videos.length === 0) {
    return NextResponse.json(
      { error: "no_videos", channelUrl: CHANNEL_URL },
      { status: 502 },
    );
  }

  const pick = videos[pickIndex(dateKey, videos.length)];
  return NextResponse.json({
    videoId: pick.id,
    title: pick.title,
    published: pick.published,
    thumb: pick.thumb,
    channelUrl: CHANNEL_URL,
    channelId,
    of: videos.length,
  });
}
