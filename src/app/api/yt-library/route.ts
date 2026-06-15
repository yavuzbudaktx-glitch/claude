// One endpoint for every "random video from a whole library" box. Each source
// is a named channel/playlist/shorts feed; we return the full (cached) list of
// {id,title} and the client picks/shuffles/persists. The heavy library walk
// lives in src/lib/youtube-library.ts.

import { NextResponse } from "next/server";
import { fetchChannelVideos, fetchChannelShorts, fetchPlaylistVideos, type LibVideo } from "@/lib/youtube-library";

export const revalidate = 3600;
// Walking a whole library is several round-trips; give the function headroom
// (Vercel caps this to the plan max — 10s hobby / up to 60s pro).
export const maxDuration = 30;

type Source =
  | { kind: "channel"; handle: string; label: string; url: string; min: number }
  | { kind: "shorts"; handle: string; label: string; url: string; min: number }
  | { kind: "playlist"; list: string; label: string; url: string; min: number };

// `min` = the count below which we treat the fetch as a failure and DON'T
// cache it (so the next request retries against a healthier upstream). These
// match the real library sizes the user expects to see.
const SOURCES: Record<string, Source> = {
  logan:   { kind: "channel",  handle: "logangrafcpa",       label: "Logan Graf",       url: "https://www.youtube.com/@logangrafcpa/videos", min: 200 },
  bbc:     { kind: "shorts",   handle: "bbcearth",           label: "BBC Earth",        url: "https://www.youtube.com/@bbcearth/shorts", min: 10 },
  vlog:    { kind: "channel",  handle: "country_life_vlog",  label: "Country Life Vlog", url: "https://www.youtube.com/@country_life_vlog/videos", min: 500 },
  bobross: { kind: "playlist", list: "PLaLOVNqqD-2HgiA-GZyzcfZN9n-YelhB5", label: "Bob Ross", url: "https://www.youtube.com/playlist?list=PLaLOVNqqD-2HgiA-GZyzcfZN9n-YelhB5", min: 300 },
  elif:    { kind: "channel",  handle: "ElifinHecesi",       label: "Elif'in Hecesi",   url: "https://www.youtube.com/@ElifinHecesi/videos", min: 42 },
  turgut:  { kind: "channel",  handle: "TurgutBayraktarBelgeselleri", label: "Turgut Bayraktar Belgeselleri", url: "https://www.youtube.com/@TurgutBayraktarBelgeselleri/videos", min: 200 },
};

async function fetchFor(src: Source): Promise<LibVideo[]> {
  if (src.kind === "channel") return fetchChannelVideos(src.handle, src.min);
  if (src.kind === "shorts") return fetchChannelShorts(src.handle);
  return fetchPlaylistVideos(src.list, src.min);
}

export async function GET(req: Request) {
  const sourceKey = new URL(req.url).searchParams.get("source") ?? "";
  const src = SOURCES[sourceKey];
  if (!src) return NextResponse.json({ error: "unknown_source" }, { status: 400 });

  let videos: LibVideo[] = [];
  try {
    videos = await fetchFor(src);
    // Below the expected size → the upstream throttled us. Because a
    // sub-`min` result isn't cached, an immediate retry hits a fresh
    // upstream and usually fills in the rest. Try up to twice more.
    for (let attempt = 0; attempt < 2 && videos.length < src.min; attempt++) {
      const retry = await fetchFor(src);
      if (retry.length > videos.length) videos = retry;
    }
  } catch {
    videos = [];
  }

  if (videos.length === 0) {
    return NextResponse.json({ error: "no_videos", label: src.label, url: src.url, videos: [] }, { status: 502 });
  }

  // No payload cap — for "truly random from the whole library" we want every
  // video the walker found. A {id,title} pair is ~30 bytes, so even a 5k
  // channel is ~150KB before gzip.
  const capped = videos;

  return NextResponse.json(
    { label: src.label, url: src.url, count: capped.length, videos: capped },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
