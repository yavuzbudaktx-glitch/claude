// Art of the day — a genuinely interesting painting per day from a curated
// rotation of major artists & movements (Met first, AIC fallback). Both
// museums publish full Open-Access JSON; we search for the day's term, prefer
// HIGHLIGHTS with images, and pick deterministically. ?r=N salts the seed.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
  "AIC-User-Agent": "Rest Area dashboard (personal use)",
};

// Curated themes — famous painters and movements that reliably surface
// striking, recognisable canvases (not "vase, plate, 19th century").
const THEMES = [
  "Van Gogh", "Monet", "Rembrandt", "Vermeer", "Cézanne", "Caravaggio",
  "Goya", "Velázquez", "Klimt", "Degas", "Renoir", "Manet", "Pissarro",
  "Sargent", "Whistler", "Turner", "Constable", "Hopper",
  "Picasso", "Matisse", "Chagall", "Kandinsky", "Mondrian", "Hokusai",
  "Hiroshige", "Utamaro", "Brueghel", "Bosch", "Dürer",
  "Impressionism", "Post-Impressionism", "Romanticism", "Symbolism",
  "Pre-Raphaelite", "Art Nouveau", "Italian Renaissance",
  "Dutch Golden Age", "Hudson River School", "ukiyo-e",
];

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function getJson<T>(url: string): Promise<T | null> {
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
      if (!text || (text[0] !== "{" && text[0] !== "[")) continue;
      return JSON.parse(text) as T;
    } catch { /* next */ }
  }
  return null;
}

// ----- The Met (preferred) --------------------------------------------------
interface MetSearch { total?: number; objectIDs?: number[] | null }
interface MetObject {
  objectID: number; title?: string; artistDisplayName?: string;
  objectDate?: string; medium?: string; culture?: string;
  primaryImage?: string; primaryImageSmall?: string; objectURL?: string;
  isHighlight?: boolean; classification?: string;
}

async function pickFromMet(theme: string, dateKey: string, refresh: string) {
  // Constrain to paintings, with images.
  const search = await getJson<MetSearch>(
    `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&medium=Paintings&q=${encodeURIComponent(theme)}`,
  );
  const ids = (search?.objectIDs ?? []).slice(0, 400);
  if (ids.length === 0) return null;

  let firstImaged: MetObject | null = null;
  let highlight: MetObject | null = null;
  for (let i = 0; i < 12 && !highlight; i++) {
    const idx = seedIdx(dateKey + "-" + refresh + "-met-" + i, ids.length);
    const obj = await getJson<MetObject>(
      `https://collectionapi.metmuseum.org/public/collection/v1/objects/${ids[idx]}`,
    );
    if (!obj) continue;
    const img = obj.primaryImage || obj.primaryImageSmall;
    if (!img) continue;
    if (!firstImaged) firstImaged = obj;
    if (obj.isHighlight) highlight = obj;
  }
  const obj = highlight ?? firstImaged;
  if (!obj) return null;

  return {
    id: obj.objectID,
    title: obj.title || "Untitled",
    artist: obj.artistDisplayName || obj.culture || "",
    date: obj.objectDate || "",
    medium: obj.medium || "",
    origin: obj.culture || "",
    description: null as string | null,
    alt: obj.title ?? "",
    imageUrl: obj.primaryImage || obj.primaryImageSmall || "",
    pageUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
    source: "The Met",
    theme,
    highlight: !!obj.isHighlight,
  };
}

// ----- AIC fallback (also great, just less of a paintings bias) ------------
interface AICItem {
  id: number; title?: string; artist_display?: string; date_display?: string;
  image_id?: string; medium_display?: string; place_of_origin?: string;
  is_public_domain?: boolean; description?: string;
  thumbnail?: { alt_text?: string };
}
interface AICResp { data?: AICItem[]; config?: { iiif_url?: string } }

async function pickFromAic(theme: string, dateKey: string, refresh: string) {
  const fields = "id,title,artist_display,date_display,image_id,medium_display,place_of_origin,is_public_domain,description,thumbnail";
  const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(theme)}&query[term][is_public_domain]=true&fields=${fields}&limit=100`;
  const j = await getJson<AICResp>(url);
  const pool = (j?.data ?? []).filter((p) => p.image_id);
  if (pool.length === 0) return null;
  const idx = seedIdx(dateKey + "-" + refresh + "-aic", pool.length);
  const p = pool[idx];
  const iiif = j?.config?.iiif_url ?? "https://www.artic.edu/iiif/2";
  return {
    id: p.id,
    title: p.title ?? "Untitled",
    artist: p.artist_display ?? "",
    date: p.date_display ?? "",
    medium: p.medium_display ?? "",
    origin: p.place_of_origin ?? "",
    description: p.description ? stripTags(p.description) : null,
    alt: p.thumbnail?.alt_text ?? p.title ?? "",
    imageUrl: `${iiif}/${p.image_id}/full/1200,/0/default.jpg`,
    pageUrl: `https://www.artic.edu/artworks/${p.id}`,
    source: "Art Institute of Chicago",
    theme,
    highlight: false,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  const theme = THEMES[seedIdx(dateKey + "-" + refresh + "-theme", THEMES.length)];
  const picked = (await pickFromMet(theme, dateKey, refresh)) ?? (await pickFromAic(theme, dateKey, refresh));
  if (!picked) return NextResponse.json({ error: "art_unavailable", theme }, { status: 502 });

  return NextResponse.json(picked, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" },
  });
}
