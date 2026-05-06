// Curated list of well-known, contextually self-contained Quran verses.
// These are the verses commonly featured as "verse of the day" across Islamic
// apps: standalone aphorisms, du'as, and the famously-cited ayat. Picking from
// this set (instead of a uniformly-random ayah out of 6,236) avoids landing on
// legal-rulings fragments and mid-narrative sentences that read poorly alone.

// SURAH_START[i] = the absolute ayah number BEFORE surah (i+1) begins.
// So absolute_number(surah, ayah) = SURAH_START[surah - 1] + ayah.
const SURAH_START: number[] = [
  0,    7,    293,  493,  669,  789,  954,  1160, 1235, 1364,
  1473, 1596, 1707, 1750, 1802, 1901, 2029, 2140, 2250, 2348,
  2483, 2595, 2673, 2791, 2855, 2932, 3159, 3252, 3340, 3409,
  3469, 3503, 3533, 3606, 3660, 3705, 3788, 3970, 4058, 4133,
  4218, 4272, 4325, 4414, 4473, 4510, 4545, 4583, 4612, 4630,
  4675, 4735, 4784, 4846, 4901, 4979, 5075, 5104, 5126, 5150,
  5163, 5177, 5188, 5199, 5217, 5229, 5241, 5271, 5323, 5375,
  5419, 5447, 5475, 5495, 5551, 5591, 5622, 5672, 5712, 5758,
  5800, 5829, 5848, 5884, 5909, 5931, 5948, 5967, 5993, 6023,
  6043, 6058, 6079, 6090, 6098, 6106, 6125, 6130, 6138, 6146,
  6157, 6168, 6176, 6179, 6188, 6193, 6197, 6204, 6207, 6213,
  6216, 6221, 6225, 6230,
];

export interface VerseKey {
  surah: number;
  ayah: number;
  ayahNumber: number;
}

function k(surah: number, ayah: number): VerseKey {
  return { surah, ayah, ayahNumber: SURAH_START[surah - 1] + ayah };
}

export const CURATED_VERSE_KEYS: VerseKey[] = [
  // Al-Fatiha
  k(1, 1), k(1, 2), k(1, 5), k(1, 6),

  // Al-Baqara
  k(2, 152), k(2, 153), k(2, 155), k(2, 156), k(2, 177),
  k(2, 186), k(2, 201), k(2, 216), k(2, 255), k(2, 256),
  k(2, 261), k(2, 286),

  // Aal-i-Imraan
  k(3, 8), k(3, 26), k(3, 31), k(3, 102), k(3, 139),
  k(3, 159), k(3, 160), k(3, 185), k(3, 191), k(3, 193),
  k(3, 200),

  // An-Nisaa
  k(4, 36), k(4, 135),

  // Al-Maaida
  k(5, 8), k(5, 32),

  // Al-An'aam
  k(6, 73), k(6, 103), k(6, 162),

  // Al-A'raaf
  k(7, 23), k(7, 31), k(7, 55), k(7, 56), k(7, 199), k(7, 205),

  // Al-Anfaal
  k(8, 46),

  // At-Tawba
  k(9, 51),

  // Yunus
  k(10, 62), k(10, 107),

  // Hud
  k(11, 6), k(11, 88), k(11, 114),

  // Yusuf
  k(12, 18), k(12, 64), k(12, 87),

  // Ar-Ra'd
  k(13, 11), k(13, 28),

  // Ibrahim
  k(14, 7), k(14, 24), k(14, 34),

  // An-Nahl
  k(16, 32), k(16, 53), k(16, 90), k(16, 97), k(16, 125), k(16, 128),

  // Al-Israa
  k(17, 11), k(17, 23), k(17, 24), k(17, 80), k(17, 82), k(17, 111),

  // Al-Kahf
  k(18, 10), k(18, 46), k(18, 107),

  // Maryam
  k(19, 96),

  // Taa-Haa
  k(20, 25), k(20, 114), k(20, 124), k(20, 131),

  // Al-Anbiyaa
  k(21, 35), k(21, 87), k(21, 107),

  // Al-Muminoon
  k(23, 1), k(23, 62), k(23, 96), k(23, 115), k(23, 118),

  // An-Noor
  k(24, 35),

  // Al-Furqaan
  k(25, 63), k(25, 74),

  // Ash-Shu'araa
  k(26, 80), k(26, 88), k(26, 89),

  // An-Naml
  k(27, 62),

  // Al-Qasas
  k(28, 24), k(28, 77), k(28, 88),

  // Al-Ankaboot
  k(29, 2), k(29, 69),

  // Ar-Room
  k(30, 21), k(30, 60),

  // Luqman
  k(31, 13), k(31, 18), k(31, 19), k(31, 34),

  // Al-Ahzaab
  k(33, 35), k(33, 41), k(33, 70), k(33, 71),

  // Faatir
  k(35, 5),

  // Yaseen
  k(36, 82),

  // Saad
  k(38, 54),

  // Az-Zumar
  k(39, 9), k(39, 10), k(39, 53),

  // Al-Ghaafir
  k(40, 60),

  // Fussilat
  k(41, 30), k(41, 34), k(41, 53),

  // Ash-Shura
  k(42, 11), k(42, 25), k(42, 30),

  // Al-Ahqaf
  k(46, 15),

  // Muhammad
  k(47, 7),

  // Al-Hujuraat
  k(49, 6), k(49, 10), k(49, 11), k(49, 12), k(49, 13),

  // Qaaf
  k(50, 16),

  // Adh-Dhaariyat
  k(51, 56),

  // An-Najm
  k(53, 39),

  // Al-Qamar
  k(54, 17),

  // Ar-Rahmaan
  k(55, 13), k(55, 60),

  // Al-Hadid
  k(57, 4), k(57, 20),

  // Al-Mujaadila
  k(58, 11),

  // Al-Hashr
  k(59, 18), k(59, 22), k(59, 23), k(59, 24),

  // As-Saff
  k(61, 4), k(61, 10),

  // At-Taghaabun
  k(64, 11),

  // At-Talaaq
  k(65, 2), k(65, 3), k(65, 7),

  // At-Tahrim
  k(66, 8),

  // Al-Mulk
  k(67, 1), k(67, 2), k(67, 14),

  // Al-Qalam
  k(68, 4),

  // Al-Muzzammil
  k(73, 8),

  // Al-Insaan
  k(76, 30),

  // Al-A'laa
  k(87, 14), k(87, 15),

  // Al-Ghaashiya
  k(88, 17),

  // Al-Fajr
  k(89, 27), k(89, 28), k(89, 29), k(89, 30),

  // Ash-Shams
  k(91, 9), k(91, 10),

  // Ad-Dhuhaa
  k(93, 3), k(93, 4), k(93, 5), k(93, 6), k(93, 7), k(93, 8), k(93, 11),

  // Ash-Sharh
  k(94, 5), k(94, 6), k(94, 7), k(94, 8),

  // At-Tin
  k(95, 4), k(95, 5), k(95, 6),

  // Al-Alaq
  k(96, 1),

  // Al-Qadr
  k(97, 1), k(97, 3),

  // Az-Zalzala
  k(99, 7), k(99, 8),

  // Al-Asr
  k(103, 1), k(103, 2), k(103, 3),

  // Al-Kawthar
  k(108, 1), k(108, 2),

  // An-Nasr
  k(110, 3),

  // Al-Ikhlaas
  k(112, 1), k(112, 2), k(112, 3), k(112, 4),

  // Al-Falaq
  k(113, 1),

  // An-Naas
  k(114, 1),
];
