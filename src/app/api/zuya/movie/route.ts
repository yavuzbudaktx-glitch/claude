import { NextResponse } from "next/server";
import { getZuyaMember } from "@/lib/zuya/server";

export const dynamic = "force-dynamic";

// Movie/show search + IMDb ratings via OMDb (https://www.omdbapi.com).
// Needs a free key in the OMDB_API_KEY env var. Two modes:
//   ?q=<term>&kind=movie|show  → search results (title, year, cover, imdbID)
//   ?id=<imdbID>               → one item's detail incl. imdbRating
export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.OMDB_API_KEY;
  if (!key) return NextResponse.json({ results: [], error: "OMDb key not configured." });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (id) {
      const res = await fetch(`https://www.omdbapi.com/?apikey=${key}&i=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const j = (await res.json()) as Record<string, string>;
      return NextResponse.json({
        item: {
          title: j.Title ?? "",
          year: (j.Year ?? "").slice(0, 4),
          cover: j.Poster && j.Poster !== "N/A" ? j.Poster : "",
          rating: j.imdbRating && j.imdbRating !== "N/A" ? j.imdbRating : "",
          imdbID: j.imdbID ?? id,
        },
      });
    }

    const q = (url.searchParams.get("q") ?? "").trim();
    const type = url.searchParams.get("kind") === "show" ? "series" : "movie";
    if (q.length < 2) return NextResponse.json({ results: [] });

    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${key}&s=${encodeURIComponent(q)}&type=${type}`,
      { cache: "no-store" },
    );
    const j = (await res.json()) as { Search?: Array<Record<string, string>> };
    const results = (j.Search ?? []).slice(0, 7).map((r) => ({
      title: r.Title ?? "",
      year: (r.Year ?? "").slice(0, 4),
      cover: r.Poster && r.Poster !== "N/A" ? r.Poster : "",
      rating: "",
      imdbID: r.imdbID ?? "",
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
