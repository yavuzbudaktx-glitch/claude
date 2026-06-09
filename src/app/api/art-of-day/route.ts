// Art of the day — a TRULY random painting from The Met's full
// Open Access painting library (~5,000+ items with images, all
// public-domain). No hand-picked themes, no curated short-list: we
// search once for every public-domain painting with an image, then
// pick deterministically by date. Net result: ~5k different paintings
// in rotation, vs the 40-theme hand-list before. ?r=N salts the seed.

import { NextResponse } from "next/server";

export const revalidate = 3600;
export const maxDuration = 30;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

interface MetSearch { total?: number; objectIDs?: number[] | null }
interface MetObject {
  objectID: number;
  title?: string;
  artistDisplayName?: string;
  objectDate?: string;
  medium?: string;
  culture?: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  objectURL?: string;
  isHighlight?: boolean;
  isPublicDomain?: boolean;
}

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
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

// Cache the (large) full-library object-ID list for a day so we don't have
// to re-fetch all ~5k IDs on every request. Module-level cache lives for
// the lifetime of the serverless function instance.
let idsCache: { at: number; ids: number[] } | null = null;
const IDS_TTL_MS = 1000 * 60 * 60 * 24;

async function fetchAllPaintingIds(): Promise<number[]> {
  if (idsCache && Date.now() - idsCache.at < IDS_TTL_MS && idsCache.ids.length > 0) return idsCache.ids;
  // Every public-domain object whose medium contains "painting" and whose
  // record has at least one image.
  const search = await getJson<MetSearch>(
    `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&medium=Paintings&q=*`,
  );
  let ids = search?.objectIDs ?? [];
  if (!ids || ids.length === 0) {
    // Fallback: drop the wildcard so the Met returns its default popular set.
    const s2 = await getJson<MetSearch>(
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&medium=Paintings&q=art`,
    );
    ids = s2?.objectIDs ?? [];
  }
  if (ids && ids.length > 0) idsCache = { at: Date.now(), ids };
  return ids ?? [];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  const ids = await fetchAllPaintingIds();
  if (ids.length === 0) {
    return NextResponse.json({ error: "art_unavailable" }, { status: 502 });
  }

  // Walk a small window of deterministic candidates until one has an image.
  // Some Met records claim hasImages but the object endpoint returns "".
  let obj: MetObject | null = null;
  for (let i = 0; i < 12 && !obj; i++) {
    const idx = seedIdx(dateKey + ":pick:" + refresh + ":" + i, ids.length);
    const candidate = await getJson<MetObject>(
      `https://collectionapi.metmuseum.org/public/collection/v1/objects/${ids[idx]}`,
    );
    if (candidate && (candidate.primaryImage || candidate.primaryImageSmall)) obj = candidate;
  }
  if (!obj) {
    return NextResponse.json({ error: "no_image" }, { status: 502 });
  }

  return NextResponse.json(
    {
      id: obj.objectID,
      title: obj.title || "Untitled",
      artist: obj.artistDisplayName || obj.culture || "",
      date: obj.objectDate || "",
      medium: obj.medium || "",
      origin: obj.culture || "",
      description: null,
      alt: obj.title ?? "",
      imageUrl: obj.primaryImage || obj.primaryImageSmall || "",
      pageUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
      source: "The Met",
      highlight: !!obj.isHighlight,
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
