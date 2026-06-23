// NASA's Astronomy Picture of the Day.
//
// Source order:
//   1. api.nasa.gov with NASA_API_KEY when set (instant, 1000 req/hr).
//   2. The actual APOD page at apod.nasa.gov — NO key, NOT rate-limited like
//      DEMO_KEY (which is shared across every Vercel egress IP on earth and is
//      almost always throttled, which is why the tab kept failing). We scrape
//      the image/title/explanation straight off the page.
//   3. DEMO_KEY via api.nasa.gov as a last network attempt.
//   4. The last good response from in-memory cache.

import { NextResponse } from "next/server";

export const revalidate = 3600;
export const maxDuration = 20;

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

function passThrough(j: ApodResp): ApodResp {
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

async function tryJson(url: string): Promise<ApodResp | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "morning-dashboard/1.0" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as ApodResp;
  } catch {
    return null;
  }
}

// ---- apod.nasa.gov HTML scrape (no key) ------------------------------------

const APOD_BASE = "https://apod.nasa.gov/apod/";

async function fetchApodPage(): Promise<string | null> {
  const target = `${APOD_BASE}astropix.html`;
  const tries = [
    target,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!r.ok) continue;
      const text = await r.text();
      if (text && /astronomy picture of the day/i.test(text)) return text;
    } catch { /* next */ }
  }
  return null;
}

function abs(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return APOD_BASE + src.replace(/^\.?\//, "");
}

function parseApodHtml(html: string): ApodResp | null {
  // Image day: an <a href="image/..."><img src="image/..."></a>.
  const imgM = html.match(/<img[^>]+src=["']?(image\/[^"'\s>]+)["']?/i);
  const aHrefM = html.match(/<a[^>]+href=["']?(image\/[^"'\s>]+)["']?/i);
  // Video day: an iframe (YouTube/Vimeo embed).
  const iframeM = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);

  // Title: the first <b> after the picture that isn't the page heading.
  let title = "";
  const bMatches = [...html.matchAll(/<b>\s*([^<][\s\S]*?)<\/b>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  );
  for (const b of bMatches) {
    if (!b) continue;
    if (/^(astronomy picture of the day|image credit|illustration credit|video credit|explanation|credit)/i.test(b)) continue;
    title = b;
    break;
  }

  // Explanation: text after "Explanation:" up to the next "Tomorrow's picture"
  // marker or a horizontal rule.
  let explanation = "";
  const explM = html.match(/Explanation:\s*<\/b>\s*([\s\S]*?)(?:<p>\s*<center>|Tomorrow's picture|<hr)/i);
  if (explM) {
    explanation = explM[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/\s+/g, " ")
      .trim();
  }

  if (iframeM) {
    return { title: title || "Astronomy Picture of the Day", explanation, url: iframeM[1], media_type: "video" };
  }
  if (imgM) {
    return {
      title: title || "Astronomy Picture of the Day",
      explanation,
      url: abs(imgM[1]),
      hdurl: aHrefM ? abs(aHrefM[1]) : abs(imgM[1]),
      media_type: "image",
    };
  }
  return null;
}

export async function GET() {
  const key = process.env.NASA_API_KEY;

  // 1) Real key (if configured) — instant and reliable.
  if (key) {
    const j = await tryJson(`https://api.nasa.gov/planetary/apod?api_key=${key}`);
    if (j && j.title && j.url) {
      const data = passThrough(j);
      lastGood = { at: Date.now(), data };
      return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
    }
  }

  // 2) No-key page scrape — the reliable path when DEMO_KEY is throttled.
  const html = await fetchApodPage();
  if (html) {
    const parsed = parseApodHtml(html);
    if (parsed && parsed.url) {
      lastGood = { at: Date.now(), data: parsed };
      return NextResponse.json(parsed, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
    }
  }

  // 3) DEMO_KEY as a last network attempt (often rate-limited, but free).
  const demo = await tryJson(`https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`);
  if (demo && demo.title && demo.url) {
    const data = passThrough(demo);
    lastGood = { at: Date.now(), data };
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  }

  // 4) Last good response.
  if (lastGood && Date.now() - lastGood.at < LAST_GOOD_TTL) {
    return NextResponse.json(lastGood.data, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" } });
  }
  return NextResponse.json({ error: "nasa_unavailable" }, { status: 502 });
}
