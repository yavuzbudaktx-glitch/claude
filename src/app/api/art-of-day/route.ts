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

  // Fetch a window of deterministic candidates IN PARALLEL and take the first
  // (by seed order) that actually has an image. Some Met records claim
  // hasImages but the object endpoint returns "". Doing these 8 lookups in
  // parallel instead of sequentially keeps us well under the function's time
  // limit — the old sequential 12-deep walk could take long enough that the
  // function was killed and the tab showed nothing.
  const candidateIdxs = Array.from({ length: 8 }, (_, i) =>
    ids[seedIdx(dateKey + ":pick:" + refresh + ":" + i, ids.length)],
  );
  const candidates = await Promise.all(
    candidateIdxs.map((cid) =>
      getJson<MetObject>(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${cid}`),
    ),
  );
  const obj = candidates.find((c) => c && (c.primaryImage || c.primaryImageSmall)) ?? null;
  if (!obj) {
    return NextResponse.json({ error: "no_image" }, { status: 502 });
  }

  // Description path: Wikipedia search ONLY. The Met scrape used to work
  // when we could go through public CORS proxies; today Vercel egress
  // (and any proxy that ultimately exits via cloud IP space) gets the
  // "Vercel Security Checkpoint" 429 wall instead of the real page —
  // which is what was leaking into the description field.
  // Wikipedia is reachable from Vercel, returns clean prose, and covers
  // most Met paintings (or their artists) very well.
  let description: string | null = null;
  const pageUrl = obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`;

  // Wikipedia fetch — pull the article extract that best matches a query.
  // We restrict to namespace 0 (articles only, no Categories / Files) and
  // verify the chosen hit isn't a disambiguation page or a list. The Met
  // tombstone title almost never matches an exact Wikipedia page title, so
  // we SEARCH and rank the candidates.
  async function wikiBestExtract(
    query: string,
    accept: (title: string, extract: string) => boolean,
  ): Promise<string | null> {
    const s = await getJson<{ query?: { search?: Array<{ title?: string }> } }>(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&srnamespace=0&format=json&origin=*&srsearch=${encodeURIComponent(query)}`,
    );
    const hits = s?.query?.search ?? [];
    for (const hit of hits) {
      if (!hit.title) continue;
      if (/^(list of|disambiguation|category:|file:)/i.test(hit.title)) continue;
      const sum = await getJson<{ extract?: string; type?: string; title?: string }>(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`,
      );
      if (sum?.type === "disambiguation") continue;
      if (sum?.extract && accept(sum.title ?? hit.title, sum.extract)) {
        return sum.extract.length > 700 ? sum.extract.slice(0, 697).trimEnd() + "…" : sum.extract;
      }
    }
    return null;
  }

  // 1) Try the painting itself. Accept only when the page mentions painting,
  //    work, or the artist's surname — otherwise we'd pin unrelated articles.
  if (obj.title) {
    const artistSurname = obj.artistDisplayName?.split(/\s+/).slice(-1)[0] ?? "";
    const byPainting = await wikiBestExtract(
      `${obj.title}${obj.artistDisplayName ? ` ${obj.artistDisplayName}` : ""}`,
      (title, extract) => {
        if (extract.length < 80) return false;
        const t = (title + " " + extract).toLowerCase();
        return /(painting|portrait|canvas|oil|tempera|watercolor|fresco|panel)/.test(t) ||
               (artistSurname.length > 2 && t.includes(artistSurname.toLowerCase()));
      },
    );
    if (byPainting) description = byPainting;
  }

  // 2) Fall back to the artist's Wikipedia bio — the most reliable single
  //    source for context, and almost every Met-collected artist has one.
  //    Accept only when the article looks like a biography of THIS person
  //    (page title contains the surname or "painter/artist" appears in extract).
  if (!description && obj.artistDisplayName) {
    const artistSurname = obj.artistDisplayName.split(/\s+/).slice(-1)[0] ?? "";
    const byArtist = await wikiBestExtract(obj.artistDisplayName, (title, extract) => {
      if (extract.length < 80) return false;
      const surnameOK = artistSurname.length > 2 && title.toLowerCase().includes(artistSurname.toLowerCase());
      const biokeys = /(painter|artist|sculptor|engraver|printmaker|draftsman|illustrator)/i.test(extract.slice(0, 400));
      return surnameOK || biokeys;
    });
    if (byArtist) description = `About the artist — ${byArtist}`;
  }

  // 3) Floor: synthesize from the tombstone so the info pane is never blank.
  if (!description) {
    const parts: string[] = [];
    if (obj.medium) parts.push(obj.medium);
    if (obj.culture) parts.push(obj.culture);
    if (obj.objectDate) parts.push(obj.objectDate);
    const tomb = `${obj.title || "Untitled"}${obj.artistDisplayName ? `, by ${obj.artistDisplayName}` : ""}.${parts.length ? " " + parts.join(", ") + "." : ""}`;
    description = tomb;
  }

  return NextResponse.json(
    {
      id: obj.objectID,
      title: obj.title || "Untitled",
      artist: obj.artistDisplayName || obj.culture || "",
      date: obj.objectDate || "",
      medium: obj.medium || "",
      origin: obj.culture || "",
      description,
      alt: obj.title ?? "",
      imageUrl: obj.primaryImage || obj.primaryImageSmall || "",
      pageUrl,
      source: "The Met",
      highlight: !!obj.isHighlight,
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
