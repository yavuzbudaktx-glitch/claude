// Daily Worldle (the geography game). Deterministic-per-day pick from a
// curated 80-country pool so everyone playing on the same day gets the same
// answer. Silhouettes come from Wikipedia's flag-as-svg path so we don't
// have to ship images.

import { NextResponse } from "next/server";

export const revalidate = 3600;

interface Country { name: string; code: string; svg: string }

// Hand-picked: globally recognizable, distinctive flag/shape.
const POOL: Country[] = [
  { name: "Italy",          code: "IT", svg: "Flag_of_Italy.svg" },
  { name: "Brazil",         code: "BR", svg: "Flag_of_Brazil.svg" },
  { name: "Japan",          code: "JP", svg: "Flag_of_Japan.svg" },
  { name: "Canada",         code: "CA", svg: "Flag_of_Canada.svg" },
  { name: "Australia",      code: "AU", svg: "Flag_of_Australia.svg" },
  { name: "United Kingdom", code: "GB", svg: "Flag_of_the_United_Kingdom.svg" },
  { name: "France",         code: "FR", svg: "Flag_of_France.svg" },
  { name: "Germany",        code: "DE", svg: "Flag_of_Germany.svg" },
  { name: "Spain",          code: "ES", svg: "Flag_of_Spain.svg" },
  { name: "Portugal",       code: "PT", svg: "Flag_of_Portugal.svg" },
  { name: "Switzerland",    code: "CH", svg: "Flag_of_Switzerland.svg" },
  { name: "Sweden",         code: "SE", svg: "Flag_of_Sweden.svg" },
  { name: "Norway",         code: "NO", svg: "Flag_of_Norway.svg" },
  { name: "Finland",        code: "FI", svg: "Flag_of_Finland.svg" },
  { name: "Denmark",        code: "DK", svg: "Flag_of_Denmark.svg" },
  { name: "Iceland",        code: "IS", svg: "Flag_of_Iceland.svg" },
  { name: "Ireland",        code: "IE", svg: "Flag_of_Ireland.svg" },
  { name: "Netherlands",    code: "NL", svg: "Flag_of_the_Netherlands.svg" },
  { name: "Belgium",        code: "BE", svg: "Flag_of_Belgium_(civil).svg" },
  { name: "Greece",         code: "GR", svg: "Flag_of_Greece.svg" },
  { name: "Turkey",         code: "TR", svg: "Flag_of_Turkey.svg" },
  { name: "Poland",         code: "PL", svg: "Flag_of_Poland.svg" },
  { name: "Russia",         code: "RU", svg: "Flag_of_Russia.svg" },
  { name: "Ukraine",        code: "UA", svg: "Flag_of_Ukraine.svg" },
  { name: "China",          code: "CN", svg: "Flag_of_the_People%27s_Republic_of_China.svg" },
  { name: "South Korea",    code: "KR", svg: "Flag_of_South_Korea.svg" },
  { name: "Vietnam",        code: "VN", svg: "Flag_of_Vietnam.svg" },
  { name: "Thailand",       code: "TH", svg: "Flag_of_Thailand.svg" },
  { name: "India",          code: "IN", svg: "Flag_of_India.svg" },
  { name: "Pakistan",       code: "PK", svg: "Flag_of_Pakistan.svg" },
  { name: "Indonesia",      code: "ID", svg: "Flag_of_Indonesia.svg" },
  { name: "Philippines",    code: "PH", svg: "Flag_of_the_Philippines.svg" },
  { name: "Malaysia",       code: "MY", svg: "Flag_of_Malaysia.svg" },
  { name: "Singapore",      code: "SG", svg: "Flag_of_Singapore.svg" },
  { name: "Egypt",          code: "EG", svg: "Flag_of_Egypt.svg" },
  { name: "South Africa",   code: "ZA", svg: "Flag_of_South_Africa.svg" },
  { name: "Nigeria",        code: "NG", svg: "Flag_of_Nigeria.svg" },
  { name: "Kenya",          code: "KE", svg: "Flag_of_Kenya.svg" },
  { name: "Morocco",        code: "MA", svg: "Flag_of_Morocco.svg" },
  { name: "Saudi Arabia",   code: "SA", svg: "Flag_of_Saudi_Arabia.svg" },
  { name: "Israel",         code: "IL", svg: "Flag_of_Israel.svg" },
  { name: "Mexico",         code: "MX", svg: "Flag_of_Mexico.svg" },
  { name: "Argentina",      code: "AR", svg: "Flag_of_Argentina.svg" },
  { name: "Chile",          code: "CL", svg: "Flag_of_Chile.svg" },
  { name: "Colombia",       code: "CO", svg: "Flag_of_Colombia.svg" },
  { name: "Peru",           code: "PE", svg: "Flag_of_Peru.svg" },
  { name: "Venezuela",      code: "VE", svg: "Flag_of_Venezuela.svg" },
  { name: "Cuba",           code: "CU", svg: "Flag_of_Cuba.svg" },
  { name: "Jamaica",        code: "JM", svg: "Flag_of_Jamaica.svg" },
  { name: "New Zealand",    code: "NZ", svg: "Flag_of_New_Zealand.svg" },
  { name: "Iran",           code: "IR", svg: "Flag_of_Iran.svg" },
  { name: "Iraq",           code: "IQ", svg: "Flag_of_Iraq.svg" },
  { name: "Qatar",          code: "QA", svg: "Flag_of_Qatar.svg" },
  { name: "United Arab Emirates", code: "AE", svg: "Flag_of_the_United_Arab_Emirates.svg" },
  { name: "Lebanon",        code: "LB", svg: "Flag_of_Lebanon.svg" },
  { name: "Jordan",         code: "JO", svg: "Flag_of_Jordan.svg" },
  { name: "Austria",        code: "AT", svg: "Flag_of_Austria.svg" },
  { name: "Czech Republic", code: "CZ", svg: "Flag_of_the_Czech_Republic.svg" },
  { name: "Hungary",        code: "HU", svg: "Flag_of_Hungary.svg" },
  { name: "Romania",        code: "RO", svg: "Flag_of_Romania.svg" },
  { name: "Bulgaria",       code: "BG", svg: "Flag_of_Bulgaria.svg" },
  { name: "Croatia",        code: "HR", svg: "Flag_of_Croatia.svg" },
  { name: "Serbia",         code: "RS", svg: "Flag_of_Serbia.svg" },
  { name: "Cyprus",         code: "CY", svg: "Flag_of_Cyprus.svg" },
  { name: "Ethiopia",       code: "ET", svg: "Flag_of_Ethiopia.svg" },
  { name: "Ghana",          code: "GH", svg: "Flag_of_Ghana.svg" },
  { name: "Senegal",        code: "SN", svg: "Flag_of_Senegal.svg" },
  { name: "Bangladesh",     code: "BD", svg: "Flag_of_Bangladesh.svg" },
  { name: "Sri Lanka",      code: "LK", svg: "Flag_of_Sri_Lanka.svg" },
  { name: "Nepal",          code: "NP", svg: "Flag_of_Nepal.svg" },
  { name: "Mongolia",       code: "MN", svg: "Flag_of_Mongolia.svg" },
  { name: "Kazakhstan",     code: "KZ", svg: "Flag_of_Kazakhstan.svg" },
  { name: "Uzbekistan",     code: "UZ", svg: "Flag_of_Uzbekistan.svg" },
  { name: "United States",  code: "US", svg: "Flag_of_the_United_States.svg" },
  { name: "Cambodia",       code: "KH", svg: "Flag_of_Cambodia.svg" },
  { name: "Laos",           code: "LA", svg: "Flag_of_Laos.svg" },
  { name: "Myanmar",        code: "MM", svg: "Flag_of_Myanmar.svg" },
  { name: "Estonia",        code: "EE", svg: "Flag_of_Estonia.svg" },
  { name: "Latvia",         code: "LV", svg: "Flag_of_Latvia.svg" },
  { name: "Lithuania",      code: "LT", svg: "Flag_of_Lithuania.svg" },
];

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const idx = seedIdx(dateKey + "-worldle", POOL.length);
  const c = POOL[idx];
  return NextResponse.json({
    date: dateKey,
    answer: c.name,
    code: c.code,
    // flagcdn serves all ISO 3166-1 flags at predictable URLs.
    flagUrl: `https://flagcdn.com/w320/${c.code.toLowerCase()}.png`,
    candidates: POOL.map((p) => p.name).sort((a, b) => a.localeCompare(b)),
  });
}
