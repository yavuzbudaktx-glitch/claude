// Wikipedia "rabbit hole" — but the GOOD kind. Random-summary endpoints are
// 90% stubs; the featured/most-read feed has been hit-or-miss. This route
// instead rotates through a HAND-PICKED pool of genuinely interesting,
// rabbit-holey Wikipedia articles, with Wikipedia's "On this day" historical
// events blended in so each day's catalogue includes something timely.
// `?d=` keys the pick to the day; `?r=N` walks within the day's pool.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
};

// A long, hand-picked pool of evergreen "I can't stop reading this" articles.
// Mix of obscure history, science mysteries, lost civilisations, weird people,
// strange artefacts, ideas and edge-cases. Every one of these is the kind of
// thing you tell someone about at dinner.
const ARTICLES = [
  "Voynich_manuscript", "Antikythera_mechanism", "Codex_Seraphinianus",
  "Lake_Vostok", "Tunguska_event", "Mariana_Trench", "Dyatlov_Pass_incident",
  "Ourang_Medan", "Mary_Celeste", "Lost_Cosmonauts", "Wow!_signal",
  "Fermi_paradox", "Boltzmann_brain", "Roko's_basilisk", "Quantum_suicide_and_immortality",
  "Library_of_Babel", "Library_of_Alexandria", "Great_Pyramid_of_Giza",
  "Göbekli_Tepe", "Derinkuyu_underground_city", "Cappadocia",
  "Nazca_Lines", "Easter_Island", "Stonehenge", "Sumer", "Indus_Valley_civilisation",
  "Sentinelese", "Pirahã_people", "Vinland_map", "Phaistos_Disc",
  "Beale_ciphers", "Zodiac_Killer", "D._B._Cooper", "Somerton_Man",
  "Toynbee_tiles", "Cicada_3301", "Markovian_Parallax_Denigrate",
  "Tully_Monster", "Mola_mola", "Octopus", "Cuttlefish",
  "Mantis_shrimp", "Tardigrade", "Immortal_jellyfish", "Pando_(tree)",
  "Methuselah_(tree)", "Lonesome_George", "Lazarus_taxon",
  "Bismuth", "Liquid_helium", "Bose-Einstein_condensate", "Time_crystal",
  "Vantablack", "Aerogel", "Mercury_(element)", "Caesium",
  "Borges", "Kafka's_Hunger_artist", "Italo_Calvino",
  "Donald_Knuth", "Paul_Erdős", "Srinivasa_Ramanujan", "Évariste_Galois",
  "Leonhard_Euler", "Henrietta_Leavitt", "Vera_Rubin",
  "Henrietta_Lacks", "Phineas_Gage", "Patient_H.M.", "Christopher_McCandless",
  "Hedy_Lamarr", "Ada_Lovelace", "Margaret_Hamilton_(software_engineer)",
  "Bell_Labs", "Xerox_PARC", "Plan_9_from_Bell_Labs",
  "Voyager_program", "Pioneer_plaque", "Golden_Record", "Pale_Blue_Dot",
  "Hubble_Deep_Field", "Cosmic_microwave_background", "Olbers'_paradox",
  "Gödel,_Escher,_Bach", "I_Am_a_Strange_Loop", "Mandelbrot_set",
  "Conway's_Game_of_Life", "Cellular_automaton", "P_versus_NP_problem",
  "Birthday_paradox", "Monty_Hall_problem", "Banach–Tarski_paradox",
  "Newcomb's_paradox", "Ship_of_Theseus", "Sorites_paradox",
  "Apophenia", "Confirmation_bias", "Streetlight_effect",
  "Survivorship_bias", "Goodhart's_law", "Cobra_effect",
  "Stanford_marshmallow_experiment", "Milgram_experiment", "Stanford_prison_experiment",
  "Tulip_mania", "South_Sea_Company", "Long-Term_Capital_Management",
  "ENIAC", "Apollo_Guidance_Computer", "Cray-1",
  "Stuxnet", "Operation_Mincemeat", "Project_Azorian",
  "Hieronymus_Bosch", "Hilma_af_Klint", "Yayoi_Kusama",
  "Donato_Bramante", "Filippo_Brunelleschi", "Andrea_Palladio",
  "Notation_systems", "International_Phonetic_Alphabet", "Klingon_language",
  "Tibetan_singing_bowl", "Hang_(instrument)", "Theremin",
  "Sleep_paralysis", "Sleepwalking", "Lucid_dream",
];

interface WikiSummary {
  type?: string; title?: string; titles?: { normalized?: string };
  description?: string; extract?: string;
  thumbnail?: { source?: string }; originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}
// Wikipedia "On this day" feed
interface OtdEvent { text?: string; year?: number; pages?: WikiSummary[] }
interface FeaturedResp { onthisday?: OtdEvent[] }

function seedIdx(key: string, n: number): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n > 0 ? h % n : 0;
}

async function getJson<T>(url: string): Promise<T | null> {
  const tries = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(9000), cache: "no-store" });
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || text[0] !== "{") continue;
      return JSON.parse(text) as T;
    } catch { /* next */ }
  }
  return null;
}

function shape(a: WikiSummary) {
  return {
    title: a.titles?.normalized || a.title || "",
    description: a.description ?? "",
    extract: a.extract ?? "",
    imageUrl: a.thumbnail?.source ?? a.originalimage?.source ?? "",
    pageUrl: a.content_urls?.desktop?.page ?? "",
    source: "Wikipedia",
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateKey = url.searchParams.get("d") ?? new Date().toISOString().slice(0, 10);
  const refresh = Number(url.searchParams.get("r") ?? "0") || 0;

  // 1) On-this-day events for variety. Bring back the pages that the
  //    Wikipedia editors themselves tagged to today's historical events.
  const d = new Date(dateKey + "T00:00:00");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const otd = await getJson<FeaturedResp>(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`);
  const otdArticles: WikiSummary[] = [];
  for (const e of otd?.onthisday ?? []) {
    for (const p of e.pages ?? []) {
      if (p.extract && p.extract.length > 100 && p.type !== "disambiguation") otdArticles.push(p);
    }
  }

  // 2) The curated pool — fetch a small rotation of summaries so we always
  //    return one if "on this day" is empty or the network's flaky.
  const candidates = [
    ARTICLES[seedIdx(dateKey + ":a:" + refresh, ARTICLES.length)],
    ARTICLES[seedIdx(dateKey + ":b:" + refresh, ARTICLES.length)],
    ARTICLES[seedIdx(dateKey + ":c:" + refresh, ARTICLES.length)],
  ];
  const curatedSummaries = await Promise.all(
    candidates.map((t) => getJson<WikiSummary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`)),
  );
  const curated = curatedSummaries.filter((s): s is WikiSummary => !!s && !!s.extract);

  // Round-robin merge: weave curated + on-this-day so both registers show up.
  const pool: WikiSummary[] = [];
  const max = Math.max(curated.length, otdArticles.length);
  for (let i = 0; i < max; i++) {
    if (curated[i]) pool.push(curated[i]);
    if (otdArticles[i]) pool.push(otdArticles[i]);
  }

  if (pool.length === 0) {
    return NextResponse.json({ error: "no_article" }, { status: 502 });
  }
  const idx = seedIdx(dateKey + ":pick:" + refresh, pool.length);
  return NextResponse.json(shape(pool[idx]), {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" },
  });
}
