// Pure HTML parser for Britannica's on-this-day Featured Event. Lives
// separate from the fetcher so the client can call it on a CORS-proxied
// response without dragging in Next.js's server-only `revalidate` option.

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

function clampSummary(text: string): string {
  if (text.length > 280) return text.slice(0, 277).trimEnd() + "…";
  return text;
}

// A real Britannica featured-event title is multi-word and at least a
// dozen characters. Anything shorter or generic ("Read", "More", "Home")
// is link-cruft from the wrong card chunk and should be rejected so the
// caller falls through to the next extraction strategy.
function isMeaningfulTitle(s: string): boolean {
  const t = s.trim();
  if (t.length < 12) return false;
  if (t.split(/\s+/).length < 2) return false;
  if (/^(read|more|browse|see|view|home|details|next|previous|subscribe|sign\s*in)\b/i.test(t)) {
    return false;
  }
  return true;
}

function extractFromChunk(chunk: string): BritannicaTopic | null {
  const linkMatch = chunk.match(
    /<a[^>]+href=["'](\/(?:event|topic|biography|place|story|art|science|technology|sports|animal)\/[^"'#]+)["']/i,
  );
  const link = absolutize(linkMatch ? linkMatch[1] : null);

  let title = "";
  if (linkMatch) {
    const idx = chunk.indexOf(linkMatch[0]);
    const after = chunk.slice(idx);
    const labelMatch = after.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    if (labelMatch) {
      const candidate = stripTags(labelMatch[1]);
      if (isMeaningfulTitle(candidate)) title = candidate;
    }
  }
  if (!title) {
    // Walk every heading inside the chunk — first one that looks like a
    // real headline wins.
    const hRe = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
    let hm: RegExpExecArray | null;
    while ((hm = hRe.exec(chunk)) !== null) {
      const candidate = stripTags(hm[1]);
      if (isMeaningfulTitle(candidate)) { title = candidate; break; }
    }
  }

  let year: number | null = null;
  const yearMatch = chunk.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  let summary = "";
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(chunk)) !== null) {
    const txt = stripTags(m[1]);
    if (txt.length >= 40) { summary = txt; break; }
  }
  if (!summary) {
    const pMatch = chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) summary = stripTags(pMatch[1]);
  }

  let thumbnail: string | null = null;
  const imgMatch = chunk.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
  if (imgMatch) thumbnail = absolutize(imgMatch[1]);

  if (!title || !summary) return null;
  return { year, title, summary: clampSummary(summary), thumbnail, link };
}

function tryJsonLd(html: string): BritannicaTopic | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const json = JSON.parse(m[1]);
      const candidates = Array.isArray(json) ? json : [json];
      for (const node of candidates) {
        const type = String(node?.["@type"] ?? "").toLowerCase();
        if (!type.includes("article") && !type.includes("event") && !type.includes("creativework")) continue;
        const headline = node.headline ?? node.name;
        const description = node.description ?? node.about;
        if (!headline || !description) continue;
        const image =
          typeof node.image === "string" ? node.image :
          Array.isArray(node.image) ? node.image[0] :
          (node.image?.url ?? null);
        let year: number | null = null;
        if (typeof node.datePublished === "string") {
          const y = node.datePublished.match(/^(\d{4})/);
          if (y) year = parseInt(y[1], 10);
        }
        return {
          year,
          title: String(headline),
          summary: clampSummary(String(description)),
          thumbnail: image ?? null,
          link: typeof node.url === "string" ? node.url : null,
        };
      }
    } catch {
      // ignore non-JSON blocks
    }
  }
  return null;
}

function tryFeaturedMarker(html: string): BritannicaTopic | null {
  const idx = html.search(/Featured\s+Event/i);
  if (idx < 0) return null;
  const chunk = html.slice(Math.max(0, idx - 400), idx + 9000);
  return extractFromChunk(chunk);
}

function tryFeaturedClass(html: string): BritannicaTopic | null {
  const cls = html.search(/class="[^"]*\bfeatur[a-z]*\b[^"]*"/i);
  if (cls < 0) return null;
  const start = Math.max(0, html.lastIndexOf("<", cls) - 50);
  const chunk = html.slice(start, start + 9000);
  return extractFromChunk(chunk);
}

function tryFirstEventLink(html: string): BritannicaTopic | null {
  const linkRe = /<a[^>]+href=["']\/event\/[^"']+["'][^>]*>/i;
  const idx = html.search(linkRe);
  if (idx < 0) return null;
  const articleIdx = html.lastIndexOf("<article", idx);
  const start = articleIdx >= 0 ? articleIdx : Math.max(0, idx - 500);
  const chunk = html.slice(start, idx + 8000);
  return extractFromChunk(chunk);
}

function tryFirstTopicLink(html: string): BritannicaTopic | null {
  // Fall-back: many "Featured Event" cards link to /topic/ or /biography/
  // pages rather than /event/. Scan for the first one of those.
  const linkRe = /<a[^>]+href=["']\/(?:topic|biography|place|story|art|science|technology|sports|animal)\/[^"']+["'][^>]*>/i;
  const idx = html.search(linkRe);
  if (idx < 0) return null;
  const articleIdx = html.lastIndexOf("<article", idx);
  const start = articleIdx >= 0 ? articleIdx : Math.max(0, idx - 500);
  const chunk = html.slice(start, idx + 8000);
  return extractFromChunk(chunk);
}

function tryOgMeta(html: string): BritannicaTopic | null {
  // When the page deep-links to a specific day, og:title/description often
  // describe the featured event rather than the generic landing.
  const og = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, "i"))?.[1] ??
    null;
  const title = og("og:title");
  const description = og("og:description");
  const image = og("og:image");
  const url = og("og:url");
  if (!title || !description) return null;
  // Skip generic landing-page OG (no year, no specific topic). The signal:
  // description starting with "Discover", "Explore", or containing "every day".
  if (/^(discover|explore|read|browse)\b|every\s+day|on this day events/i.test(description)) return null;
  let year: number | null = null;
  const yearMatch = description.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);
  return {
    year,
    title: decodeEntities(title),
    summary: clampSummary(decodeEntities(description)),
    thumbnail: image ?? null,
    link: url ?? null,
  };
}

// Reject obviously-wrong scrapes (matched a sidebar / newsletter widget /
// "featured topics" sub-section). Real featured events have a substantial
// description and either a year or an article link.
export function isPlausibleFeaturedEvent(t: BritannicaTopic): boolean {
  if (!t.title || !isMeaningfulTitle(t.title)) return false;
  if (!t.summary || t.summary.length < 50) return false;
  // Common false-positive titles when the parser latches onto the wrong card.
  if (/subscribe|newsletter|britannica premium|sign\s*up|sign\s*in|advertise|cookie|sign in|search/i.test(t.title)) return false;
  if (!t.year && !t.link) return false;
  return true;
}

export function extractFeaturedEvent(html: string): BritannicaTopic | null {
  const candidates = [
    tryJsonLd(html),
    tryFeaturedMarker(html),
    tryFeaturedClass(html),
    tryOgMeta(html),
    tryFirstEventLink(html),
    tryFirstTopicLink(html),
  ];
  for (const c of candidates) {
    if (c && isPlausibleFeaturedEvent(c)) return c;
  }
  return null;
}
