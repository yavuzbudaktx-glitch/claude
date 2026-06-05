// Bird of the day — a striking species per day, with its photo + blurb
// (Wikipedia, very reliable) and its actual recorded song (xeno-canto, best
// effort). Wikipedia is fetched first so the tab ALWAYS shows a bird even if
// the recording archive is unreachable; the song is added when available.
// Deterministic per day; ?r=N salts the seed.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// Song-rich, recognisable species (English name + Wikipedia title when they
// differ). All have plentiful xeno-canto recordings.
const BIRDS: Array<{ name: string; wiki?: string }> = [
  { name: "Common Nightingale" }, { name: "Northern Cardinal" }, { name: "Common Loon" },
  { name: "Wood Thrush" }, { name: "European Robin" }, { name: "Song Thrush" },
  { name: "Northern Mockingbird" }, { name: "Western Meadowlark" }, { name: "Common Blackbird" },
  { name: "American Robin" }, { name: "Eurasian Wren", wiki: "Eurasian wren" }, { name: "Veery" },
  { name: "Hermit Thrush" }, { name: "Eurasian Skylark", wiki: "Eurasian skylark" }, { name: "Baltimore Oriole" },
  { name: "Woodlark" }, { name: "Mistle Thrush" }, { name: "Eurasian Blackcap", wiki: "Eurasian blackcap" },
  { name: "Common Chaffinch" }, { name: "Great Tit" }, { name: "Eurasian Bullfinch" },
  { name: "Common Cuckoo" }, { name: "Barred Owl" }, { name: "Common Raven" },
  { name: "House Wren" }, { name: "Carolina Wren" }, { name: "Marsh Warbler" },
  { name: "Sedge Warbler" }, { name: "Willow Warbler" }, { name: "Eurasian Golden Oriole", wiki: "Eurasian golden oriole" },
  { name: "Common Loon" }, { name: "Bewick's Wren" },
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
      const r = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || (text[0] !== "{" && text[0] !== "[")) continue;
      return JSON.parse(text) as T;
    } catch { /* next */ }
  }
  return null;
}

interface WikiSummary {
  title?: string; extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}
interface XcRec { id?: string; en?: string; gen?: string; sp?: string; rec?: string; cnt?: string; loc?: string; file?: string; q?: string; sono?: { small?: string; med?: string } }
interface XcResp { numRecordings?: string; recordings?: XcRec[] }

function audioFromRec(rec: XcRec): string {
  const f = rec.file ?? "";
  if (!f) return "";
  if (f.startsWith("http")) return f;
  if (f.startsWith("//")) return "https:" + f;
  return f;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  const bird = BIRDS[seedIdx(dateKey + "-" + refresh + "-bird", BIRDS.length)];
  const wikiTitle = (bird.wiki ?? bird.name).replace(/ /g, "_");

  // 1) Wikipedia — reliable photo + blurb.
  const wiki = await getJson<WikiSummary>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`,
  );

  // 2) xeno-canto — best-effort song. Try a quality-A query, then a looser one.
  let recs: XcRec[] = [];
  for (const q of [`${bird.name} q:A`, `${bird.name}`]) {
    const xc = await getJson<XcResp>(`https://xeno-canto.org/api/2/recordings?query=${q.replace(/ /g, "+")}`);
    recs = (xc?.recordings ?? []).filter((r) => audioFromRec(r));
    if (recs.length) break;
  }

  const pick = recs.length ? recs[seedIdx(dateKey + "-" + refresh + "-rec", Math.min(recs.length, 60))] : null;
  const audioUrl = pick ? audioFromRec(pick) : "";
  const sci = pick ? [pick.gen, pick.sp].filter(Boolean).join(" ") : "";

  // If we have neither a photo nor a recording, the tab genuinely can't show
  // anything useful — only then do we report an error.
  if (!wiki?.extract && !audioUrl) {
    return NextResponse.json({ error: "bird_unavailable", name: bird.name }, { status: 502 });
  }

  return NextResponse.json(
    {
      name: pick?.en || bird.name,
      scientific: sci,
      blurb: wiki?.extract ?? "",
      imageUrl: wiki?.thumbnail?.source ?? wiki?.originalimage?.source ?? "",
      audioUrl,
      recordist: pick?.rec ?? "",
      place: pick ? [pick.loc, pick.cnt].filter(Boolean).join(", ") : "",
      pageUrl: wiki?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`,
      xcUrl: pick?.id ? `https://xeno-canto.org/${pick.id}` : `https://xeno-canto.org/explore?query=${encodeURIComponent(bird.name)}`,
      source: "xeno-canto + Wikipedia",
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
