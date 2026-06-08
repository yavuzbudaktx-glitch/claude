// Bird of the day — pulls a random recording from xeno-canto's library of
// 800,000+ field recordings across thousands of species, then enriches it
// with the species' Wikipedia photo + blurb. No hand-picked list: every day
// you get something different from the full archive.
//
// Audio plays directly via <audio src={…}> with NO `crossOrigin` attribute
// — that's the trick to making the recording work, because browsers don't
// enforce CORS for media playback when there's no crossOrigin opt-in. The
// previous "CORS-resolved via the Wikipedia file index" pipeline failed for
// most species; this one just gives the browser the URL and plays it.
//
// Deterministic per day; ?r=N salts the seed so "another" reliably rolls a
// fresh bird without hitting the same recording.

import { NextResponse } from "next/server";

export const revalidate = 3600;
export const maxDuration = 30;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

interface XcRec {
  id?: string;
  gen?: string; sp?: string;     // genus + species (latin)
  en?: string;                    // English name
  cnt?: string; loc?: string;     // country, location
  rec?: string;                   // recordist
  q?: string;                     // quality: A, B, C, D, no score
  type?: string;                  // "song" / "call" etc
  file?: string;                  // direct .mp3 URL
  ["file-name"]?: string;
}
interface XcResp { numRecordings?: string; numSpecies?: string; recordings?: XcRec[]; numPages?: number }

interface WikiSummary {
  title?: string; extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
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
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
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

function audioOf(rec: XcRec): string {
  const f = rec.file ?? "";
  if (!f) return "";
  if (f.startsWith("http")) return f;
  if (f.startsWith("//")) return "https:" + f;
  return `https://xeno-canto.org${f.startsWith("/") ? f : "/" + f}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = url.searchParams.get("r") ?? "";

  // Probe the catalogue to learn how many pages of quality-A song recordings
  // exist (xeno-canto pages 500 results at a time). The total grows over
  // time — using `numPages` straight from the API keeps "full library"
  // honest as new recordings land.
  const probeUrl = "https://xeno-canto.org/api/2/recordings?query=" + encodeURIComponent("q:A type:song");
  const probe = await getJson<XcResp>(probeUrl);
  const numPages = Math.max(1, probe?.numPages ?? 1);

  // Pick a random page deterministically per day.
  const page = (seedIdx(dateKey + ":pg:" + refresh, numPages)) + 1;
  const pageUrl = `${probeUrl}&page=${page}`;
  const data = page === 1 ? probe : await getJson<XcResp>(pageUrl);

  let candidates = (data?.recordings ?? []).filter((r) => audioOf(r) && r.en);
  // Some species in xeno-canto come back with a blank English name when the
  // entry hasn't been translated yet — skip those so the panel always has
  // a title.

  // If the chosen page came back empty (rare), fall back to page 1 which is
  // dense and reliable.
  if (candidates.length === 0 && page !== 1) {
    const p1 = await getJson<XcResp>(probeUrl);
    candidates = (p1?.recordings ?? []).filter((r) => audioOf(r) && r.en);
  }
  if (candidates.length === 0) {
    return NextResponse.json({ error: "no_recording" }, { status: 502 });
  }

  const pick = candidates[seedIdx(dateKey + ":rec:" + refresh, candidates.length)];
  const audioUrl = audioOf(pick);
  const name = pick.en || `${pick.gen ?? ""} ${pick.sp ?? ""}`.trim() || "Unknown species";
  const scientific = [pick.gen, pick.sp].filter(Boolean).join(" ");

  // Wikipedia photo + blurb for the species. Try English common name first;
  // fall back to the scientific name if the article isn't found.
  async function summary(title: string): Promise<WikiSummary | null> {
    return getJson<WikiSummary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  }
  let wiki = await summary(name);
  if (!wiki?.extract && scientific) wiki = await summary(scientific);

  // Prefer the FULL image; fall back to PageImages at 1200px width.
  let imageUrl = wiki?.originalimage?.source ?? wiki?.thumbnail?.source ?? "";
  if (!imageUrl) {
    const t = (wiki?.title ?? name).replace(/ /g, "_");
    const pi = await getJson<{ query?: { pages?: Record<string, { original?: { source?: string }; thumbnail?: { source?: string } }> } }>(
      `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original%7Cthumbnail&pithumbsize=1200&format=json&origin=*&titles=${encodeURIComponent(t)}`,
    );
    const pages = pi?.query?.pages ?? {};
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      const u = p.original?.source ?? p.thumbnail?.source;
      if (u) { imageUrl = u; break; }
    }
  }

  return NextResponse.json(
    {
      name,
      scientific,
      blurb: wiki?.extract ?? "",
      imageUrl,
      audioUrl,
      recordist: pick.rec ?? "",
      place: [pick.loc, pick.cnt].filter(Boolean).join(", "),
      pageUrl: wiki?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`,
      xcUrl: pick.id ? `https://xeno-canto.org/${pick.id}` : "https://xeno-canto.org/",
      source: "xeno-canto · Wikipedia",
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
  );
}
