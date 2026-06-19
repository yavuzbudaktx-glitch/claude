// CPA video feed for the Accounting page — Logan Graf's ENTIRE upload library
// (not just the Atom feed's latest 15), walked via the shared youtube-library
// helper. The client shuffles/persists across this whole pool.

import { NextResponse } from "next/server";
import { fetchChannelVideos } from "@/lib/youtube-library";

export const revalidate = 3600;
export const maxDuration = 60;

const HANDLE = "logangrafcpa";
const LABEL = "Logan Graf";
const CHANNEL_URL = `https://www.youtube.com/@${HANDLE}/videos`;

function seedIndex(dateKey: string, n: number): number {
  let h = 0;
  for (const c of dateKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

export async function GET(req: Request) {
  const dateKey = new URL(req.url).searchParams.get("d") ?? new Date().toISOString().slice(0, 10);

  // Walk Logan's whole library (target ≥200). fetchChannelVideos races
  // Piped + innertube + HTML + Atom + Invidious in parallel, unions them,
  // caches the result, and keeps the biggest-ever as a floor.
  let lib: Array<{ id: string; title: string }> = [];
  try { lib = await fetchChannelVideos(HANDLE, 200); } catch { lib = []; }

  const videos = lib.map((v) => ({
    id: v.id,
    title: v.title,
    published: "",
    thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    channel: HANDLE,
    channelLabel: LABEL,
    channelUrl: CHANNEL_URL,
  }));

  if (videos.length === 0) {
    return NextResponse.json({ error: "no_videos", channels: [{ handle: HANDLE, label: LABEL }] }, { status: 502 });
  }

  return NextResponse.json(
    { videos, seed: seedIndex(dateKey, videos.length), channels: [{ handle: HANDLE, label: LABEL }] },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
