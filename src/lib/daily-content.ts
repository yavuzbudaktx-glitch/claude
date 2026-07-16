import fs from "node:fs/promises";
import path from "node:path";

// Reader for the harvested public/data/daily-content.json (written daily by
// the GitHub Action in scripts/harvest-daily.mjs). This is deliberately
// FAIL-SAFE: any problem — file missing, wrong date, null/invalid content,
// parse error — returns null so the caller falls straight through to its
// existing live-fetch path. The harvest can only ADD reliability; it can
// never break a route that works without it.

export type DailyKind = "art" | "bird" | "wiki" | "nasa";

interface DailyFile {
  date?: string;
  art?: unknown;
  bird?: unknown;
  wiki?: unknown;
  nasa?: unknown;
}

// Cheap in-instance cache — the file changes at most once a day.
let cache: { at: number; data: DailyFile | null } | null = null;
const TTL = 1000 * 60 * 5;

async function readFile(): Promise<DailyFile | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  let data: DailyFile | null = null;
  try {
    const p = path.join(process.cwd(), "public", "data", "daily-content.json");
    const raw = await fs.readFile(p, "utf8");
    const j = JSON.parse(raw) as DailyFile;
    if (j && typeof j === "object") data = j;
  } catch {
    data = null;
  }
  cache = { at: Date.now(), data };
  return data;
}

// Return the harvested content for `kind` ONLY when the file's date is in the
// `acceptDates` set (usually today, plus optionally yesterday for slack) and
// the content passes `valid`. Otherwise null → caller does its own fetch.
export async function readHarvested<T>(
  kind: DailyKind,
  acceptDates: string[],
  valid: (v: T) => boolean,
): Promise<T | null> {
  try {
    const j = await readFile();
    if (!j || !j.date || !acceptDates.includes(j.date)) return null;
    const v = j[kind] as T | undefined | null;
    if (!v || typeof v !== "object") return null;
    return valid(v) ? v : null;
  } catch {
    return null;
  }
}
