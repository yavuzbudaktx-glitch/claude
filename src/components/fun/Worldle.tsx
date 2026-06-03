"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Check, X } from "lucide-react";
import { localDateKey } from "@/lib/local-date";
import { usePref } from "@/components/PrefsProvider";

interface Worldle {
  date: string;
  answer: string;
  code: string;
  flagUrl: string;
  candidates: string[];
}
const MAX_GUESSES = 6;

// Great-circle distance in km via the haversine formula. Used to score how
// close each guess is to the correct country; gives the classic Worldle
// arrow + distance hint after every wrong guess.
const COORDS: Record<string, [number, number]> = {
  IT: [42.5, 12.5], BR: [-14.2, -51.9], JP: [36.2, 138.3], CA: [56.1, -106.3],
  AU: [-25.3, 133.8], GB: [55.4, -3.4], FR: [46.2, 2.2], DE: [51.2, 10.5],
  ES: [40.5, -3.7], PT: [39.4, -8.2], CH: [46.8, 8.2], SE: [60.1, 18.6],
  NO: [60.5, 8.5], FI: [61.9, 25.7], DK: [56.3, 9.5], IS: [64.9, -19.0],
  IE: [53.1, -7.7], NL: [52.1, 5.3], BE: [50.5, 4.5], GR: [39.1, 21.8],
  TR: [38.96, 35.24], PL: [51.9, 19.1], RU: [61.5, 105.3], UA: [48.4, 31.2],
  CN: [35.9, 104.2], KR: [35.9, 127.8], VN: [14.1, 108.3], TH: [15.9, 100.9],
  IN: [20.6, 78.9], PK: [30.4, 69.3], ID: [-0.8, 113.9], PH: [12.9, 121.8],
  MY: [4.2, 101.9], SG: [1.4, 103.8], EG: [26.8, 30.8], ZA: [-30.6, 22.9],
  NG: [9.1, 8.7], KE: [-0.0, 37.9], MA: [31.8, -7.1], SA: [23.9, 45.1],
  IL: [31.0, 34.9], MX: [23.6, -102.6], AR: [-38.4, -63.6], CL: [-35.7, -71.5],
  CO: [4.6, -74.3], PE: [-9.2, -75.0], VE: [6.4, -66.6], CU: [21.5, -77.8],
  JM: [18.1, -77.3], NZ: [-40.9, 174.9], IR: [32.4, 53.7], IQ: [33.2, 43.7],
  QA: [25.4, 51.2], AE: [23.4, 53.8], LB: [33.9, 35.9], JO: [30.6, 36.2],
  AT: [47.5, 14.6], CZ: [49.8, 15.5], HU: [47.2, 19.5], RO: [45.9, 24.9],
  BG: [42.7, 25.5], HR: [45.1, 15.2], RS: [44.0, 21.0], CY: [35.1, 33.4],
  ET: [9.1, 40.5], GH: [7.9, -1.0], SN: [14.5, -14.5], BD: [23.7, 90.4],
  LK: [7.9, 80.8], NP: [28.4, 84.1], MN: [46.9, 103.8], KZ: [48.0, 66.9],
  UZ: [41.4, 64.6], US: [37.1, -95.7], KH: [12.6, 104.9], LA: [19.9, 102.5],
  MM: [21.9, 95.96], EE: [58.6, 25.0], LV: [56.9, 24.6], LT: [55.2, 23.9],
};

function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function bearing(a: [number, number], b: [number, number]): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) -
    Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
function bearingArrow(deg: number): string {
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  return arrows[Math.round(deg / 45) % 8];
}

interface DailyState { date: string; guesses: string[]; won: boolean }

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function Worldle() {
  const dateKey = useMemo(() => localDateKey(), []);
  const { data } = useSWR<Worldle>(`/api/worldle?d=${dateKey}`, fetcher, {
    refreshInterval: 1000 * 60 * 60 * 6,
    keepPreviousData: true,
  });
  const [state, setState] = usePref<DailyState>("hub.worldle.daily", { date: dateKey, guesses: [], won: false });
  useEffect(() => {
    if (state.date !== dateKey) setState({ date: dateKey, guesses: [], won: false });
  }, [dateKey, state.date, setState]);

  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  if (!data) return <p className="text-muted text-sm">Loading today&rsquo;s flag…</p>;

  const answerCode = data.code;
  const answerCoords = COORDS[answerCode];
  const guesses = state.date === dateKey ? state.guesses : [];
  const won = state.date === dateKey && state.won;
  const exhausted = guesses.length >= MAX_GUESSES;

  function findCandidate(name: string): { name: string; code: string } | null {
    const q = name.toLowerCase().trim();
    // Match by exact name first; otherwise startsWith.
    const exact = data!.candidates.find((c) => c.toLowerCase() === q);
    if (exact) {
      // Find code from the answer pool — we only have the answer's code in
      // the response, so we have to keep a parallel lookup. Reuse COORDS keys.
      // Simpler: look up by full candidate list; the route doesn't give codes
      // per candidate, so we approximate via a static table.
      return { name: exact, code: codeOf(exact) };
    }
    const partial = data!.candidates.find((c) => c.toLowerCase().startsWith(q));
    if (partial) return { name: partial, code: codeOf(partial) };
    return null;
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (won || exhausted) return;
    const match = findCandidate(input);
    if (!match) return;
    const next = [...guesses, match.name];
    const isWin = match.code === answerCode;
    setState({ date: dateKey, guesses: next, won: isWin });
    setInput("");
    setShowSuggestions(false);
  }

  const filtered = input.length >= 1
    ? data.candidates.filter((c) => c.toLowerCase().includes(input.toLowerCase())).slice(0, 6)
    : [];

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Flag (silhouette desaturated/blacked until won) */}
      <div className="relative rounded-xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule)] shrink-0 grid place-items-center" style={{ aspectRatio: "3 / 2" }}>
        <img
          src={data.flagUrl}
          alt={won ? data.answer : "Mystery country flag"}
          className="max-h-full max-w-full transition"
          style={{ filter: won ? "none" : "brightness(0) saturate(100%) invert(8%)", opacity: won ? 1 : 0.85 }}
          loading="lazy"
        />
        {won && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-[var(--up)] text-white text-[11px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
            <Check className="h-3 w-3" /> {data.answer}
          </div>
        )}
      </div>

      {/* Guess rows */}
      <ul className="space-y-1.5 shrink-0">
        {Array.from({ length: MAX_GUESSES }).map((_, i) => {
          const g = guesses[i];
          const isCorrect = g && codeOf(g) === answerCode;
          if (!g) {
            return (
              <li key={i} className="h-7 rounded-md border border-dashed border-[var(--rule)]" />
            );
          }
          const gCoords = COORDS[codeOf(g)];
          let dist = 0, arrow = "✓", pct = 100;
          if (!isCorrect && gCoords && answerCoords) {
            dist = haversine(gCoords, answerCoords);
            arrow = bearingArrow(bearing(gCoords, answerCoords));
            // 20000 km roughly = antipode; show 0–100% closeness
            pct = Math.max(0, Math.round(100 - (dist / 20000) * 100));
          }
          return (
            <li
              key={i}
              className={`h-7 flex items-center gap-2 rounded-md px-2 text-[12.5px] ${isCorrect ? "bg-[color-mix(in_srgb,var(--up)_18%,transparent)]" : "bg-[var(--rule-soft)]"}`}
            >
              <span className="flex-1 truncate font-medium text-ink">{g}</span>
              {isCorrect ? (
                <span className="text-up text-[11px] inline-flex items-center gap-1"><Check className="h-3 w-3" /> Correct</span>
              ) : (
                <>
                  <span className="font-mono text-[11px] tabular-nums text-muted">{Math.round(dist).toLocaleString()} km</span>
                  <span className="text-[14px] leading-none" aria-label={`bearing ${arrow}`}>{arrow}</span>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: pct > 70 ? "var(--up)" : pct > 40 ? "#d97706" : "var(--down)" }}>{pct}%</span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* Input or end state */}
      {!won && !exhausted ? (
        <form onSubmit={submit} className="relative shrink-0">
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Type a country…"
            className="w-full rounded-lg bg-[var(--rule-soft)] px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2"
          />
          {showSuggestions && filtered.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1 z-10 rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] backdrop-blur-xl shadow-[var(--shadow-card)] max-h-[140px] overflow-y-auto">
              {filtered.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    onMouseDown={() => { setInput(c); setShowSuggestions(false); }}
                    className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[var(--rule-soft)]"
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      ) : (
        <div className={`text-center text-[12.5px] py-2 rounded-lg shrink-0 ${won ? "text-up" : "text-down"}`}
          style={{ background: won ? "color-mix(in srgb, var(--up) 12%, transparent)" : "color-mix(in srgb, var(--down) 12%, transparent)" }}>
          {won
            ? <>You got it in {guesses.length} {guesses.length === 1 ? "try" : "tries"}!</>
            : <><X className="inline h-3.5 w-3.5" /> Today&rsquo;s answer: <b>{data.answer}</b></>}
        </div>
      )}
    </div>
  );
}

// Static lookup from the country pool's display name → ISO code. Kept in
// sync with the server's POOL.
function codeOf(name: string): string {
  return ({
    "Italy": "IT", "Brazil": "BR", "Japan": "JP", "Canada": "CA", "Australia": "AU",
    "United Kingdom": "GB", "France": "FR", "Germany": "DE", "Spain": "ES", "Portugal": "PT",
    "Switzerland": "CH", "Sweden": "SE", "Norway": "NO", "Finland": "FI", "Denmark": "DK",
    "Iceland": "IS", "Ireland": "IE", "Netherlands": "NL", "Belgium": "BE", "Greece": "GR",
    "Turkey": "TR", "Poland": "PL", "Russia": "RU", "Ukraine": "UA", "China": "CN",
    "South Korea": "KR", "Vietnam": "VN", "Thailand": "TH", "India": "IN", "Pakistan": "PK",
    "Indonesia": "ID", "Philippines": "PH", "Malaysia": "MY", "Singapore": "SG", "Egypt": "EG",
    "South Africa": "ZA", "Nigeria": "NG", "Kenya": "KE", "Morocco": "MA", "Saudi Arabia": "SA",
    "Israel": "IL", "Mexico": "MX", "Argentina": "AR", "Chile": "CL", "Colombia": "CO",
    "Peru": "PE", "Venezuela": "VE", "Cuba": "CU", "Jamaica": "JM", "New Zealand": "NZ",
    "Iran": "IR", "Iraq": "IQ", "Qatar": "QA", "United Arab Emirates": "AE", "Lebanon": "LB",
    "Jordan": "JO", "Austria": "AT", "Czech Republic": "CZ", "Hungary": "HU", "Romania": "RO",
    "Bulgaria": "BG", "Croatia": "HR", "Serbia": "RS", "Cyprus": "CY", "Ethiopia": "ET",
    "Ghana": "GH", "Senegal": "SN", "Bangladesh": "BD", "Sri Lanka": "LK", "Nepal": "NP",
    "Mongolia": "MN", "Kazakhstan": "KZ", "Uzbekistan": "UZ", "United States": "US",
    "Cambodia": "KH", "Laos": "LA", "Myanmar": "MM", "Estonia": "EE", "Latvia": "LV",
    "Lithuania": "LT",
  } as Record<string, string>)[name] ?? "??";
}
