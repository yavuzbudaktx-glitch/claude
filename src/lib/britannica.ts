// Daily "Featured Event" from britannica.com/on-this-day.
//
// Britannica server-renders the page, so the featured event is sitting in
// the raw HTML — we fetch it, find the "Featured Event" anchor, and pluck
// out the year, title, image, summary, and article link from the markup
// that follows. Cached server-side for 6h via the Next.js fetch wrapper.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export interface BritannicaTopic {
  year: number | null;
  title: string;
  summary: string;
  thumbnail: string | null;
  link: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function absolutize(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://www.britannica.com${url}`;
  return url;
}

function extractFeaturedEvent(html: string): BritannicaTopic | null {
  // Locate the "Featured Event" header in the HTML. Britannica uses this
  // wording verbatim, sometimes as a header, sometimes as an ARIA label.
  const featuredIdx = html.search(/Featured\s+Event/i);
  if (featuredIdx < 0) return null;

  // Work on the chunk that begins at (or just before) the header marker
  // and extends far enough to swallow the entire card. Going back a few
  // hundred chars lets us catch a containing <section> opening tag.
  const chunkStart = Math.max(0, featuredIdx - 400);
  const chunk = html.slice(chunkStart, featuredIdx + 8000);

  // Article link: first absolute /event/, /topic/, /biography/, /place/
  // href after the marker — those are Britannica's canonical article paths.
  const linkMatch = chunk.match(
    /<a[^>]+href=["'](\/(?:event|topic|biography|place|story|art|science|technology|sports)\/[^"']+)["']/i,
  );
  const link = absolutize(linkMatch ? linkMatch[1] : null);

  // Title: prefer the text of the article link we just found, otherwise
  // fall back to the next <h2>/<h3> on the card.
  let title = "";
  if (linkMatch) {
    const idx = chunk.indexOf(linkMatch[0]);
    const after = chunk.slice(idx);
    const labelMatch = after.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    if (labelMatch) title = stripTags(labelMatch[1]);
  }
  if (!title) {
    const hMatch = chunk.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
    if (hMatch) title = stripTags(hMatch[1]);
  }

  // Year: first 4-digit year (or year + BCE / BC) inside the card body.
  let year: number | null = null;
  const yearMatch = chunk.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  // Summary: first <p> after the header marker that's long enough to
  // actually be the article description (skip teaser tags / 1-word labels).
  let summary = "";
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(chunk)) !== null) {
    const txt = stripTags(m[1]);
    if (txt.length >= 40) { summary = txt; break; }
  }
  if (!summary) {
    // Fall back to the first non-empty <p>.
    const pMatch = chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) summary = stripTags(pMatch[1]);
  }

  // Thumbnail: first <img src> inside the card. Strip query-string sizing
  // when possible so the image scales cleanly.
  let thumbnail: string | null = null;
  const imgMatch = chunk.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) thumbnail = absolutize(imgMatch[1]);
  // Some Britannica thumbnails use data-src (lazy loaded); try that too.
  if (!thumbnail) {
    const dataSrcMatch = chunk.match(/<img[^>]+data-src=["']([^"']+)["']/i);
    if (dataSrcMatch) thumbnail = absolutize(dataSrcMatch[1]);
  }

  // Trim summary to ~280 chars so it doesn't dominate the masthead.
  if (summary.length > 280) summary = summary.slice(0, 277).trimEnd() + "…";

  if (!title || !summary) return null;
  return { year, title, summary, thumbnail, link };
}

export async function fetchBritannicaFeaturedEvent(): Promise<BritannicaTopic | null> {
  try {
    const res = await fetch("https://www.britannica.com/on-this-day", {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // 1h cache — Britannica rotates this once a day around midnight ET;
      // an hour-resolution cache means the new pick shows up promptly without
      // hammering the page on every request.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractFeaturedEvent(html);
  } catch {
    return null;
  }
}
