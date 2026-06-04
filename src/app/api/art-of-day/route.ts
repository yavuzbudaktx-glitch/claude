// Art Institute of Chicago — open public API, no key needed. We pick a
// deterministic-per-day artwork from the museum's most-popular public-domain
// pool so the "art of the day" stays stable through the day and rotates at
// midnight. ?r=N salts the seed for a manual refresh.

import { NextResponse } from "next/server";

export const revalidate = 3600;

interface AICResp {
  data?: Array<{
    id: number;
    title?: string;
    artist_display?: string;
    date_display?: string;
    image_id?: string;
    medium_display?: string;
    place_of_origin?: string;
    is_public_domain?: boolean;
    description?: string;
    thumbnail?: { alt_text?: string };
  }>;
  config?: { iiif_url?: string };
}

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  try {
    // The bracketed Elasticsearch query params on /artworks/search don't
    // survive a plain URL the way the docs imply, so we use the simple
    // /artworks listing instead: grab a date-seeded page of 100, keep the
    // ones that have an image (preferring public-domain), and pick one
    // deterministically per day. ?r=N salts both the page and the pick.
    const fields = "id,title,artist_display,date_display,image_id,medium_display,place_of_origin,is_public_domain,description,thumbnail";
    const PAGES = 60; // ~6,000 of the most prominent artworks
    const page = (seedIdx(dateKey + "-" + refresh + "-page", PAGES)) + 1;
    const r = await fetch(
      `https://api.artic.edu/api/v1/artworks?fields=${fields}&limit=100&page=${page}`,
      { next: { revalidate: 86400 }, headers: { "User-Agent": "rest-area/1.0", Accept: "application/json" } },
    );
    if (!r.ok) return NextResponse.json({ error: `aic_${r.status}` }, { status: 502 });
    const j = (await r.json()) as AICResp;
    const withImage = (j.data ?? []).filter((p) => p.image_id);
    const publicDomain = withImage.filter((p) => p.is_public_domain);
    const pool = publicDomain.length > 0 ? publicDomain : withImage;
    if (pool.length === 0) return NextResponse.json({ error: "no_art" }, { status: 502 });

    const idx = seedIdx(dateKey + "-" + refresh + "-art", pool.length);
    const p = pool[idx];
    const iiif = j.config?.iiif_url ?? "https://www.artic.edu/iiif/2";
    const imageUrl = `${iiif}/${p.image_id}/full/1200,/0/default.jpg`;

    return NextResponse.json({
      id: p.id,
      title: p.title,
      artist: p.artist_display,
      date: p.date_display,
      medium: p.medium_display,
      origin: p.place_of_origin,
      description: p.description ? stripTags(p.description) : null,
      alt: p.thumbnail?.alt_text ?? p.title,
      imageUrl,
      pageUrl: `https://www.artic.edu/artworks/${p.id}`,
      source: "Art Institute of Chicago",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "art_unavailable" },
      { status: 502 },
    );
  }
}
