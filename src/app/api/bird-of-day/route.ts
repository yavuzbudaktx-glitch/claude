// Bird of the day — a species per day, with its actual recorded song.
// xeno-canto (no key) provides the recording + species name; Wikipedia's REST
// summary provides a photo + a one-line description. Deterministic per day;
// ?r=N salts the seed.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// A rotation of striking, song-rich species (common English names).
const BIRDS = [
  "Common Nightingale", "Northern Cardinal", "Common Loon", "Wood Thrush",
  "European Robin", "Song Thrush", "Northern Mockingbird", "Western Meadowlark",
  "Eurasian Blackbird", "American Robin", "Winter Wren", "Veery",
  "Hermit Thrush", "Common Blackbird", "Skylark", "Eurasian Wren",
  "Baltimore Oriole", "Wood Lark", "Mistle Thrush", "Blackcap",
  "Common Chaffinch", "Great Tit", "Eurasian Bullfinch", "Common Cuckoo",
  "Whip-poor-will", "Barred Owl", "Common Raven", "House Wren",
  "Carolina Wren", "Marsh Warbler", "Sedge Warbler", "Willow Warbler",
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

interface XcRec {
  id?: string; en?: string; gen?: string; sp?: string;
  rec?: string; cnt?: string; loc?: string; type?: string;
  file?: string; ["file-name"]?: string; q?: string;
  sono?: { small?: string; med?: string };
}
interface XcResp { recordings?: XcRec[] }
interface WikiSummary {
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  const name = BIRDS[seedIdx(dateKey + "-" + refresh + "-bird", BIRDS.length)];

  // xeno-canto: prefer A-quality song recordings of the species.
  const xc = await getJson<XcResp>(
    `https://xeno-canto.org/api/2/recordings?query=${encodeURIComponent(name + ' type:song q:A')}`,
  );
  let recs = xc?.recordings ?? [];
  if (recs.length === 0) {
    const xc2 = await getJson<XcResp>(`https://xeno-canto.org/api/2/recordings?query=${encodeURIComponent(name)}`);
    recs = xc2?.recordings ?? [];
  }
  if (recs.length === 0) return NextResponse.json({ error: "no_recording" }, { status: 502 });

  const pick = recs[seedIdx(dateKey + "-" + refresh + "-rec", Math.min(recs.length, 60))];
  const audio = pick.file
    ? (pick.file.startsWith("http") ? pick.file : `https:${pick.file}`)
    : "";
  if (!audio) return NextResponse.json({ error: "no_audio" }, { status: 502 });

  // Wikipedia for the photo + blurb.
  const wiki = await getJson<WikiSummary>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`,
  );

  const sci = [pick.gen, pick.sp].filter(Boolean).join(" ");
  return NextResponse.json(
    {
      name: pick.en || name,
      scientific: sci,
      blurb: wiki?.extract ?? "",
      imageUrl: wiki?.thumbnail?.source ?? wiki?.originalimage?.source ?? "",
      audioUrl: audio,
      sonogram: pick.sono?.med || pick.sono?.small || "",
      recordist: pick.rec || "",
      place: [pick.loc, pick.cnt].filter(Boolean).join(", "),
      pageUrl: wiki?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`,
      xcUrl: pick.id ? `https://xeno-canto.org/${pick.id}` : "https://xeno-canto.org/",
      source: "xeno-canto",
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
