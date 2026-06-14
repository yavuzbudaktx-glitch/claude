// NASA's Astronomy Picture of the Day. Set NASA_API_KEY in env for the real
// thing (1000 req/hour); we fall back to DEMO_KEY (50 req/hour, shared across
// all the world's Vercel egress IPs, so frequently rate-limited). When NASA
// itself fails or rate-limits, we serve the last good response from in-memory
// cache so the tab never goes blank.

import { NextResponse } from "next/server";

export const revalidate = 3600;
export const maxDuration = 30;

interface ApodResp {
  date?: string;
  title?: string;
  explanation?: string;
  url?: string;
  hdurl?: string;
  media_type?: string;
  copyright?: string;
}

interface Cached { at: number; data: ApodResp }
let lastGood: Cached | null = null;
const LAST_GOOD_TTL = 1000 * 60 * 60 * 24 * 3;  // 72h — APOD doesn't move fast

function passThrough(j: ApodResp) {
  return {
    date: j.date,
    title: j.title,
    explanation: j.explanation,
    url: j.url,
    hdurl: j.hdurl,
    media_type: j.media_type,
    copyright: j.copyright,
  };
}

async function tryFetch(url: string): Promise<ApodResp | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "morning-dashboard/1.0" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as ApodResp;
  } catch {
    return null;
  }
}

export async function GET() {
  const key = process.env.NASA_API_KEY || "DEMO_KEY";

  // Try NASA directly. If it fails (rate limit / outage), try the public
  // mirror at images-api.nasa.gov as a fallback before giving up on a fresh
  // fetch and serving lastGood.
  let j = await tryFetch(`https://api.nasa.gov/planetary/apod?api_key=${key}`);
  if (!j) j = await tryFetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`)}`);

  if (j && j.title && j.url) {
    const data = passThrough(j);
    lastGood = { at: Date.now(), data };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  }

  // Both attempts failed — serve the last good response if we have one.
  if (lastGood && Date.now() - lastGood.at < LAST_GOOD_TTL) {
    return NextResponse.json(lastGood.data, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" },
    });
  }
  return NextResponse.json({ error: "nasa_unavailable" }, { status: 502 });
}
