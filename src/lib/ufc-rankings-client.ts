// Client-side UFC rankings fetcher.
//
// The earlier server-side approach failed — datacenter IPs (Vercel) get
// blocked by both octagon-api and ufc.com. So we fetch from the browser
// through the same public CORS-proxy chain that already works for the
// fighter-photo scraper in this app. We try octagon-api's clean JSON
// first, then fall back to scraping ufc.com/rankings directly.

export interface RankedFighter {
  rank: number;
  name: string;
  id: string;
}
export interface DivisionRanking {
  division: string;
  champion: string | null;
  contenders: RankedFighter[];
}

// All UFC divisions, in the canonical order the UFC lists them (men's
// heaviest → lightest, then women's). Pound-for-pound is excluded — it's
// not a real weight class. octagon-api / ufc.com use these exact names.
const WANTED = [
  "Flyweight",
  "Bantamweight",
  "Featherweight",
  "Lightweight",
  "Welterweight",
  "Middleweight",
  "Light Heavyweight",
  "Heavyweight",
  "Women's Strawweight",
  "Women's Flyweight",
  "Women's Bantamweight",
] as const;

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function slugToName(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function fetchTextViaProxies(target: string): Promise<string | null> {
  const candidates = [
    target, // direct first — works when the source sends CORS headers
    `https://corsproxy.io/?${encodeURIComponent(target)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    `https://thingproxy.freeboard.io/fetch/${target}`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 50) return text;
    } catch {
      // try next proxy
    }
  }
  return null;
}

// ---- Source 1: octagon-api JSON --------------------------------------------

interface RawFighter { id?: string; fighterName?: string; name?: string; rank?: string | number }
interface RawDivision { categoryName?: string; championId?: string; fighters?: RawFighter[] }

// Match a source's division label to one of our WANTED names, tolerating the
// "Men's " prefix that ufc.com sometimes adds and the "Pound-for-Pound" rows
// we don't want. Returns the canonical WANTED name or null.
function matchDivision(label: string): (typeof WANTED)[number] | null {
  const norm = label.trim().toLowerCase().replace(/^men'?s\s+/, "");
  if (/pound.?for.?pound|p4p/.test(norm)) return null;
  return WANTED.find((w) => w.toLowerCase() === norm) ?? null;
}

function normalizeOctagon(json: unknown): DivisionRanking[] {
  const rawDivisions: RawDivision[] = Array.isArray(json)
    ? (json as RawDivision[])
    : Object.values((json ?? {}) as Record<string, RawDivision>);

  const byWanted = new Map<string, DivisionRanking>();
  for (const raw of rawDivisions) {
    const category = (raw.categoryName ?? "").trim();
    const wanted = matchDivision(category);
    if (!wanted) continue;

    let championId = raw.championId?.trim() || null;
    let championName: string | null = null;
    const contenders: RankedFighter[] = [];

    for (const f of raw.fighters ?? []) {
      const id = (f.id ?? "").trim();
      const name = (f.fighterName ?? f.name ?? "").trim() || (id ? slugToName(id) : "");
      const isChampLabel = typeof f.rank === "string" && /^(c|champion)$/i.test(f.rank.trim());
      if (isChampLabel) {
        championId = championId ?? id;
        championName = name;
        continue;
      }
      const rankNum = Number(f.rank);
      if (Number.isFinite(rankNum) && name) contenders.push({ rank: rankNum, name, id: id || name });
    }
    if (!championName && championId) championName = slugToName(championId);
    contenders.sort((a, b) => a.rank - b.rank);
    if (contenders.length) byWanted.set(wanted, { division: wanted, champion: championName, contenders });
  }
  return WANTED.map((w) => byWanted.get(w)).filter((d): d is DivisionRanking => !!d);
}

async function fromOctagon(): Promise<DivisionRanking[]> {
  const text = await fetchTextViaProxies("https://api.octagon-api.com/rankings");
  if (!text) return [];
  try {
    return normalizeOctagon(JSON.parse(text));
  } catch {
    return [];
  }
}

// ---- Source 2: ufc.com/rankings HTML scrape --------------------------------

function parseUfcRankingsHtml(html: string): DivisionRanking[] {
  const byDivision = new Map<string, DivisionRanking>();

  // Locate each weight-class grouping by its header, then slice the chunk
  // up to the next header. The page repeats each division name twice (in
  // the side nav AND in the actual ranking block), so we DEDUPE by division
  // — keeping the first block that yielded contenders. Without this dedupe
  // every division was rendering twice in the card.
  const headerRe = /view-grouping-header"[^>]*>\s*([^<]+?)\s*</gi;
  const headers: { name: string; index: number }[] = [];
  let hm: RegExpExecArray | null;
  while ((hm = headerRe.exec(html))) {
    headers.push({ name: decode(hm[1]), index: hm.index });
  }

  for (let i = 0; i < headers.length; i++) {
    const wanted = matchDivision(headers[i].name);
    if (!wanted) continue;
    if (byDivision.has(wanted)) continue; // already filled from an earlier header
    const chunk = html.slice(headers[i].index, headers[i + 1]?.index ?? html.length);

    // Champion: name link inside the champion block.
    let champion: string | null = null;
    const champMatch =
      chunk.match(/champion[\s\S]{0,400}?href="\/athlete\/[^"]*"[^>]*>\s*([^<]+?)\s*</i) ?? null;
    if (champMatch) champion = decode(champMatch[1]);

    // Contenders: a rank number followed by the athlete-link name.
    const contenders: RankedFighter[] = [];
    const seen = new Set<string>();
    const rowRe =
      /weight-class-rank"[^>]*>\s*(?:<span[^>]*>)?\s*(\d{1,2})\s*(?:<\/span>)?[\s\S]*?href="\/athlete\/([^"]+)"[^>]*>\s*([^<]+?)\s*</gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(chunk))) {
      const rank = Number(rm[1]);
      const id = rm[2];
      const name = decode(rm[3]);
      if (!Number.isFinite(rank) || !name || seen.has(id)) continue;
      seen.add(id);
      contenders.push({ rank, name, id });
    }
    contenders.sort((a, b) => a.rank - b.rank);
    if (contenders.length) byDivision.set(wanted, { division: wanted, champion, contenders });
  }
  return WANTED.map((w) => byDivision.get(w)).filter((d): d is DivisionRanking => !!d);
}

async function fromUfcCom(): Promise<DivisionRanking[]> {
  const html = await fetchTextViaProxies("https://www.ufc.com/rankings");
  if (!html) return [];
  try {
    return parseUfcRankingsHtml(html);
  } catch {
    return [];
  }
}

function dedupe(divisions: DivisionRanking[]): DivisionRanking[] {
  // Guard against any source returning duplicate division entries — pick the
  // first occurrence per division name. Without this the card was rendering
  // each weight class twice in the grid.
  const seen = new Map<string, DivisionRanking>();
  for (const d of divisions) if (!seen.has(d.division)) seen.set(d.division, d);
  return WANTED.map((w) => seen.get(w)).filter((d): d is DivisionRanking => !!d);
}

export async function fetchUfcRankings(): Promise<DivisionRanking[]> {
  const fromApi = await fromOctagon();
  if (fromApi.length) return dedupe(fromApi);
  return dedupe(await fromUfcCom());
}
