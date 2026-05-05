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
  turkish: string;
  turkishTranslator: string;
  surahName: string;
  surahNameTurkish: string;
  numberInSurah: number;
}

interface RawEditionEntry {
  number: number;
  text: string;
  numberInSurah: number;
  surah: { name: string; englishName: string; englishNameTranslation: string };
  edition: { identifier: string; name: string; englishName: string };
}

// Preferred translators (modern, readable Turkish). Try in order, take the first that returns.
const TURKISH_EDITIONS = [
  { id: "tr.yildirim", label: "Suat Yıldırım" },
  { id: "tr.vakfi",    label: "Diyanet Vakfı"  },
  { id: "tr.diyanet",  label: "Diyanet İşleri" },
  { id: "tr.yazir",    label: "Elmalılı Yazır" },
] as const;

const SURAH_TR: Record<string, string> = {
  "Al-Faatiha":"Fâtiha","Al-Baqara":"Bakara","Aal-i-Imraan":"Âl-i İmrân","An-Nisaa":"Nisâ","Al-Maaida":"Mâide",
  "Al-An'aam":"En'âm","Al-A'raaf":"A'râf","Al-Anfaal":"Enfâl","At-Tawba":"Tevbe","Yunus":"Yûnus","Hud":"Hûd",
  "Yusuf":"Yûsuf","Ar-Ra'd":"Ra'd","Ibrahim":"İbrâhim","Al-Hijr":"Hicr","An-Nahl":"Nahl","Al-Israa":"İsrâ",
  "Al-Kahf":"Kehf","Maryam":"Meryem","Taa-Haa":"Tâ-Hâ","Al-Anbiyaa":"Enbiyâ","Al-Hajj":"Hac","Al-Muminoon":"Mü'minûn",
  "An-Noor":"Nûr","Al-Furqaan":"Furkân","Ash-Shu'araa":"Şuarâ","An-Naml":"Neml","Al-Qasas":"Kasas","Al-Ankaboot":"Ankebût",
  "Ar-Room":"Rûm","Luqman":"Lokman","As-Sajda":"Secde","Al-Ahzaab":"Ahzâb","Saba":"Sebe","Faatir":"Fâtır","Yaseen":"Yâsîn",
  "As-Saaffaat":"Sâffât","Saad":"Sâd","Az-Zumar":"Zümer","Al-Ghaafir":"Mü'min","Fussilat":"Fussilet","Ash-Shura":"Şûrâ",
  "Az-Zukhruf":"Zuhruf","Ad-Dukhaan":"Duhân","Al-Jaathiya":"Câsiye","Al-Ahqaf":"Ahkâf","Muhammad":"Muhammed",
  "Al-Fath":"Fetih","Al-Hujuraat":"Hucurât","Qaaf":"Kâf","Adh-Dhaariyat":"Zâriyât","At-Tur":"Tûr","An-Najm":"Necm",
  "Al-Qamar":"Kamer","Ar-Rahmaan":"Rahmân","Al-Waaqia":"Vâkıa","Al-Hadid":"Hadîd","Al-Mujaadila":"Mücâdele",
  "Al-Hashr":"Haşr","Al-Mumtahana":"Mümtehine","As-Saff":"Saff","Al-Jumu'a":"Cuma","Al-Munaafiqoon":"Münâfikûn",
  "At-Taghaabun":"Teğâbun","At-Talaaq":"Talâk","At-Tahrim":"Tahrîm","Al-Mulk":"Mülk","Al-Qalam":"Kalem",
  "Al-Haaqqa":"Hâkka","Al-Ma'aarij":"Meâric","Nooh":"Nûh","Al-Jinn":"Cin","Al-Muzzammil":"Müzzemmil",
  "Al-Muddaththir":"Müddessir","Al-Qiyaama":"Kıyâmet","Al-Insaan":"İnsan","Al-Mursalaat":"Mürselât","An-Naba":"Nebe",
  "An-Naazi'aat":"Nâziât","Abasa":"Abese","At-Takwir":"Tekvîr","Al-Infitaar":"İnfitâr","Al-Mutaffifin":"Mutaffifîn",
  "Al-Inshiqaaq":"İnşikâk","Al-Burooj":"Bürûc","At-Taariq":"Târık","Al-A'laa":"A'lâ","Al-Ghaashiya":"Gâşiye",
  "Al-Fajr":"Fecr","Al-Balad":"Beled","Ash-Shams":"Şems","Al-Lail":"Leyl","Ad-Dhuhaa":"Duhâ","Ash-Sharh":"İnşirâh",
  "At-Tin":"Tîn","Al-Alaq":"Alak","Al-Qadr":"Kadir","Al-Bayyina":"Beyyine","Az-Zalzala":"Zilzâl","Al-Aadiyaat":"Âdiyât",
  "Al-Qaari'a":"Kâria","At-Takaathur":"Tekâsür","Al-Asr":"Asr","Al-Humaza":"Hümeze","Al-Fil":"Fîl","Quraish":"Kureyş",
  "Al-Maa'un":"Mâûn","Al-Kawthar":"Kevser","Al-Kaafiroon":"Kâfirûn","An-Nasr":"Nasr","Al-Masad":"Tebbet",
  "Al-Ikhlaas":"İhlâs","Al-Falaq":"Felak","An-Naas":"Nâs",
};

export async function fetchDailyAyah(): Promise<AyahPayload> {
  const n = dailyAyahNumber();
  const editionList = ["quran-uthmani", ...TURKISH_EDITIONS.map((e) => e.id)].join(",");
  const res = await fetch(
    `https://api.alquran.cloud/v1/ayah/${n}/editions/${editionList}`,
    { next: { revalidate: 86400 } },
  );

  if (!res.ok) throw new Error(`AlQuran ${res.status}`);
  const json = (await res.json()) as { data: RawEditionEntry[] };

  const arabic = json.data.find((d) => d.edition.identifier === "quran-uthmani");
  if (!arabic) throw new Error("Arabic edition missing");

  let turkish: RawEditionEntry | undefined;
  let translatorLabel = "";
  for (const candidate of TURKISH_EDITIONS) {
    const found = json.data.find((d) => d.edition.identifier === candidate.id);
    if (found && found.text && found.text.trim().length > 0) {
      turkish = found;
      translatorLabel = candidate.label;
      break;
    }
  }
  if (!turkish) throw new Error("Turkish edition missing");

  const surahKey = arabic.surah.englishName;
  const surahTr = SURAH_TR[surahKey] ?? surahKey;

  return {
    number: n,
    arabic: arabic.text,
    turkish: turkish.text,
    turkishTranslator: translatorLabel,
    surahName: arabic.surah.englishName,
    surahNameTurkish: surahTr,
    numberInSurah: arabic.numberInSurah,
  };
}
