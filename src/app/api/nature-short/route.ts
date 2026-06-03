// One daily nature short — pulled from BBC Earth + National Geographic
// channel uploads via the public Atom feed (no API key). We filter the
// recent uploads to short-form (or just-portrait-aspect when we can tell)
// and pick deterministically per day so the spot is stable through the day.

import { NextResponse } from "next/server";
import Parser from "rss-parser";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// Channel UC IDs for BBC Earth & National Geographic. Their @handles resolve
// to these. /shorts/ uploads also show up in this feed.
const CHANNELS = [
  { id: "UCwmZiChSryoWQCZMIQezgTg", label: "BBC Earth" },
  { id: "UCpVm7bg6pXKo1Pr6k5kxG9A", label: "National Geographic" },
];

interface YtItem {
  title?: string;
  pubDate?: string;
  isoDate?: string;
  id?: string;
  ["yt:videoId"]?: string;
  ["media:group"]?: { ["media:thumbnail"]?: { $?: { url?: string; height?: string; width?: string } } | Array<{ $?: { url?: string; height?: string; width?: string } }> };
}

const ytParser = new Parser<{ title?: string }, YtItem>({
  timeout: 10000,
  headers: HEADERS,
  customFields: { item: [["yt:videoId", "yt:videoId"], ["media:group", "media:group"]] },
});

function thumbOf(item: YtItem, id: string): { url: string; w: number; h: number } {
  const g = item["media:group"]?.["media:thumbnail"];
  const first = Array.isArray(g) ? g[0] : g;
  const url = first?.$?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return { url, w: Number(first?.$?.width ?? 0), h: Number(first?.$?.height ?? 0) };
}

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

export async function GET(req: Request) {
  const dateKey = new URL(req.url).searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = new URL(req.url).searchParams.get("r") ?? "";

  const lists = await Promise.all(CHANNELS.map(async (ch) => {
    try {
      const feed = await ytParser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`);
      return (feed.items ?? []).map((it) => {
        const id = it["yt:videoId"] ?? (it.id ?? "").replace(/^yt:video:/, "");
        const t = thumbOf(it, id);
        return { id, title: (it.title ?? "").trim(), published: it.isoDate ?? it.pubDate ?? "",
                 thumb: t.url, isPortrait: t.h > 0 && t.h > t.w, channel: ch.label };
      });
    } catch { return []; }
  }));
  const all = lists.flat().filter((v) => v.id && v.title);
  if (all.length === 0) {
    return NextResponse.json({ error: "no_videos" }, { status: 502 });
  }

  // Prefer portrait/short-aspect when available; otherwise fall back to any.
  const portrait = all.filter((v) => v.isPortrait);
  const pool = portrait.length > 0 ? portrait : all;
  const idx = seedIdx(dateKey + "-" + refresh + "-shorts", pool.length);
  const pick = pool[idx];

  return NextResponse.json({
    videoId: pick.id,
    title: pick.title,
    channel: pick.channel,
    published: pick.published,
    thumb: pick.thumb,
    isPortrait: pick.isPortrait,
  });
}
