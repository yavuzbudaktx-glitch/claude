// Cabinet of curiosities — one genuinely interesting object a day from The
// Met's Open Access collection (no key). We curate evocative themes (ancient
// world, indigenous & tribal art, arms & armour, the truly old) rather than
// pulling random accessions, and we PREFER the museum's own "highlight"
// objects so what you get is something worth knowing about. ?r=N salts both
// the theme and the object.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// Curated, high-interest themes — the corners of the Met that actually feel
// like a cabinet of curiosities.
const THEMES = [
  "Paleolithic", "Neolithic", "Sumerian", "Babylonian", "ancient Egypt",
  "Egyptian mummy", "ancient Greek", "Roman", "Etruscan", "Byzantine",
  "Viking", "Celtic", "Aztec", "Maya", "Olmec", "Inca",
  "Native American", "African mask", "Oceania", "samurai armor",
  "illuminated manuscript", "astrolabe", "reliquary", "Mesopotamia",
  "Anatolia", "Scythian gold", "Nazca", "Benin bronze", "Tang dynasty",
  "Persian", "Phoenician", "Minoan",
];

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

interface MetSearch { total?: number; objectIDs?: number[] | null }
interface MetObject {
  objectID: number; title?: string; artistDisplayName?: string;
  objectDate?: string; culture?: string; period?: string; medium?: string;
  dimensions?: string; department?: string; creditLine?: string;
  primaryImage?: string; primaryImageSmall?: string; objectURL?: string;
  isHighlight?: boolean; isPublicDomain?: boolean;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  const theme = THEMES[seedIdx(dateKey + "-" + refresh + "-theme", THEMES.length)];
  // hasImages + the curated theme keeps results visual and on-topic.
  const search = await getJson<MetSearch>(
    `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(theme)}`,
  );
  const ids = (search?.objectIDs ?? []).slice(0, 400);
  if (ids.length === 0) return NextResponse.json({ error: "no_objects", theme }, { status: 502 });

  // Pull several deterministic candidates; keep the first HIGHLIGHT with an
  // image, else the first imaged object — so it's both interesting and shown.
  let firstImaged: MetObject | null = null;
  let highlight: MetObject | null = null;
  for (let i = 0; i < 12 && !highlight; i++) {
    const idx = seedIdx(dateKey + "-" + refresh + "-obj-" + i, ids.length);
    const obj = await getJson<MetObject>(
      `https://collectionapi.metmuseum.org/public/collection/v1/objects/${ids[idx]}`,
    );
    if (!obj || !(obj.primaryImage || obj.primaryImageSmall)) continue;
    if (!firstImaged) firstImaged = obj;
    if (obj.isHighlight) highlight = obj;
  }
  const obj = highlight ?? firstImaged;
  if (!obj) return NextResponse.json({ error: "no_image", theme }, { status: 502 });

  const facts = [obj.culture, obj.period, obj.objectDate].filter(Boolean).join(" · ");
  return NextResponse.json(
    {
      id: obj.objectID,
      title: obj.title || "Untitled",
      artist: obj.artistDisplayName || obj.culture || obj.department || "",
      date: obj.objectDate || obj.period || "",
      medium: obj.medium || "",
      dimensions: obj.dimensions || "",
      story: [facts, obj.creditLine].filter(Boolean).join(" — "),
      imageUrl: obj.primaryImage || obj.primaryImageSmall || "",
      pageUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
      source: "The Met · Open Access",
      theme,
      highlight: !!obj.isHighlight,
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
