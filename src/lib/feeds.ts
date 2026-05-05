import Parser from "rss-parser";

export type NewsCategory = "world" | "turkey" | "dallas" | "tech" | "finance";

export const CATEGORY_ORDER: NewsCategory[] = ["world", "turkey", "dallas", "tech", "finance"];

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  world: "World",
  turkey: "Türkiye",
  dallas: "Dallas",
  tech: "Tech & AI",
  finance: "Finance",
};

export interface FeedSource {
  name: string;
  url: string;
  category: NewsCategory;
}

export const FEEDS: FeedSource[] = [
  // World
  { name: "BBC World",     url: "https://feeds.bbci.co.uk/news/world/rss.xml",          category: "world" },
  { name: "Al Jazeera",    url: "https://www.aljazeera.com/xml/rss/all.xml",            category: "world" },
  { name: "Reuters World", url: "https://feeds.reuters.com/reuters/worldNews",          category: "world" },

  // Türkiye
  { name: "BBC Türkçe", url: "https://feeds.bbci.co.uk/turkce/rss.xml",      category: "turkey" },
  { name: "Hürriyet",   url: "https://www.hurriyet.com.tr/rss/anasayfa",     category: "turkey" },
  { name: "NTV",        url: "https://www.ntv.com.tr/son-dakika.rss",        category: "turkey" },
  { name: "Anadolu Ajansı", url: "https://www.aa.com.tr/tr/rss/default?cat=guncel", category: "turkey" },

  // Dallas / DFW
  { name: "WFAA",         url: "https://www.wfaa.com/feeds/syndication/rss/news/local",                category: "dallas" },
  { name: "NBC DFW",      url: "https://www.nbcdfw.com/?rss=y",                                         category: "dallas" },
  { name: "CBS DFW",      url: "https://www.cbsnews.com/dfw/local/rss/",                               category: "dallas" },
  { name: "Dallas News",  url: "https://www.dallasnews.com/arc/outboundfeeds/rss/category/news/?outputType=xml", category: "dallas" },

  // Tech & AI
  { name: "TechCrunch",      url: "https://techcrunch.com/feed/",                          category: "tech" },
  { name: "The Verge",       url: "https://www.theverge.com/rss/index.xml",                category: "tech" },
  { name: "Ars Technica",    url: "https://feeds.arstechnica.com/arstechnica/index",       category: "tech" },
  { name: "MIT Tech Review", url: "https://www.technologyreview.com/feed/",                category: "tech" },
  { name: "Hacker News",     url: "https://hnrss.org/frontpage",                           category: "tech" },

  // Finance
  { name: "CNBC Finance",     url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", category: "finance" },
  { name: "MarketWatch",      url: "https://feeds.marketwatch.com/marketwatch/topstories/", category: "finance" },
  { name: "Yahoo Finance",    url: "https://finance.yahoo.com/news/rssindex",               category: "finance" },
  { name: "FT Markets",       url: "https://www.ft.com/markets?format=rss",                 category: "finance" },
];

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  category: NewsCategory;
  pubDate: string;
  image?: string;
}

interface CustomItem {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  enclosure?: { url?: string; type?: string };
  ["media:thumbnail"]?: unknown;
  ["media:content"]?: unknown;
  ["media:group"]?: unknown;
  ["content:encoded"]?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  description?: string;
}

const parser = new Parser<{}, CustomItem>({
  timeout: 6000,
  customFields: {
    item: [
      ["media:thumbnail", "media:thumbnail", { keepArray: false }],
      ["media:content",   "media:content",   { keepArray: false }],
      ["media:group",     "media:group"],
      ["content:encoded", "content:encoded"],
    ],
  },
});

function pickUrl(node: unknown): string | undefined {
  if (!node) return undefined;
  if (typeof node === "string") return node.startsWith("http") ? node : undefined;
  if (Array.isArray(node)) {
    for (const x of node) {
      const u = pickUrl(x);
      if (u) return u;
    }
    return undefined;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.$ && typeof obj.$ === "object") {
      const dollar = obj.$ as Record<string, unknown>;
      if (typeof dollar.url === "string") return dollar.url;
    }
    if (typeof obj.url === "string") return obj.url;
    if (obj["media:thumbnail"]) {
      const u = pickUrl(obj["media:thumbnail"]);
      if (u) return u;
    }
    if (obj["media:content"]) {
      const u = pickUrl(obj["media:content"]);
      if (u) return u;
    }
  }
  return undefined;
}

function extractImage(item: CustomItem): string | undefined {
  if (item.enclosure?.url && (!item.enclosure.type || item.enclosure.type.startsWith("image"))) {
    return item.enclosure.url;
  }
  const fromThumb = pickUrl(item["media:thumbnail"]);
  if (fromThumb) return fromThumb;
  const fromContent = pickUrl(item["media:content"]);
  if (fromContent) return fromContent;
  const fromGroup = pickUrl(item["media:group"]);
  if (fromGroup) return fromGroup;

  const html = item["content:encoded"] || item.content || item.description || item.summary || "";
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) return m[1];
  return undefined;
}

export async function fetchAllFeeds(perCategory = 6): Promise<Record<NewsCategory, NewsItem[]>> {
  const results = await Promise.allSettled(
    FEEDS.map(async (f): Promise<NewsItem[]> => {
      try {
        const feed = await parser.parseURL(f.url);
        return (feed.items ?? []).slice(0, 10).map((it) => ({
          title: (it.title ?? "").trim(),
          link: it.link ?? "",
          source: f.name,
          category: f.category,
          pubDate: it.isoDate ?? it.pubDate ?? new Date().toISOString(),
          image: extractImage(it),
        }));
      } catch {
        return [];
      }
    }),
  );

  const all: NewsItem[] = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const grouped: Record<NewsCategory, NewsItem[]> = {
    world: [], turkey: [], dallas: [], tech: [], finance: [],
  };
  for (const item of all) grouped[item.category].push(item);

  for (const cat of Object.keys(grouped) as NewsCategory[]) {
    grouped[cat] = grouped[cat]
      .filter((v, i, arr) => arr.findIndex((x) => x.title === v.title) === i)
      .sort((a, b) => +new Date(b.pubDate) - +new Date(a.pubDate))
      .slice(0, perCategory);
  }

  return grouped;
}
