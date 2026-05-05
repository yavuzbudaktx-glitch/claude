export const TOTAL_AYAHS = 6236;

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
  translation: string;
  surahName: string;
  surahNameTranslation: string;
  numberInSurah: number;
}

interface RawEditionEntry {
  number: number;
  text: string;
  numberInSurah: number;
  surah: { name: string; englishName: string; englishNameTranslation: string };
  edition: { identifier: string };
}

export async function fetchDailyAyah(): Promise<AyahPayload> {
  const n = dailyAyahNumber();
  const res = await fetch(
    `https://api.alquran.cloud/v1/ayah/${n}/editions/quran-uthmani,tr.diyanet`,
    { next: { revalidate: 86400 } },
  );

  if (!res.ok) throw new Error(`AlQuran ${res.status}`);
  const json = (await res.json()) as { data: RawEditionEntry[] };
  const arabic = json.data.find((d) => d.edition.identifier === "quran-uthmani")!;
  const turkish = json.data.find((d) => d.edition.identifier === "tr.diyanet")!;

  return {
    number: n,
    arabic: arabic.text,
    translation: turkish.text,
    surahName: arabic.surah.englishName,
    surahNameTranslation: arabic.surah.englishNameTranslation,
    numberInSurah: arabic.numberInSurah,
  };
}
