// Daily hadith — sequential through Imam Nevevî's "Riyâzü's-Sâlihîn",
// served in Turkish from a curated local dataset committed to the repo.
// One hadith per day, in order, starting from START_KEY.
//
// To extend the dataset, append entries to
// public/data/riyazus-salihin-tr.json; the rotation picks up automatically.

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

interface RawEntry {
  n: number;
  chapter?: string;
  narrator?: string;
  text: string;
  source?: string;
}

const DATA_PATH = path.join(process.cwd(), "public", "data", "riyazus-salihin-tr.json");
// Day 0 → the first hadith of the book. Pick a fixed date so the rotation
// is deterministic and identical for every reader.
const START_KEY = "2026-05-30";

function loadDataset(): RawEntry[] {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const arr = JSON.parse(raw) as RawEntry[];
    return Array.isArray(arr) ? arr.filter((e) => e && typeof e.text === "string") : [];
  } catch {
    return [];
  }
}

function daysBetween(startKey: string, dateKey: string): number {
  const [y1, m1, d1] = startKey.split("-").map(Number);
  const [y2, m2, d2] = dateKey.split("-").map(Number);
  if (!y1 || !y2) return 0;
  const start = Date.UTC(y1, m1 - 1, d1);
  const day = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((day - start) / 86_400_000);
}

export function dailyHadith(dateKey: string): HadithPayload {
  const dataset = loadDataset();
  if (dataset.length === 0) {
    throw new Error("riyazus-salihin-tr dataset empty");
  }
  const diff = daysBetween(START_KEY, dateKey);
  // Wrap with modulo so we cycle when the dataset is exhausted.
  const idx = ((diff % dataset.length) + dataset.length) % dataset.length;
  const entry = dataset[idx];
  return {
    hadithNumber: entry.n,
    text: entry.text,
    narrator: entry.narrator ?? null,
    bookName: "Riyâzü's-Sâlihîn",
    sectionName: entry.chapter ?? null,
    source: entry.source ?? null,
  };
}
