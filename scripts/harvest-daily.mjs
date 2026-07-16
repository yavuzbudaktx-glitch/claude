// Daily content harvester. Runs on a GitHub Action (clean IP, no 10s function
// limit, can retry hard) at ~1 AM Dallas time, fetches the day's Art / Bird /
// Wiki / NASA once, and commits public/data/daily-content.json. The Next
// routes read that file first and only fall back to a live fetch if it's
// missing or stale — which deletes the whole "datacenter IP + 10s cap +
// cold-start cache" class of failures the app kept hitting.
//
// Node 20+: global fetch is available. No dependencies.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const TOOL_UA = "morning-dashboard-harvester/1.0 (personal dashboard)";
const OUT = "public/data/daily-content.json";

function localDateKey(tzOffsetHours = -5) {
  // Dallas is UTC-5 (CDT) in summer; the exact hour doesn't matter much since
  // this runs at ~1 AM local, but shift so the date is the local one.
  const d = new Date(Date.now() + tzOffsetHours * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function seedIdx(key, n) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

// Direct first (honest UA — Wikimedia/Met/NASA APIs answer that from any IP),
// then public proxies as a safety net if the runner IP is ever blocked.
function withProxies(url) {
  return [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
}

async function getJson(url, rounds = 2) {
  for (let round = 0; round < rounds; round++) {
    for (const u of withProxies(url)) {
      try {
        const r = await fetch(u, {
          headers: { "User-Agent": TOOL_UA, Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (r.ok) {
          const t = await r.text();
          if (t && (t[0] === "{" || t[0] === "[")) return JSON.parse(t);
        }
      } catch { /* next */ }
    }
    await new Promise((res) => setTimeout(res, 1000 * (round + 1)));
  }
  return null;
}

async function getText(url, rounds = 2) {
  for (let round = 0; round < rounds; round++) {
    for (const u of withProxies(url)) {
      try {
        const r = await fetch(u, {
          headers: { "User-Agent": TOOL_UA, Accept: "text/html,text/plain,*/*" },
          signal: AbortSignal.timeout(15000),
        });
        if (r.ok) { const t = await r.text(); if (t) return t; }
      } catch { /* next */ }
    }
    await new Promise((res) => setTimeout(res, 1000 * (round + 1)));
  }
  return null;
}

// ---- ART (Met + Wikipedia description) ------------------------------------
async function harvestArt(date) {
  const search = await getJson(
    "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&medium=Paintings&q=*",
  );
  const ids = search?.objectIDs ?? [];
  if (!ids.length) return null;
  let obj = null;
  for (let i = 0; i < 12 && !obj; i++) {
    const id = ids[seedIdx(`${date}:pick::${i}`, ids.length)];
    const cand = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    if (cand && (cand.primaryImage || cand.primaryImageSmall)) obj = cand;
  }
  if (!obj) return null;

  let description = null;
  const surname = (obj.artistDisplayName || "").split(/\s+/).slice(-1)[0] || "";
  async function wikiExtract(query, accept) {
    const s = await getJson(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=4&srnamespace=0&format=json&origin=*&srsearch=${encodeURIComponent(query)}`,
    );
    for (const hit of (s?.query?.search ?? []).slice(0, 3)) {
      if (!hit.title || /^(list of|category:|file:)/i.test(hit.title)) continue;
      const sum = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`);
      if (sum?.type === "disambiguation") continue;
      if (sum?.extract && accept(sum.title ?? hit.title, sum.extract)) {
        return sum.extract.length > 700 ? sum.extract.slice(0, 697).trimEnd() + "…" : sum.extract;
      }
    }
    return null;
  }
  if (obj.title) {
    description = await wikiExtract(`${obj.title} ${obj.artistDisplayName ?? ""}`, (t, e) => {
      if (e.length < 80) return false;
      const s = (t + " " + e).toLowerCase();
      return /(painting|portrait|canvas|oil|tempera|watercolor|fresco|panel)/.test(s) ||
             (surname.length > 2 && s.includes(surname.toLowerCase()));
    });
  }
  if (!description && obj.artistDisplayName) {
    const bio = await wikiExtract(obj.artistDisplayName, (t, e) =>
      e.length >= 80 && (t.toLowerCase().includes(surname.toLowerCase()) || /(painter|artist|sculptor|engraver|printmaker)/i.test(e.slice(0, 400))),
    );
    if (bio) description = `About the artist — ${bio}`;
  }
  if (!description) {
    const parts = [obj.medium, obj.culture, obj.objectDate].filter(Boolean);
    description = `${obj.title || "Untitled"}${obj.artistDisplayName ? `, by ${obj.artistDisplayName}` : ""}.${parts.length ? " " + parts.join(", ") + "." : ""}`;
  }
  return {
    id: obj.objectID,
    title: obj.title || "Untitled",
    artist: obj.artistDisplayName || obj.culture || "",
    date: obj.objectDate || "",
    medium: obj.medium || "",
    origin: obj.culture || "",
    description,
    alt: obj.title ?? "",
    imageUrl: obj.primaryImage || obj.primaryImageSmall || "",
    pageUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
    source: "The Met",
    highlight: !!obj.isHighlight,
  };
}

// ---- BIRD (Wikipedia summary + embedded audio) ----------------------------
async function harvestBird(date) {
  const pj = await getJson("https://en.wikipedia.org/w/api.php?action=parse&page=List_of_birds_by_common_name&prop=links&format=json&origin=*");
  const pool = (pj?.parse?.links ?? [])
    .filter((l) => l.ns === 0 && l.exists !== undefined && typeof l["*"] === "string")
    .map((l) => l["*"])
    .filter((t) => !/^list of|^bird|^ornitholog|^common name|^binomial/i.test(t));
  if (!pool.length) return null;

  for (let attempt = 0; attempt < 12; attempt++) {
    const title = pool[seedIdx(`${date}:bird:${attempt}`, pool.length)];
    const wiki = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
    if (!wiki?.extract) continue;
    const imageUrl = wiki.originalimage?.source ?? wiki.thumbnail?.source ?? "";
    if (!imageUrl) continue;

    // Embedded article audio (matched by extension).
    let audioRaw = "";
    const media = await getJson(`https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/ /g, "_"))}`);
    const a = (media?.items ?? []).find((i) => i.title && /\.(ogg|oga|ogv|opus|mp3|wav|flac|m4a)$/i.test(i.title));
    if (a?.title) {
      const fileTitle = a.title.startsWith("File:") ? a.title : `File:${a.title}`;
      const info = await getJson(`https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&origin=*&redirects=1&titles=${encodeURIComponent(fileTitle)}`);
      const pages = info?.query?.pages ?? {};
      for (const k of Object.keys(pages)) { const u = pages[k].imageinfo?.[0]?.url; if (u) { audioRaw = u; break; } }
    }

    return {
      name: title,
      scientific: "",
      blurb: wiki.extract ?? "",
      imageUrl,
      audioUrl: audioRaw ? `/api/bird-audio?u=${encodeURIComponent(audioRaw)}` : "",
      recordist: "",
      place: "",
      pageUrl: wiki.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      xcUrl: `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(title + " audio")}`,
      source: "Wikipedia · Wikimedia Commons",
    };
  }
  return null;
}

// ---- WIKI (today's featured article) --------------------------------------
async function harvestWiki(date) {
  const d = new Date(date + "T00:00:00Z");
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const feed = await getJson(`https://en.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`);
  const worthwhile = (a) =>
    a && a.type !== "disambiguation" && (a.extract?.length ?? 0) >= 300 &&
    (a.originalimage?.source || a.thumbnail?.source);
  const shape = (a, label) => ({
    title: a.titles?.normalized || a.title || "",
    description: a.description ?? "",
    extract: a.extract ?? "",
    imageUrl: a.originalimage?.source ?? a.thumbnail?.source ?? "",
    pageUrl: a.content_urls?.desktop?.page ?? "",
    source: label,
  });
  if (worthwhile(feed?.tfa)) return shape(feed.tfa, "Wikipedia · Today's Featured Article");
  for (const ev of feed?.onthisday ?? []) {
    for (const p of ev.pages ?? []) if (worthwhile(p)) return shape(p, "Wikipedia · On this day");
  }
  return null;
}

// ---- NASA (apod.nasa.gov page scrape) -------------------------------------
async function harvestNasa() {
  const key = process.env.NASA_API_KEY;
  if (key) {
    const j = await getJson(`https://api.nasa.gov/planetary/apod?api_key=${key}`);
    if (j?.title && j?.url) return { date: j.date, title: j.title, explanation: j.explanation, url: j.url, hdurl: j.hdurl, media_type: j.media_type, copyright: j.copyright };
  }
  const html = await getText("https://apod.nasa.gov/apod/astropix.html");
  if (!html) return null;
  const abs = (s) => (/^https?:\/\//i.test(s) ? s : "https://apod.nasa.gov/apod/" + s.replace(/^\.?\//, ""));
  const bs = [...html.matchAll(/<b>\s*([^<][\s\S]*?)<\/b>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  let title = "";
  for (const b of bs) { if (b && !/^(astronomy picture|image credit|video credit|explanation|credit|tomorrow|today)/i.test(b) && b.length >= 4) { title = b; break; } }
  let explanation = "";
  const em = html.match(/Explanation:\s*<\/b>\s*([\s\S]*?)(?:<p>\s*<center>|Tomorrow's picture|<hr)/i);
  if (em) explanation = em[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const iframe = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  const img = html.match(/<img[^>]+src=["']?(image\/[^"'\s>]+)["']?/i);
  const href = html.match(/<a[^>]+href=["']?(image\/[^"'\s>]+)["']?/i);
  if (iframe) return { title: title || "APOD", explanation, url: iframe[1].replace(/^http:/, "https:"), media_type: "video" };
  if (img) return { title: title || "APOD", explanation, url: abs(img[1]), hdurl: href ? abs(href[1]) : abs(img[1]), media_type: "image" };
  return null;
}

async function main() {
  const date = localDateKey();
  console.log("Harvesting daily content for", date);
  const [art, bird, wiki, nasa] = await Promise.all([
    harvestArt(date).catch((e) => (console.warn("art:", e?.message), null)),
    harvestBird(date).catch((e) => (console.warn("bird:", e?.message), null)),
    harvestWiki(date).catch((e) => (console.warn("wiki:", e?.message), null)),
    harvestNasa().catch((e) => (console.warn("nasa:", e?.message), null)),
  ]);

  // Never overwrite with an all-null harvest (e.g. a bad-network run) — that
  // would just push the routes onto their live fallback anyway, and could
  // clobber a good file from an earlier run this day.
  if (!art && !bird && !wiki && !nasa) {
    console.warn("All fetchers returned null — leaving existing file untouched.");
    process.exit(0);
  }
  const payload = { date, generatedAt: new Date().toISOString(), art, bird, wiki, nasa };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2));
  console.log("Wrote", OUT, {
    art: !!art, bird: !!bird, birdAudio: !!bird?.audioUrl, wiki: !!wiki, nasa: !!nasa,
  });
}

main();
