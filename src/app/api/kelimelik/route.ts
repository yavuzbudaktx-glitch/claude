// Daily Kelimelik target — deterministic-per-day pick from a curated list of
// common Turkish 5-letter words. Same word for both players on a given day.
// Pass ?d=YYYY-MM-DD for a specific day. Words are stored in Turkish uppercase
// (İ, I, Ç, Ğ, Ö, Ş, Ü are single letters).

import { NextResponse } from "next/server";

export const revalidate = 3600;

// Common Turkish 5-letter words (nouns, adjectives, everyday vocabulary).
const WORDS = [
  "KALEM","KİTAP","ARABA","BAHÇE","DENİZ","ELMAS","ORMAN","YEMEK","ÇOCUK","KADIN",
  "BALIK","BULUT","ÇİÇEK","GÜNEŞ","YOLCU","ŞEKER","PARÇA","TAVUK","TABAK","DUVAR",
  "PERDE","DOLAP","LAMBA","HAYAT","İNSAN","DÜNYA","BURUN","SAKAL","DUDAK","YANAK",
  "TOPUK","KEMİK","TARAK","SABUN","HAVLU","FIRÇA","MAKAS","İPLİK","KUMAŞ","DÜĞME",
  "CEKET","ÇORAP","KEMER","ŞAPKA","PALTO","ÇANTA","YÜZÜK","KOLYE","ALTIN","GÜMÜŞ",
  "BAKIR","DEMİR","KÖMÜR","TAHTA","KAĞIT","BALON","KUKLA","BEBEK","KÖPEK","KOYUN",
  "ASLAN","YILAN","KARGA","SERÇE","ÖRDEK","HİNDİ","HOROZ","SİNEK","BÖCEK","YUNUS",
  "ÇINAR","KAVAK","TOHUM","MEYVE","ARMUT","KİRAZ","İNCİR","KAVUN","BİBER","SOĞAN",
  "HAVUÇ","MARUL","NOHUT","EKMEK","KÖFTE","ÇORBA","PİLAV","BÖREK","SİMİT","PASTA",
  "HELVA","LOKUM","KAHVE","AYRAN","LİMON","TUZLU","KEKİK","SINIF","SİLGİ","TENİS",
  "YÜZME","BEYAZ","SİYAH","YEŞİL","PEMBE","RAKAM","SEKİZ","DOKUZ","SABAH","AKŞAM",
  "ÖĞLEN","HAFTA","BAHAR","GÜZEL","BÜYÜK","KÜÇÜK","GENİŞ","HAFİF","HIZLI","YAVAŞ",
  "SICAK","SOĞUK","ISLAK","TEMİZ","KİRLİ","YAŞLI","FAKİR","MUTLU","ÜZGÜN","TATLI",
  "ŞEHİR","SOKAK","CADDE","KÖPRÜ","TÜNEL","NEHİR","GÖLET","VAPUR","MOTOR","TAKSİ",
  "SALON","BANYO","YATAK","AVİZE","TEYZE","GELİN","DAMAT","TORUN","SEVGİ","HUZUR",
  "KORKU","HÜZÜN","HAYAL","FİKİR","BİLGİ","HABER","DİLEK","HEDEF","SICAK","VADİ",
  "GENÇ","MEŞE","TEPE","YOLCU","MARUL","GÖLGE","KUTU","DALGA","RÜYA","TARLA",
  "ÇATAL","BIÇAK","KAŞIK","TENCERE","BARDAK","SÜRAHİ","PEÇETE","LEĞEN",
  "KEDİ","GÜVERCİN",
];

// Only keep genuine 5-letter entries (guards against accidental typos above).
const FIVE = WORDS.filter((w) => [...w].length === 5);

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const idx = seedIdx(dateKey + "-kelimelik", FIVE.length);
  return NextResponse.json({ date: dateKey, answer: FIVE[idx] });
}
