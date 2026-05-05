import Parser from "rss-parser";

export type NewsCategory = "turkey" | "tech" | "world" | "science";

export interface FeedSource {
  name: string;
  url: string;
  category: NewsCategory;
}

export const FEEDS: FeedSource[] = [
  // Turkey
  { name: "BBC Türkçe", url: "https://feeds.bbci.co.uk/turkce/rss.xml", category: "turkey" },
  { name: "Hürriyet", url: "https://www.hurriyet.com.tr/rss/anasayfa", category: "turkey" },
  { name: "NTV", url: "https://www.ntv.com.tr/son-dakika.rss", category: "turkey" },

  // Tech / AI / Startups
  { name: "Hacker News", url: "https://hnrss.org/frontpage", category: "tech" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "tech" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "tech" },

  // World / Politics
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "world" },
  { name: "Reuters World", url: "https://feeds.reuters.com/reuters/worldNews", category: "world" },

  // Science / Space
  { name: "NASA", url: "https://www.nasa.gov/news-release/feed/", category: "science" },
  { name: "Science Daily", url: "https://www.sciencedaily.com/rss/all.xml", category: "science" },
];

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  category: NewsCategory;
  pubDate: string;
}

const parser: Parser = new Parser({ timeout: 5000 });

export async function fetchAllFeeds(perCategory = 5): Promise<Record<NewsCategory, NewsItem[]>> {
  const results = await Promise.allSettled(
    FEEDS.map(async (f): Promise<NewsItem[]> => {
      try {
        const feed = await parser.parseURL(f.url);
        return (feed.items ?? []).slice(0, 8).map((it) => ({
          title: (it.title ?? "").trim(),
          link: it.link ?? "",
          source: f.name,
          category: f.category,
          pubDate: it.isoDate ?? it.pubDate ?? new Date().toISOString(),
        }));
      } catch {
        return [];
      }
    }),
  );

  const all: NewsItem[] = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const grouped: Record<NewsCategory, NewsItem[]> = { turkey: [], tech: [], world: [], science: [] };
  for (const item of all) grouped[item.category].push(item);

  for (const cat of Object.keys(grouped) as NewsCategory[]) {
    grouped[cat] = grouped[cat]
      .filter((v, i, arr) => arr.findIndex((x) => x.title === v.title) === i)
      .sort((a, b) => +new Date(b.pubDate) - +new Date(a.pubDate))
      .slice(0, perCategory);
  }

  return grouped;
}

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  turkey: "Türkiye",
  tech: "Tech & AI",
  world: "World",
  science: "Science",
};
