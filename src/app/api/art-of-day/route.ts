// Art Institute of Chicago — open public API, no key needed. We pick a
// deterministic-per-day public-domain artwork. The bare fetch from a cloud
// egress IP is sometimes refused, so we go through a small proxy chain (the
// same trick the YouTube + Reddit routes use). ?r=N salts the seed.

import { NextResponse } from "next/server";

export const revalidate = 3600;

interface AICItem {
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
}
interface AICResp { data?: AICItem[]; config?: { iiif_url?: string } }

const HEADERS = {
  // AIC asks API consumers to identify themselves; sending this makes them
  // far less likely to throttle/deny the request.
  "AIC-User-Agent": "Rest Area dashboard (personal use)",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function getJson(url: string): Promise<AICResp | null> {
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text[0] !== "{") continue;
      return JSON.parse(text) as AICResp;
    } catch { /* next proxy */ }
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  const fields = "id,title,artist_display,date_display,image_id,medium_display,place_of_origin,is_public_domain,description,thumbnail";
  const PAGES = 60; // ~6,000 of the most prominent artworks
  const page = seedIdx(dateKey + "-" + refresh + "-page", PAGES) + 1;

  // First choice: a date-seeded page. Fallback: page 1 (always populated).
  let j = await getJson(`https://api.artic.edu/api/v1/artworks?fields=${fields}&limit=100&page=${page}`);
  let pool = ((j?.data ?? []).filter((p) => p.image_id));
  if (pool.filter((p) => p.is_public_domain).length === 0) {
    const j1 = await getJson(`https://api.artic.edu/api/v1/artworks?fields=${fields}&limit=100&page=1`);
    if (j1) { j = j1; pool = (j1.data ?? []).filter((p) => p.image_id); }
  }
  if (!j || pool.length === 0) {
    return NextResponse.json({ error: "art_unavailable" }, { status: 502 });
  }

  const pd = pool.filter((p) => p.is_public_domain);
  const usable = pd.length > 0 ? pd : pool;
  const idx = seedIdx(dateKey + "-" + refresh + "-art", usable.length);
  const p = usable[idx];
  const iiif = j.config?.iiif_url ?? "https://www.artic.edu/iiif/2";

  return NextResponse.json(
    {
      id: p.id,
      title: p.title,
      artist: p.artist_display,
      date: p.date_display,
      medium: p.medium_display,
      origin: p.place_of_origin,
      description: p.description ? stripTags(p.description) : null,
      alt: p.thumbnail?.alt_text ?? p.title,
      imageUrl: `${iiif}/${p.image_id}/full/1200,/0/default.jpg`,
      pageUrl: `https://www.artic.edu/artworks/${p.id}`,
      source: "Art Institute of Chicago",
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
