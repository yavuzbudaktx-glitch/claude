import { NextResponse } from "next/server";
import { getZuyaMember } from "@/lib/zuya/server";

export const dynamic = "force-dynamic";

interface MovieHit {
  title: string;
  year: string;
  cover: string;
}

// Search movie/show titles + posters via the iTunes Search API — keyless, no
// signup, and reliable from a server. We upscale the 100px artwork to 600px.
export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const kind = url.searchParams.get("kind") === "show" ? "show" : "movie";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const params = new URLSearchParams({
    term: q,
    country: "US",
    limit: "6",
    media: kind === "show" ? "tvShow" : "movie",
    entity: kind === "show" ? "tvSeason" : "movie",
  });

  try {
    const res = await fetch(`https://itunes.apple.com/search?${params}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ results: [] });
    const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const seen = new Set<string>();
    const results: MovieHit[] = [];
    for (const r of json.results ?? []) {
      const title = String((kind === "show" ? r.collectionName : r.trackName) ?? "").trim();
      if (!title || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      const art = String(r.artworkUrl100 ?? "");
      results.push({
        title,
        year: String(r.releaseDate ?? "").slice(0, 4),
        cover: art ? art.replace("100x100bb", "600x600bb") : "",
      });
      if (results.length >= 6) break;
    }
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
