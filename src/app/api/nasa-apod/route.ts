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
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchApodPage(target: string): Promise<string | null> {
  const tries = [
    target,
    `https://r.jina.ai/${target}`,                                         // residential proxy, very reliable
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    `https://thingproxy.freeboard.io/fetch/${target}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, {
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html, text/plain, */*" },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!r.ok) continue;
      const text = await r.text();
      // Jina returns markdown; the other proxies return raw HTML. Either is
      // fine as long as the body looks like an APOD page.
      if (text && /astronomy picture of the day|apod/i.test(text)) return text;
    } catch { /* next */ }
  }
  return null;
}

// Yesterday's APOD URL — used as a same-day fallback when today's hasn't
// rendered yet or the proxies all choke on today's specific content.
function yesterdayApodUrl(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${APOD_BASE}ap${yy}${mm}${dd}.html`;
}

function abs(src: string, base = APOD_BASE): string {
  if (/^https?:\/\//i.test(src)) return src;
  return base + src.replace(/^\.?\//, "");
}

function parseApodHtml(html: string): ApodResp | null {
  // ---- Title ----
  let title = "";
  const bMatches = [...html.matchAll(/<b>\s*([^<][\s\S]*?)<\/b>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  );
  for (const b of bMatches) {
    if (!b) continue;
    if (/^(astronomy picture of the day|image credit|illustration credit|video credit|explanation|credit|tomorrow|today|discover the cosmos)/i.test(b)) continue;
    if (/^\d{4}\s+/.test(b)) continue;  // skip "2026 December 21" header
    if (b.length < 4) continue;
    title = b;
    break;
  }
  // Jina markdown fallback: titles often appear as "## Title".
  if (!title) {
    const mdT = html.match(/\n#{1,3}\s+([^\n#][^\n]{3,150})/);
    if (mdT && !/astronomy picture of the day/i.test(mdT[1])) title = mdT[1].trim();
  }

  // ---- Explanation ----
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
  // Jina markdown fallback for the explanation paragraph.
  if (!explanation) {
    const mdE = html.match(/(?:^|\n)\s*Explanation:\s*([\s\S]{60,2000}?)(?:\n\s*\n|Tomorrow's picture)/i);
    if (mdE) explanation = mdE[1].replace(/\s+/g, " ").trim();
  }

  // ---- Media ----
  // Strict pattern first (matches the standard apod.nasa.gov layout).
  const strictImgM = html.match(/<img[^>]+src=["']?(image\/[^"'\s>]+\.(?:jpg|jpeg|png|webp|gif))["']?/i);
  const strictHrefM = html.match(/<a[^>]+href=["']?(image\/[^"'\s>]+\.(?:jpg|jpeg|png|webp|gif))["']?/i);
  // Iframe (video days).
  const iframeM = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  // ANY absolute image URL on the page (third-party hosts, mirror days).
  const anyExtImgM = html.match(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif))["']/i);
  // Markdown image (Jina output): "![alt](url)".
  const mdImgM = html.match(/!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|webp|gif))\)/i);
  // Last-ditch: ANY URL on the page ending in a known image extension.
  const looseImgM = html.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp))/i);

  if (iframeM) {
    let videoUrl = iframeM[1];
    if (videoUrl.startsWith("http://")) videoUrl = videoUrl.replace(/^http:/, "https:");
    return { title: title || "Astronomy Picture of the Day", explanation, url: videoUrl, media_type: "video" };
  }
  // Pick the best image source we found.
  const imgPath =
    strictImgM?.[1] ??
    mdImgM?.[1] ??
    anyExtImgM?.[1] ??
    looseImgM?.[1] ??
    null;
  if (imgPath) {
    const url = abs(imgPath);
    const hd = strictHrefM ? abs(strictHrefM[1]) : url;
    return {
      title: title || "Astronomy Picture of the Day",
      explanation,
      url,
      hdurl: hd,
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
  //    Try today's URL first, then yesterday's archive page if today doesn't
  //    parse (covers the case where today's APOD is some weird embed type
  //    that confuses every regex we have).
  for (const target of [`${APOD_BASE}astropix.html`, yesterdayApodUrl()]) {
    const html = await fetchApodPage(target);
    if (!html) continue;
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
