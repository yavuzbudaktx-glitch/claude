// Parsing for the UFC rankings, shared by the server route and the browser
// fallback so both produce identical output from identical input.
//
// Plain module — no "use client", no node builtins — because
// /api/ufc-rankings and ufc-rankings-client.ts both import it.

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

// All MEN'S UFC divisions, lightest → heaviest (the canonical order).
// Women's divisions and pound-for-pound are intentionally excluded.
export const WANTED = [
  "Flyweight",
  "Bantamweight",
  "Featherweight",
  "Lightweight",
  "Welterweight",
  "Middleweight",
  "Light Heavyweight",
  "Heavyweight",
] as const;

export function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

export function slugToName(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Match a source's division label to one of our WANTED names, tolerating the
// "Men's " prefix that ufc.com sometimes adds and the "Pound-for-Pound" rows
// we don't want. Returns the canonical WANTED name or null.
//
// "Light Heavyweight" has to be tested before "Heavyweight" wherever this is
// used against free text, since one contains the other.
export function matchDivision(label: string): (typeof WANTED)[number] | null {
  const norm = label.trim().toLowerCase().replace(/^men'?s\s+/, "");
  if (/pound.?for.?pound|p4p/.test(norm)) return null;
  if (/\bwomen/.test(norm)) return null;
  return WANTED.find((w) => w.toLowerCase() === norm) ?? null;
}

export function dedupe(divisions: DivisionRanking[]): DivisionRanking[] {
  // Guard against any source returning duplicate division entries — pick the
  // first occurrence per division name. Without this the card was rendering
  // each weight class twice in the grid.
  const seen = new Map<string, DivisionRanking>();
  for (const d of divisions) if (!seen.has(d.division)) seen.set(d.division, d);
  return WANTED.map((w) => seen.get(w)).filter((d): d is DivisionRanking => !!d);
}

/* ------------------------------------------------ octagon-api JSON -------- */

interface RawFighter { id?: string; fighterName?: string; name?: string; rank?: string | number }
interface RawDivision { categoryName?: string; championId?: string; fighters?: RawFighter[] }

export function normalizeOctagon(json: unknown): DivisionRanking[] {
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

/* --------------------------------------------- ufc.com/rankings HTML ------ */

// Two independent strategies. The first reads UFC.com's current class names;
// the second reads nothing but weight-class words and /athlete/ links. The
// second exists because the first is one CSS rename away from silently
// returning zero divisions — which is exactly how this card went blank.

function parseByClassNames(html: string): DivisionRanking[] {
  const byDivision = new Map<string, DivisionRanking>();

  // Locate each weight-class grouping by its header, then slice the chunk
  // up to the next header. The page repeats each division name twice (in
  // the side nav AND in the actual ranking block), so we DEDUPE by division
  // — keeping the first block that yielded contenders.
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

    let champion: string | null = null;
    const champMatch =
      chunk.match(/champion[\s\S]{0,400}?href="\/athlete\/[^"]*"[^>]*>\s*([^<]+?)\s*</i) ?? null;
    if (champMatch) champion = decode(champMatch[1]);

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

// Structure-agnostic pass. Split the page on the weight-class words themselves,
// then read the /athlete/ links inside each slice. No class names involved, so
// a UFC.com redesign doesn't take the card down with it.
//
// Three things this has to get right, each of which broke a naive version:
//
//  - "Light Heavyweight" contains "Heavyweight". A bare word scan finds both at
//    overlapping offsets and the six-character gap between them becomes an
//    empty Light Heavyweight.
//  - Divisions we don't want (Strawweight, the women's classes, P4P) still have
//    to act as BOUNDARIES. Otherwise the women's block falls inside the chunk
//    of whatever men's heading preceded it and gets served as that division.
//  - Every division name appears in the page nav as well as in its real block,
//    so a division has several candidate chunks. The right one is simply the
//    one with the most fighters in it.

/** Non-WANTED division words that still have to terminate a chunk. */
const BOUNDARY_ONLY = ["Strawweight", "Pound-for-Pound", "Pound for Pound"];

interface Mark { division: (typeof WANTED)[number] | null; index: number }

function divisionMarks(html: string): Mark[] {
  const marks: Mark[] = [];
  const push = (division: (typeof WANTED)[number] | null, word: string) => {
    // The word must be TEXT — right after a '>' and before the next '<'. That
    // single anchor is what stops athlete URLs, CSS class names and data
    // attributes from registering as headings, which otherwise shreds the page
    // into hundreds of one-link chunks and finds nothing at all.
    // A "Women's" prefix is captured so the block still acts as a boundary
    // while being excluded from the output.
    const re = new RegExp(
      `>\\s*(?:men'?s\\s+)?(women'?s\\s+)?${word.replace(/[\s-]+/g, "[\\s-]+")}\\b[^<]{0,40}<`,
      "gi",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      // "Heavyweight" preceded by "Light " is not a Heavyweight heading.
      if (word === "Heavyweight" && /light[\s-]*$/i.test(m[0].slice(0, m[0].toLowerCase().indexOf("heavyweight")))) continue;
      marks.push({ division: m[1] ? null : division, index: m.index });
    }
  };
  for (const w of WANTED) push(w, w);
  for (const w of BOUNDARY_ONLY) push(null, w);
  marks.sort((a, b) => a.index - b.index);
  return marks;
}

function fightersIn(chunk: string): RankedFighter[] {
  const linkRe = /href="\/athlete\/([^"?#]+)"[^>]*>\s*([^<]{2,60}?)\s*</gi;
  const found: RankedFighter[] = [];
  const seen = new Set<string>();
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(chunk)) && found.length < 17) {
    const id = lm[1];
    const name = decode(lm[2]);
    // Link text is sometimes an image alt or a stray "View Profile".
    if (!name || !/[a-z]/i.test(name) || seen.has(id)) continue;
    if (/^(view|profile|rankings?|see full)/i.test(name)) continue;
    seen.add(id);
    found.push({ rank: found.length, name, id });
  }
  return found;
}

function parseByAthleteLinks(html: string): DivisionRanking[] {
  const marks = divisionMarks(html);
  const best = new Map<string, DivisionRanking>();

  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    if (!mark.division) continue; // boundary-only (women's / strawweight / P4P)
    const chunk = html.slice(mark.index, marks[i + 1]?.index ?? html.length);
    const found = fightersIn(chunk);
    if (found.length < 4) continue; // a nav entry, not a ranking block

    // A block usually leads with the champion. When the word doesn't appear
    // before the first fighter, assume there is no champion row and let
    // everyone count from rank 1 rather than silently dropping the #1
    // contender into the champion slot.
    const firstLink = chunk.search(/href="\/athlete\//i);
    const leadsWithChampion = /champion/i.test(chunk.slice(0, firstLink < 0 ? 0 : firstLink));
    const champion = leadsWithChampion ? found[0].name : null;
    const rest = leadsWithChampion ? found.slice(1) : found;

    const prev = best.get(mark.division);
    if (prev && prev.contenders.length >= rest.length) continue;
    best.set(mark.division, {
      division: mark.division,
      champion,
      contenders: rest.map((f, idx) => ({ ...f, rank: idx + 1 })),
    });
  }
  return WANTED.map((w) => best.get(w)).filter((d): d is DivisionRanking => !!d);
}

export function parseUfcRankingsHtml(html: string): DivisionRanking[] {
  // Run both and keep whichever covered more of the card. The precise parse
  // wins ties because its ranks come from the page rather than from position.
  const primary = parseByClassNames(html);
  if (primary.length >= WANTED.length) return primary;
  const fallback = parseByAthleteLinks(html);
  return fallback.length > primary.length ? fallback : primary;
}
