// Daily hadith — sequential through Imam Nevevî's "Riyâzü's-Sâlihîn",
// served in Turkish. One hadith per day, in order, starting from START_KEY.
//
// Source priority:
//   1. public/riyazus-salihin/             — folder of JSON/txt/md files (optional)
//   2. public/data/riyazus-salihin-tr.json — 545 hadiths extracted from
//      public/riyazus-salihin.pdf by scripts/extract-riyazus.cjs.
//
// To refresh from a new PDF: replace public/riyazus-salihin.pdf and run
// `node scripts/extract-riyazus.cjs` to regenerate the JSON.

import fs from "node:fs";
import path from "node:path";

export interface HadithPayload {
  hadithNumber: number;
  text: string;
  narrator: string | null;
  bookName: string;
  sectionName: string | null;
  source: string | null;
}

interface Entry {
  n: number | null;
  chapter: string | null;
  narrator: string | null;
  text: string;
  source: string | null;
}

const BOOK_DIR = path.join(process.cwd(), "public", "riyazus-salihin");
const FALLBACK = path.join(process.cwd(), "public", "data", "riyazus-salihin-tr.json");
// Day 0 → the first hadith of the book. Fixed so the rotation is identical
// for every reader and advances exactly one per calendar day.
const START_KEY = "2026-05-30";

// Natural sort: "10.txt" sorts after "2.txt".
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function firstString(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function normalizeObject(o: Record<string, unknown>): Entry | null {
  const text = firstString(o, ["text", "hadis", "metin", "content", "body", "tr", "turkish", "tercume", "meal"]);
  if (!text) return null;
  const nRaw = firstString(o, ["n", "no", "number", "num", "id", "hadisno", "sira"]);
  const n = nRaw && /^\d+$/.test(nRaw) ? Number(nRaw) : null;
  return {
    n,
    chapter: firstString(o, ["chapter", "bab", "konu", "section", "baslik", "title"]),
    narrator: firstString(o, ["narrator", "ravi", "rivayet"]),
    text,
    source: firstString(o, ["source", "kaynak", "reference", "ref"]),
  };
}

function entriesFromJson(raw: string): Entry[] {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  // Unwrap a common { hadiths: [...] } / { data: [...] } container.
  if (data && !Array.isArray(data) && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const k of ["hadiths", "data", "items", "list"]) {
      if (Array.isArray(obj[k])) { data = obj[k]; break; }
    }
  }
  const arr = Array.isArray(data) ? data : [data];
  const out: Entry[] = [];
  for (const item of arr) {
    if (typeof item === "string") {
      if (item.trim()) out.push({ n: null, chapter: null, narrator: null, text: item.trim(), source: null });
    } else if (item && typeof item === "object") {
      const e = normalizeObject(item as Record<string, unknown>);
      if (e) out.push(e);
    }
  }
  return out;
}

function entriesFromText(raw: string, fileBase: string): Entry[] {
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];
  // A single file may hold the whole book with numbered hadiths ("1.", "1)",
  // "1-") — split on those markers. Otherwise treat the file as one hadith,
  // ordered by its (numeric) filename.
  const numbered = [...trimmed.matchAll(/(?:^|\n)\s*(\d{1,4})\s*[.)\-]\s+/g)];
  if (numbered.length >= 3) {
    const out: Entry[] = [];
    for (let i = 0; i < numbered.length; i++) {
      const start = numbered[i].index ?? 0;
      const end = i + 1 < numbered.length ? numbered[i + 1].index ?? trimmed.length : trimmed.length;
      const n = Number(numbered[i][1]);
      const body = trimmed.slice(start, end).replace(/^\s*\d{1,4}\s*[.)\-]\s+/, "").trim();
      if (body) out.push({ n, chapter: null, narrator: null, text: body, source: null });
    }
    return out;
  }
  const m = /(\d{1,4})/.exec(fileBase);
  return [{ n: m ? Number(m[1]) : null, chapter: null, narrator: null, text: trimmed, source: null }];
}

function loadFromDir(): Entry[] {
  let names: string[];
  try {
    names = fs.readdirSync(BOOK_DIR);
  } catch {
    return [];
  }
  const files = names
    .filter((f) => /\.(json|txt|md)$/i.test(f))
    .sort(naturalCompare);
  const all: Entry[] = [];
  for (const name of files) {
    let raw: string;
    try { raw = fs.readFileSync(path.join(BOOK_DIR, name), "utf-8"); } catch { continue; }
    const ext = path.extname(name).toLowerCase();
    const entries = ext === ".json" ? entriesFromJson(raw) : entriesFromText(raw, name);
    all.push(...entries);
  }
  // If every entry carries a hadith number, order by it; else keep file order.
  if (all.length && all.every((e) => e.n != null)) {
    all.sort((a, b) => (a.n as number) - (b.n as number));
  }
  return all;
}

function loadFallback(): Entry[] {
  try {
    return entriesFromJson(fs.readFileSync(FALLBACK, "utf-8"));
  } catch {
    return [];
  }
}

let cache: Entry[] | null = null;
function dataset(): Entry[] {
  if (cache) return cache;
  const fromDir = loadFromDir();
  cache = fromDir.length > 0 ? fromDir : loadFallback();
  return cache;
}

function daysBetween(startKey: string, dateKey: string): number {
  const [y1, m1, d1] = startKey.split("-").map(Number);
  const [y2, m2, d2] = dateKey.split("-").map(Number);
  if (!y1 || !y2) return 0;
  return Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function dailyHadith(dateKey: string): HadithPayload {
  const all = dataset();
  if (all.length === 0) throw new Error("riyazus-salihin dataset empty");
  const diff = daysBetween(START_KEY, dateKey);
  const idx = ((diff % all.length) + all.length) % all.length;
  const e = all[idx];
  return {
    hadithNumber: e.n ?? idx + 1,
    text: e.text,
    narrator: e.narrator,
    bookName: "Riyâzü's-Sâlihîn",
    sectionName: e.chapter,
    source: e.source,
  };
}
