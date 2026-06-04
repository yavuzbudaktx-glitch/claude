// One daily nature SHORT. We try the /shorts pages of a few nature channels
// first; when that doesn't work (Vercel's egress is on YouTube's anti-bot
// list and the public CORS proxies routinely fail), we fall back to a
// hand-curated pool of known nature-channel Shorts so the slot is never
// empty. Picked deterministically per day; ?r=N salts the seed for refresh.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const CHANNELS: Array<{ handle: string; label: string }> = [
  { handle: "bbcearth",          label: "BBC Earth" },
  { handle: "NatGeo",            label: "National Geographic" },
  { handle: "PBSNature",         label: "Nature on PBS" },
];

// Curated fallback pool — verified vertical Shorts from major nature
// channels. These are the safety net when the scrape comes up empty.
const FALLBACK: Array<{ id: string; channel: string }> = [
  { id: "ZmAcYHa6_HE", channel: "BBC Earth" },
  { id: "p0iSPa5IcAk", channel: "BBC Earth" },
  { id: "lq2nU1pK7sQ", channel: "BBC Earth" },
  { id: "uYJUf4PJzZk", channel: "National Geographic" },
  { id: "QbVqDdLFs0Y", channel: "National Geographic" },
  { id: "x4USTRBVF_o", channel: "National Geographic" },
  { id: "1Cw4ZdH8KEM", channel: "Nature on PBS" },
  { id: "OBoYqU2KhDU", channel: "BBC Earth" },
  { id: "5W5kEqzljFE", channel: "National Geographic" },
  { id: "g3vSYbT1Aco", channel: "BBC Earth" },
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
      const res = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 1000) return text;
    } catch { /* next */ }
  }
  return null;
}

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

  const re = /"videoId":"([\w-]{11})"(?:(?!"videoId").)*?"primaryText":\{"content":"((?:[^"\\]|\\.)*?)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 60) push(m[1], m[2]);

  if (out.length === 0) {
    const re2 = /"reelItemRenderer":\{"videoId":"([\w-]{11})"(?:(?!"reelItemRenderer").)*?"headline":\{"simpleText":"((?:[^"\\]|\\.)*?)"/g;
    while ((m = re2.exec(html)) && out.length < 60) push(m[1], m[2]);
  }
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

  const seen = new Set<string>();
  let pool: Short[] = [];
  for (let i = 0; ; i++) {
    let advanced = false;
    for (const list of lists) {
      const v = list[i];
      if (v) { advanced = true; if (!seen.has(v.id)) { seen.add(v.id); pool.push(v); } }
    }
    if (!advanced) break;
  }

  if (pool.length === 0) {
    pool = FALLBACK.map((f) => ({ id: f.id, title: "", channel: f.channel }));
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
