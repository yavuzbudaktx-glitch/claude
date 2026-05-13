// Server-side fetcher for Britannica's daily Featured Event. Delegates
// HTML parsing to `britannica-extract` so the client can reuse the same
// parser on its own CORS-proxied scrape.

import { extractFeaturedEvent, isPlausibleFeaturedEvent, type BritannicaTopic } from "./britannica-extract";

export type { BritannicaTopic };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // No revalidate cache — we don't want a single blocked response to
      // be served for an hour. SWR + the route's force-dynamic means each
      // unique request hits this fresh, then the client caches the parsed
      // payload itself.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchBritannicaFeaturedEvent(date = new Date()): Promise<BritannicaTopic | null> {
  // Try the day-specific URL first, then fall back to the rotating landing.
  const monthName = MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  const candidates = [
    `https://www.britannica.com/on-this-day/${monthName}-${day}`,
    "https://www.britannica.com/on-this-day",
  ];
  for (const url of candidates) {
    const html = await fetchHtml(url);
    if (!html) continue;
    const topic = extractFeaturedEvent(html);
    if (topic && isPlausibleFeaturedEvent(topic)) return topic;
  }
  return null;
}
