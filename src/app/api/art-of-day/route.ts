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

  // The Met collection API doesn't return the long description that's
  // shown on the public artwork page. We scrape it from the page itself
  // (the curator's "View more" copy that sits next to the image), going
  // through the same proxy chain so it works from Vercel egress.
  //
  // Jina Reader is intentionally LAST in the chain (and is the new "skip if
  // the body is the Vercel anti-bot wall" filter): when the Met rate-limits
  // Vercel egress, Jina returns its 200 wrapper body containing the literal
  // text "Vercel Security Checkpoint" with no description — which the
  // previous code happily accepted, leaving a broken card. The CORS proxies
  // hit Met directly from consumer IPs and don't have that problem.
  let description: string | null = null;
  const pageUrl = obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`;

  // Reject any body that's an anti-bot wall instead of the real page.
  function isBlockedBody(body: string): boolean {
    return /vercel\s+security\s+checkpoint|attention required|just a moment\.\.\.|cloudflare|access denied|too many requests/i.test(body.slice(0, 3000));
  }

  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(pageUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(pageUrl)}`,
    `https://r.jina.ai/${pageUrl}`,
  ];
  for (const u of proxies) {
    if (description) break;
    try {
      const r = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!r.ok) continue;
      const body = await r.text();
      if (!body || isBlockedBody(body)) continue;
      if (u.startsWith("https://r.jina.ai/")) {
        const paras = body.split(/\n{2,}/).map((p) => p.trim());
        for (const p of paras) {
          if (p.length < 160 || p.length > 2000) continue;
          if (/^(skip to|share|public domain|the met|metropolitan museum|on view|object number|accession|vercel security)/i.test(p)) continue;
          if (/^[#*\-_=]+/.test(p)) continue;
          const cleaned = p.replace(/\[([^\]]+?)\]\([^)]+?\)/g, "$1").replace(/!\[[^\]]*?\]\([^)]+?\)/g, "").replace(/\s+/g, " ").trim();
          if (cleaned.length >= 100) {
            description = cleaned.length > 700 ? cleaned.slice(0, 697).trimEnd() + "…" : cleaned;
            break;
          }
        }
      } else {
        const decode = (s: string) =>
          s.replace(/<[^>]+>/g, " ")
           .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
           .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
           .replace(/&#x?\d+;/g, " ").replace(/\s+/g, " ").trim();
        const candidates: string[] = [];
        const re1 = /<div[^>]+class="[^"]*artwork__intro__desc(?:-text)?[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
        let m: RegExpExecArray | null;
        while ((m = re1.exec(body))) candidates.push(decode(m[1]));
        // og:description meta tag — short but usually present.
        const og = body.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        if (og) candidates.push(decode(og[1]));
        // any long paragraph inside <p> tags
        const reP = /<p[^>]*>([\s\S]{160,1500}?)<\/p>/gi;
        while ((m = reP.exec(body))) candidates.push(decode(m[1]));
        for (const c of candidates) {
          if (c.length >= 60 && !/^skip to|^share|^accept all|^vercel/i.test(c)) {
            description = c.length > 700 ? c.slice(0, 697).trimEnd() + "…" : c;
            break;
          }
        }
      }
    } catch { /* next */ }
  }

  // Wikipedia fallback (search-based, reachable from Vercel without proxies).
  // The plain summary endpoint needs an EXACT page title, which a Met
  // tombstone title almost never matches — so we SEARCH first and take the
  // best hit's extract. We try the painting itself, then the artist (so even
  // an obscure canvas by a known painter gets a real, substantive blurb).
  async function wikiSearchExtract(query: string, minLen: number): Promise<string | null> {
    const s = await getJson<{ query?: { search?: Array<{ title?: string }> } }>(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=3&format=json&origin=*&srsearch=${encodeURIComponent(query)}`,
    );
    const hits = s?.query?.search ?? [];
    for (const hit of hits) {
      if (!hit.title) continue;
      const sum = await getJson<{ extract?: string; type?: string }>(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`,
      );
      if (sum?.type === "disambiguation") continue;
      if (sum?.extract && sum.extract.length >= minLen) {
        return sum.extract.length > 700 ? sum.extract.slice(0, 697).trimEnd() + "…" : sum.extract;
      }
    }
    return null;
  }

  if (!description && obj.title) {
    // 1) the painting itself
    const byPainting = await wikiSearchExtract(
      `${obj.title}${obj.artistDisplayName ? ` ${obj.artistDisplayName}` : ""} painting`,
      80,
    );
    if (byPainting) {
      description = byPainting;
    } else if (obj.artistDisplayName) {
      // 2) the artist — prefix so it's clear this is context, not a caption
      const byArtist = await wikiSearchExtract(obj.artistDisplayName, 80);
      if (byArtist) description = `About the artist — ${byArtist}`;
    }
  }

  // Last resort: synthesize a short description from the tombstone so the
  // info pane always renders SOMETHING, never a blank "No description on file."
  if (!description) {
    const parts: string[] = [];
    if (obj.medium) parts.push(obj.medium);
    if (obj.culture) parts.push(obj.culture);
    if (obj.objectDate) parts.push(obj.objectDate);
    if (parts.length) {
      const tomb = `${obj.title || "Untitled"}${obj.artistDisplayName ? `, by ${obj.artistDisplayName}` : ""}. ${parts.join(", ")}.`;
      description = tomb;
    }
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
