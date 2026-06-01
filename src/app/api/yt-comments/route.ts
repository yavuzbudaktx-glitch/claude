// Top comments for a YouTube video, without a Google API key.
//
// We query public Piped and Invidious instances (which expose YouTube
// comments as JSON) and take the first one that answers. Instances come and
// go, so we try a handful in turn and fail soft to an empty list.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; brief-dashboard/1.0)",
  Accept: "application/json",
};

interface OutComment { author: string; text: string; likes: number; time: string; avatar: string | null }

// --- Piped: /comments/{id} → { comments: [{author, commentText, likeCount, commentedTime, thumbnail}] }
const PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.reallyaweso.me",
];
// --- Invidious: /api/v1/comments/{id} → { comments: [{author, content, likeCount, publishedText, authorThumbnails}] }
const INVIDIOUS = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://invidious.jing.rocks",
];

function stripTags(s: string): string {
  return (s || "")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .trim();
}
function toInt(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = /([\d.]+)\s*([km]?)/i.exec(v.replace(/,/g, ""));
    if (m) { const n = parseFloat(m[1]); const u = m[2].toLowerCase(); return Math.round(n * (u === "k" ? 1e3 : u === "m" ? 1e6 : 1)); }
  }
  return 0;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function viaPiped(id: string): Promise<OutComment[]> {
  for (const base of PIPED) {
    const j = (await getJson(`${base}/comments/${id}`)) as { comments?: Array<Record<string, unknown>> } | null;
    const arr = j?.comments;
    if (Array.isArray(arr) && arr.length) {
      return arr.slice(0, 12).map((c) => ({
        author: String(c.author ?? "").replace(/^@/, ""),
        text: stripTags(String(c.commentText ?? "")),
        likes: toInt(c.likeCount),
        time: String(c.commentedTime ?? ""),
        avatar: typeof c.thumbnail === "string" ? c.thumbnail : null,
      })).filter((c) => c.text);
    }
  }
  return [];
}

async function viaInvidious(id: string): Promise<OutComment[]> {
  for (const base of INVIDIOUS) {
    const j = (await getJson(`${base}/api/v1/comments/${id}?sort_by=top`)) as { comments?: Array<Record<string, unknown>> } | null;
    const arr = j?.comments;
    if (Array.isArray(arr) && arr.length) {
      return arr.slice(0, 12).map((c) => {
        const thumbs = c.authorThumbnails as Array<{ url?: string }> | undefined;
        return {
          author: String(c.author ?? "").replace(/^@/, ""),
          text: stripTags(String(c.content ?? "")),
          likes: toInt(c.likeCount),
          time: String(c.publishedText ?? ""),
          avatar: thumbs?.[thumbs.length - 1]?.url ?? null,
        };
      }).filter((c) => c.text);
    }
  }
  return [];
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("v")?.trim();
  if (!id || !/^[\w-]{6,15}$/.test(id)) {
    return NextResponse.json({ comments: [], error: "bad_id" }, { status: 400 });
  }

  let comments = await viaPiped(id);
  if (comments.length === 0) comments = await viaInvidious(id);

  return NextResponse.json(
    { comments: comments.slice(0, 10) },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=21600" } },
  );
}
