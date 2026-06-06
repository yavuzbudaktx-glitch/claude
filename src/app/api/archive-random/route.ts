// Internet Archive — one curated vintage clip per day. The user loved getting
// an old cartoon, so we lock the source to the Archive's classic cartoon
// shelves (with classic_tv as a backup so it doesn't repeat). Deterministic
// per day; ?r=N salts the seed.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// Each entry rotates by day-of-week — vintage cartoons most of the time, a
// classic-TV night and a Prelinger short to add variety. The same date keeps
// you on the same source so a refresh doesn't change the pick.
const ROTATION = [
  "collection:vintage_cartoons",       // Sun
  "collection:vintage_cartoons",       // Mon
  "collection:classic_cartoons",       // Tue
  "collection:vintage_cartoons",       // Wed
  "collection:classic_tv",             // Thu
  "collection:vintage_cartoons",       // Fri
  "collection:prelinger",              // Sat
];

interface IADoc { identifier?: string; title?: string; mediatype?: string; year?: string; description?: string | string[] }
interface IAResp { response?: { docs?: IADoc[] } }

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

async function getJson(url: string): Promise<IAResp | null> {
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
      return JSON.parse(text) as IAResp;
    } catch { /* next */ }
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  // Pick today's source from the weekly rotation.
  const dow = new Date(dateKey + "T00:00:00").getDay();
  const collection = ROTATION[dow] ?? ROTATION[0];

  const fields = "identifier,title,mediatype,year,description";
  // Pull a wide window of items and choose deterministically — no random sort,
  // so the same date always lands on the same pick (until you hit "New").
  const apiUrl =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(collection)}` +
    `&fl[]=${fields.split(",").join("&fl[]=")}&rows=500&output=json` +
    `&sort[]=downloads+desc`; // popular = "reliably good"

  const j = await getJson(apiUrl);
  const docs = (j?.response?.docs ?? []).filter((d) => d.identifier);
  if (docs.length === 0) return NextResponse.json({ error: "no_item", collection }, { status: 502 });

  const idx = seedIdx(dateKey + "-" + refresh + "-archive", docs.length);
  const d = docs[idx];
  const desc = Array.isArray(d.description) ? d.description[0] : d.description;

  return NextResponse.json(
    {
      identifier: d.identifier,
      title: d.title || d.identifier,
      mediatype: d.mediatype || "",
      year: d.year || "",
      description: desc ? String(desc).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 320) : "",
      imageUrl: `https://archive.org/services/img/${d.identifier}`,
      pageUrl: `https://archive.org/details/${d.identifier}`,
      source: "Internet Archive",
      collection,
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
