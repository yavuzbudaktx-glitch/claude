// Accounting-news feed for the Accounting page. Three publications:
//   • Journal of Accountancy
//   • The CPA Journal
//   • Accounting Today
//
// These trade sites tend to block datacenter IPs (Vercel egress) and have
// finicky feed paths, so for each source we try a list of candidate feed
// URLs through a fetch fallback chain (direct → public proxies). If the
// native feed yields nothing, we fall back to a Google News `site:` search
// RSS, which is never IP-blocked and still links to the real articles.

import { NextResponse } from "next/server";
import Parser from "rss-parser";

export const revalidate = 1800; // 30 minutes

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

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
};

const parser = new Parser<{}, RawItem>({ timeout: 10000, headers: HEADERS });

interface Source {
  name: string;
  site: string;
  domain: string;
  feeds: string[];
}

const SOURCES: Source[] = [
  {
    name: "Journal of Accountancy",
    site: "https://www.journalofaccountancy.com/",
    domain: "journalofaccountancy.com",
    feeds: [
      "https://www.journalofaccountancy.com/content/jofa-home/rss_home.xml",
      "https://www.journalofaccountancy.com/news/rss.xml",
      "https://www.journalofaccountancy.com/feed",
    ],
  },
  {
    name: "The CPA Journal",
    site: "https://www.cpajournal.com/",
    domain: "cpajournal.com",
    feeds: ["https://www.cpajournal.com/feed/"],
  },
  {
    name: "Accounting Today",
    site: "https://www.accountingtoday.com/",
    domain: "accountingtoday.com",
    feeds: [
      "https://www.accountingtoday.com/feed",
      "https://www.accountingtoday.com/feed?rss=Y",
      "https://www.accountingtoday.com/rss",
    ],
  },
];

// Entity decoder (mirrors src/lib/feeds.ts) so RSS titles render with real
// punctuation instead of "Pillar&#8217;s".
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};
function decode(input: string): string {
  let s = input;
  for (let p = 0; p < 2 && /&[#a-zA-Z]/.test(s); p++) {
    s = s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => cp(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => cp(parseInt(d, 10)))
      .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) => NAMED[name] ?? m);
  }
  return s.trim();
}
function cp(n: number): string {
  try { return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : ""; } catch { return ""; }
}

// Direct fetch, then a chain of public read proxies that work from a
// datacenter IP (same set the watchlist + UFC widgets use).
function candidates(url: string): string[] {
  return [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
}

async function fetchText(url: string): Promise<string | null> {
  for (const c of candidates(url)) {
    try {
      const res = await fetch(c, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 200 && text.includes("<")) return text;
    } catch {
      // try next strategy
    }
  }
  return null;
}

function mapItems(items: RawItem[], source: string, stripSuffix = false): NewsItem[] {
  return items
    .map((it) => {
      let title = decode((it.title ?? "").trim());
      // Google News titles arrive as "Headline - Publisher"; drop the tail.
      if (stripSuffix) title = title.replace(/\s+-\s+[^-]+$/, "").trim();
      return {
        title,
        link: it.link ?? "",
        source,
        pubDate: it.isoDate ?? it.pubDate ?? new Date().toISOString(),
      };
    })
    .filter((x) => x.title && x.link);
}

async function fetchSource(src: Source): Promise<NewsItem[]> {
  // 1) native feeds
  for (const url of src.feeds) {
    const xml = await fetchText(url);
    if (!xml) continue;
    try {
      const feed = await parser.parseString(xml);
      const items = mapItems((feed.items ?? []).slice(0, 10), src.name);
      if (items.length) return items;
    } catch {
      // try next candidate URL
    }
  }
  // 2) Google News site search fallback — robust, never IP-blocked
  const gn = `https://news.google.com/rss/search?q=${encodeURIComponent(`site:${src.domain} when:30d`)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await fetchText(gn);
  if (xml) {
    try {
      const feed = await parser.parseString(xml);
      return mapItems((feed.items ?? []).slice(0, 10), src.name, true);
    } catch {
      // give up on this source
    }
  }
  return [];
}

export async function GET() {
  const settled = await Promise.allSettled(SOURCES.map(fetchSource));
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
      return perSource[v.source] <= 6;
    })
    .slice(0, 15);

  return NextResponse.json(
    { items, sources: SOURCES.map((s) => ({ name: s.name, site: s.site })) },
    { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" } },
  );
}
