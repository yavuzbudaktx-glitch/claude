export const TOTAL_AYAHS = 6236;

// Deterministic per-day verse (UTC). Same verse for everyone, all day.
export function dailyAyahNumber(date = new Date()): number {
  const seed = Number(
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
      date.getUTCDate(),
    ).padStart(2, "0")}`,
  );
  let x = seed;
  x = ((x * 1664525) + 1013904223) >>> 0;
  x = ((x * 22695477) + 1) >>> 0;
  return (x % TOTAL_AYAHS) + 1;
}

export interface AyahPayload {
  number: number;
  arabic: string;
  english: string;
  englishTranslator: string;
  surahName: string;
  surahNameEnglish: string;
  surahNameTranslation: string;
  numberInSurah: number;
}

interface RawEditionEntry {
  number: number;
  text: string;
  numberInSurah: number;
  surah: { name: string; englishName: string; englishNameTranslation: string };
  edition: { identifier: string; name: string; englishName: string };
}

// Sahih International is the standard modern English translation used in most
// Muslim apps (DeenBuddy, Muslim Pro, etc). Pickthall/Yusuf Ali as fallbacks.
const ENGLISH_EDITIONS = [
  { id: "en.sahih",    label: "Sahih International" },
  { id: "en.pickthall",label: "Pickthall"           },
  { id: "en.yusufali", label: "Yusuf Ali"           },
  { id: "en.asad",     label: "Muhammad Asad"       },
] as const;

export async function fetchDailyAyah(): Promise<AyahPayload> {
  const n = dailyAyahNumber();
  const editionList = ["quran-uthmani", ...ENGLISH_EDITIONS.map((e) => e.id)].join(",");
  const res = await fetch(
    `https://api.alquran.cloud/v1/ayah/${n}/editions/${editionList}`,
    { next: { revalidate: 86400 } },
  );

  if (!res.ok) throw new Error(`AlQuran ${res.status}`);
  const json = (await res.json()) as { data: RawEditionEntry[] };

  const arabic = json.data.find((d) => d.edition.identifier === "quran-uthmani");
  if (!arabic) throw new Error("Arabic edition missing");

  let english: RawEditionEntry | undefined;
  let translatorLabel = "";
  for (const candidate of ENGLISH_EDITIONS) {
    const found = json.data.find((d) => d.edition.identifier === candidate.id);
    if (found && found.text && found.text.trim().length > 0) {
      english = found;
      translatorLabel = candidate.label;
      break;
    }
  }
  if (!english) throw new Error("English edition missing");

  return {
    number: n,
    arabic: arabic.text,
    english: english.text,
    englishTranslator: translatorLabel,
    surahName: arabic.surah.name,
    surahNameEnglish: arabic.surah.englishName,
    surahNameTranslation: arabic.surah.englishNameTranslation,
    numberInSurah: arabic.numberInSurah,
  };
}
