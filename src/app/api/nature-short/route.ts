// One daily nature SHORT — scraped from the /shorts tab of a few nature
// channels (BBC Earth, National Geographic, …). The Atom upload feed mixes in
// full landscape videos, so instead we hit each channel's dedicated /shorts
// page and pull the vertical Shorts straight out of its ytInitialData. Picked
// deterministically per day so the spot is stable through the day; ?r=N salts
// the seed for a manual refresh.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// @handles whose /shorts tab we scrape. A failing channel just contributes
// nothing — the pool is the union of whoever answered.
const CHANNELS: Array<{ handle: string; label: string }> = [
  { handle: "bbcearth",          label: "BBC Earth" },
  { handle: "NatGeo",            label: "National Geographic" },
  { handle: "BBCEarthUnplugged", label: "BBC Earth" },
  { handle: "PBSNature",         label: "Nature on PBS" },
  { handle: "DiscoveryUK",       label: "Discovery" },
];

interface Short { id: string; title: string; channel: string }

async function getHtml(url: string): Promise<string | null> {
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const res = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 1000) return text;
    } catch {
      // next proxy
    }
  }
  return null;
}

// Pull (videoId, title) pairs out of a /shorts page's ytInitialData. The
// modern layout uses `shortsLockupViewModel`; we grab the videoId then the
// next primaryText (the Short's title) before the following videoId so the
// pairing stays aligned. Falls back to the older reelItemRenderer headline.
function scrapeShorts(html: string, label: string): Short[] {
  const out: Short[] = [];
  const seen = new Set<string>();

  const push = (id: string, title: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    let t = "";
    try { t = JSON.parse(`"${title}"`); } catch { t = title; }
    out.push({ id, title: (t || "").trim(), channel: label });
  };

  // Modern: videoId → … → primaryText.content (no intervening videoId).
  const re = /"videoId":"([\w-]{11})"(?:(?!"videoId").)*?"primaryText":\{"content":"((?:[^"\\]|\\.)*?)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 60) push(m[1], m[2]);

  // Older reelItemRenderer: videoId paired with a headline simpleText.
  if (out.length === 0) {
    const re2 = /"reelItemRenderer":\{"videoId":"([\w-]{11})"(?:(?!"reelItemRenderer").)*?"headline":\{"simpleText":"((?:[^"\\]|\\.)*?)"/g;
    while ((m = re2.exec(html)) && out.length < 60) push(m[1], m[2]);
  }

  // Last resort — any bare videoIds on the page (titles unknown).
  if (out.length === 0) {
    const re3 = /"videoId":"([\w-]{11})"/g;
    while ((m = re3.exec(html)) && out.length < 60) push(m[1], "");
  }

  return out;
}

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

export async function GET(req: Request) {
  const dateKey = new URL(req.url).searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = new URL(req.url).searchParams.get("r") ?? "";

  const lists = await Promise.all(
    CHANNELS.map(async (ch) => {
      const html = await getHtml(`https://www.youtube.com/@${ch.handle}/shorts`);
      return html ? scrapeShorts(html, ch.label) : [];
    }),
  );

  // Round-robin interleave so the pool isn't dominated by whichever channel
  // returned the most.
  const seen = new Set<string>();
  const pool: Short[] = [];
  for (let i = 0; ; i++) {
    let advanced = false;
    for (const list of lists) {
      const v = list[i];
      if (v) { advanced = true; if (!seen.has(v.id)) { seen.add(v.id); pool.push(v); } }
    }
    if (!advanced) break;
  }

  if (pool.length === 0) {
    return NextResponse.json({ error: "no_videos" }, { status: 502 });
  }

  const idx = seedIdx(dateKey + "-" + refresh + "-shorts", pool.length);
  const pick = pool[idx];

  return NextResponse.json(
    {
      videoId: pick.id,
      title: pick.title || pick.channel,
      channel: pick.channel,
      thumb: `https://i.ytimg.com/vi/${pick.id}/hqdefault.jpg`,
      isPortrait: true,
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=21600" } },
  );
}
