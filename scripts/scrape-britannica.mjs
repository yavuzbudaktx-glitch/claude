// Daily Britannica "Featured Event" scraper. Runs on GitHub Actions
// (Azure-backed IPs, not on Britannica's anti-bot blocklist), hits
// britannica.com/on-this-day, parses the Featured Event card, and
// writes the result to public/data/featured-event.json so the Next.js
// app can read it server-side without ever needing to talk to
// britannica.com itself.
//
// The parser mirrors src/lib/britannica-extract.ts but is inlined here
// so this script is self-contained (no TypeScript runner needed).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.resolve(__dirname, "../public/data/featured-event.json");

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

// ---------- Parser (mirrors src/lib/britannica-extract.ts) -----------------

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&apos;|&#39;|&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}
function absolutize(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://www.britannica.com${url}`;
  return url;
}
function clampSummary(t) {
  return t.length > 320 ? t.slice(0, 317).trimEnd() + "…" : t;
}
function isMeaningfulTitle(s) {
  const t = s.trim();
  if (t.length < 12) return false;
  if (t.split(/\s+/).length < 2) return false;
  if (/^(read|more|browse|see|view|home|details|next|previous|subscribe|sign\s*in)\b/i.test(t)) return false;
  return true;
}
function isPlausible(t) {
  if (!t) return false;
  if (!t.title || !isMeaningfulTitle(t.title)) return false;
  if (!t.summary || t.summary.length < 50) return false;
  if (/subscribe|newsletter|britannica premium|sign\s*up|sign\s*in|advertise|cookie/i.test(t.title)) return false;
  if (!t.year && !t.link) return false;
  return true;
}

function tryJsonLd(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const type = String(node?.["@type"] ?? "").toLowerCase();
        if (!type.includes("article") && !type.includes("event") && !type.includes("creativework")) continue;
        const headline = node.headline ?? node.name;
        const description = node.description ?? node.about;
        if (!headline || !description) continue;
        let year = null;
        if (typeof node.datePublished === "string") {
          const y = node.datePublished.match(/^(\d{4})/);
          if (y) year = parseInt(y[1], 10);
        }
        if (!year) {
          const y = String(description).match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
          if (y) year = parseInt(y[1], 10);
        }
        return {
          year,
          title: decodeEntities(String(headline)),
          summary: clampSummary(decodeEntities(String(description))),
          link: typeof node.url === "string" ? node.url : null,
        };
      }
    } catch { /* skip */ }
  }
  return null;
}

function extractFromChunk(chunk) {
  const linkMatch = chunk.match(
    /<a[^>]+href=["'](\/(?:event|topic|biography|place|story|art|science|technology|sports|animal)\/[^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/i,
  );
  const link = absolutize(linkMatch ? linkMatch[1] : null);

  let title = "";
  if (linkMatch) {
    const candidate = stripTags(linkMatch[2]);
    if (isMeaningfulTitle(candidate)) title = candidate;
  }
  if (!title) {
    const hRe = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
    let hm;
    while ((hm = hRe.exec(chunk)) !== null) {
      const c = stripTags(hm[1]);
      if (isMeaningfulTitle(c)) { title = c; break; }
    }
  }

  let year = null;
  const yearM = chunk.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
  if (yearM) year = parseInt(yearM[1], 10);

  let summary = "";
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pm;
  while ((pm = pRe.exec(chunk)) !== null) {
    const txt = stripTags(pm[1]);
    if (txt.length >= 40) { summary = txt; break; }
  }
  if (!summary) {
    const pMatch = chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) summary = stripTags(pMatch[1]);
  }

  if (!title || !summary) return null;
  return { year, title, summary: clampSummary(summary), link };
}

function tryFeaturedMarker(html) {
  const idx = html.search(/Featured\s+Event/i);
  if (idx < 0) return null;
  const chunk = html.slice(Math.max(0, idx - 400), idx + 12000);
  return extractFromChunk(chunk);
}
function tryFeaturedClass(html) {
  const cls = html.search(/class="[^"]*\bfeatur[a-z]*\b[^"]*"/i);
  if (cls < 0) return null;
  const start = Math.max(0, html.lastIndexOf("<", cls) - 50);
  return extractFromChunk(html.slice(start, start + 12000));
}
function tryFirstEventLink(html) {
  const re = /<a[^>]+href=["']\/event\/[^"']+["'][^>]*>/i;
  const idx = html.search(re);
  if (idx < 0) return null;
  const start = Math.max(html.lastIndexOf("<article", idx), 0);
  return extractFromChunk(html.slice(start, start + 10000));
}

function extractFeaturedEvent(html) {
  const candidates = [
    tryJsonLd(html),
    tryFeaturedMarker(html),
    tryFeaturedClass(html),
    tryFirstEventLink(html),
  ];
  for (const c of candidates) {
    if (c && isPlausible(c)) return c;
  }
  return null;
}

// ---------- Fetcher --------------------------------------------------------

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.text();
}

async function main() {
  const now = new Date();
  const monthName = MONTHS[now.getUTCMonth()];
  const day = now.getUTCDate();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  const candidates = [
    `https://www.britannica.com/on-this-day/${monthName}-${day}`,
    "https://www.britannica.com/on-this-day",
  ];

  let topic = null;
  let usedUrl = null;
  for (const url of candidates) {
    try {
      console.log(`Fetching ${url}…`);
      const html = await fetchHtml(url);
      const parsed = extractFeaturedEvent(html);
      if (parsed) {
        topic = parsed;
        usedUrl = url;
        break;
      } else {
        console.log(`  → parser returned no plausible event`);
      }
    } catch (e) {
      console.log(`  → ${e.message}`);
    }
  }

  if (!topic) {
    console.error("Could not extract a plausible Featured Event from any URL.");
    process.exit(1);
  }

  const payload = {
    date: `${mm}-${dd}`,
    year: topic.year,
    title: topic.title,
    summary: topic.summary,
    link: topic.link ?? usedUrl,
    generatedAt: new Date().toISOString(),
    sourceUrl: usedUrl,
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`  ${payload.year}: ${payload.title}`);
  console.log(`  ${payload.summary.slice(0, 120)}…`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
