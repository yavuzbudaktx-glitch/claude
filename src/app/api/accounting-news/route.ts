// Accounting-news feed for the Accounting page. Three sources:
//   • Journal of Accountancy
//   • The CPA Journal
//   • Accounting Today
// The list is dedupe'd by title and capped per-source so a single prolific
// publisher can't dominate the column. Served as JSON.

import { NextResponse } from "next/server";
import Parser from "rss-parser";

export const revalidate = 1800; // 30 minutes — these don't move fast.

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

interface RawItem {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
}

const parser = new Parser<{}, RawItem>({
  timeout: 9000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  },
});

const SOURCES: { name: string; url: string; site: string }[] = [
  { name: "Journal of Accountancy", url: "https://www.journalofaccountancy.com/news/rss.xml", site: "https://www.journalofaccountancy.com/" },
  { name: "The CPA Journal",        url: "https://www.cpajournal.com/feed/",                  site: "https://www.cpajournal.com/" },
  { name: "Accounting Today",       url: "https://www.accountingtoday.com/feed",              site: "https://www.accountingtoday.com/" },
];

// Same entity-decoder trick as src/lib/feeds.ts so RSS titles render with
// real punctuation instead of "Pillar&#8217;s" and the like.
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};
function decode(input: string): string {
  let s = input;
  for (let p = 0; p < 2 && /&[#a-zA-Z]/.test(s); p++) {
    s = s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16) || 32))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10) || 32))
      .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) => NAMED[name] ?? m);
  }
  return s;
}

async function fetchOne(src: typeof SOURCES[number]): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(src.url);
    return (feed.items ?? []).slice(0, 10).map((it) => ({
      title: decode((it.title ?? "").trim()),
      link: it.link ?? src.site,
      source: src.name,
      pubDate: it.isoDate ?? it.pubDate ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  const settled = await Promise.allSettled(SOURCES.map(fetchOne));
  const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const seen = new Set<string>();
  const perSource: Record<string, number> = {};
  const items = all
    .filter((v) => {
      const k = v.title.toLowerCase().trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => +new Date(b.pubDate) - +new Date(a.pubDate))
    .filter((v) => {
      perSource[v.source] = (perSource[v.source] ?? 0) + 1;
      return perSource[v.source] <= 5;
    })
    .slice(0, 14);

  return NextResponse.json({ items, sources: SOURCES.map((s) => ({ name: s.name, site: s.site })) });
}
