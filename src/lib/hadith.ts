// Daily Sahih al-Bukhari hadith.
//
// Source: fawazahmed0/hadith-api on JSDelivr — a free, open-source mirror of
// the canonical 9-Books collection. Two parallel editions:
//   - https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/eng-bukhari.min.json
//   - https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-bukhari.min.json
//
// Each file is ~3-5MB; we fetch with revalidate: 86400 (24h) so JSDelivr
// edge + Next.js data cache do almost all the work. Pick today's hadith by
// (day-of-year mod hadith-count) so the same one shows all day for everyone.

export interface HadithPayload {
  hadithNumber: number;
  arabic: string;
  english: string;
  narrator: string | null;
  bookName: string;
  sectionName: string | null;
}

interface RawHadith {
  hadithnumber?: number;
  arabicnumber?: number;
  text?: string;
  grades?: unknown;
  reference?: { book?: number; hadith?: number };
}

interface RawEdition {
  metadata?: {
    name?: string;
    sections?: Record<string, string>;
    section_details?: Record<string, { hadithnumber_first?: number; hadithnumber_last?: number }>;
  };
  hadiths?: RawHadith[];
}

const ENG_URL = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/eng-bukhari.min.json";
const ARA_URL = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-bukhari.min.json";

export function dailyHadithSeed(date = new Date()): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((today - start) / 86400000);
}

async function fetchEdition(url: string): Promise<RawEdition | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // 24h cache — content doesn't change, and the file is large enough that
      // we never want to fetch it on every request.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as RawEdition;
  } catch {
    return null;
  }
}

function splitNarrator(text: string): { narrator: string | null; body: string } {
  // Most Bukhari English hadiths begin "Narrated <Name>: <body>". Split that
  // so we can render the narrator label small and the body as the main quote.
  const m = /^Narrated\s+([^:]+?):\s*([\s\S]+)$/.exec(text);
  if (m) return { narrator: m[1].trim(), body: m[2].trim() };
  return { narrator: null, body: text.trim() };
}

export async function fetchDailyHadith(date = new Date()): Promise<HadithPayload> {
  const [eng, ara] = await Promise.all([fetchEdition(ENG_URL), fetchEdition(ARA_URL)]);
  if (!eng?.hadiths?.length) throw new Error("Bukhari English edition unavailable");

  const seed = dailyHadithSeed(date);
  const idx = seed % eng.hadiths.length;
  const engEntry = eng.hadiths[idx];

  // Match Arabic by hadithnumber — collections sometimes have slightly
  // different indices between language editions even though numbers align.
  let arabicText = "";
  if (ara?.hadiths?.length) {
    const hadithNum = engEntry.hadithnumber;
    const araEntry =
      ara.hadiths.find((h) => h.hadithnumber === hadithNum) ??
      ara.hadiths[idx % ara.hadiths.length];
    arabicText = araEntry?.text ?? "";
  }

  const { narrator, body } = splitNarrator(engEntry.text ?? "");
  const sectionMap = eng.metadata?.sections ?? {};
  const detailMap = eng.metadata?.section_details ?? {};
  let sectionName: string | null = null;
  for (const [num, name] of Object.entries(sectionMap)) {
    const d = detailMap[num];
    if (
      d?.hadithnumber_first !== undefined &&
      d?.hadithnumber_last !== undefined &&
      engEntry.hadithnumber !== undefined &&
      engEntry.hadithnumber >= d.hadithnumber_first &&
      engEntry.hadithnumber <= d.hadithnumber_last
    ) {
      sectionName = name;
      break;
    }
  }

  return {
    hadithNumber: engEntry.hadithnumber ?? idx + 1,
    arabic: arabicText,
    english: body,
    narrator,
    bookName: eng.metadata?.name ?? "Sahih al-Bukhari",
    sectionName,
  };
}
