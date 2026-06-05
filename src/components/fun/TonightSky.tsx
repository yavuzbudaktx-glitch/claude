"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Moon as MoonIcon, Sun, Sunset as SunsetIcon, Compass, Clock, Building2 } from "lucide-react";
import {
  getMoonIllumination,
  getSunTimes,
  visibleTonightPlanets,
  type MoonPhase,
  type PlanetPos,
} from "@/lib/astronomy";
import { useCity } from "@/lib/use-city";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// Tonight's sky at a glance — moon phase, sunset / twilight / dark times, and
// the naked-eye planets that will be up tonight. All math is local; no API.
// Location follows the dashboard's synced city.

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  try {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}

// SVG glyph for the moon: a disc clipped by a moving terminator. `phase` 0..1
// (0 = new, 0.5 = full). Light side faces east (right) for waxing, west for
// waning — that's the convention the brain expects.
function MoonGlyph({ moon, size = 56 }: { moon: MoonPhase; size?: number }) {
  const r = size / 2;
  // Build a terminator path: a half-ellipse whose width scales with phase.
  // Width factor: |cos(phase * 2π)| — 1 at new/full, 0 at quarters.
  const k = Math.cos(moon.phase * 2 * Math.PI);
  const waxing = moon.phase < 0.5;
  // SVG path arc — start at top of disc, ellipse-arc down to bottom, then
  // disc-arc back up. Filling alternates depending on phase.
  const litRight = waxing;
  const ellipseRx = Math.abs(k) * r;
  // First arc: ellipse curve (terminator). Sweep flag depends on whether the
  // dark side bulges left or right.
  const sweep1 = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
  const sweep2 = litRight ? 0 : 1;
  const d = `M ${r} 0
             A ${ellipseRx} ${r} 0 1 ${sweep1} ${r} ${size}
             A ${r} ${r} 0 1 ${sweep2} ${r} 0 Z`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={moon.name}>
      {/* dark side */}
      <circle cx={r} cy={r} r={r - 0.5} fill="rgba(20,20,40,0.85)" />
      {/* lit side */}
      <path d={d} fill="var(--ink)" />
      {/* subtle rim */}
      <circle cx={r} cy={r} r={r - 0.5} fill="none" stroke="var(--rule)" strokeWidth="1" />
    </svg>
  );
}

const PLANET_TONE: Record<string, string> = {
  Mercury: "#c7c7d2",
  Venus:   "#f5e0a0",
  Mars:    "#e0563f",
  Jupiter: "#e4c590",
  Saturn:  "#d8b97a",
};

function compass(az: number): string {
  // 16-wind compass abbreviation from azimuth in degrees.
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((az % 360) / 22.5) % 16];
}

export function TonightSky() {
  const { city } = useCity();
  // Recompute at minute resolution — sunset times move slowly but the "now"
  // line and the planet altitudes drift visibly across an evening.
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const { moon, sun, planets } = useMemo(() => {
    const now = new Date();
    return {
      moon: getMoonIllumination(now),
      sun: getSunTimes(now, city.lat, city.lon),
      planets: visibleTonightPlanets(now, city.lat, city.lon),
    };
  }, [city]);

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 text-[12px]">
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span className="inline-flex items-center gap-1.5 text-accent">
          <MoonIcon className="h-3 w-3" /> Tonight · {city.name}
        </span>
        <span className="text-muted-2 tabular-nums" title="Share of the Moon's disc that's lit by the Sun right now">
          {(moon.fraction * 100).toFixed(0)}% lit
        </span>
      </div>

      {/* Moon hero */}
      <div className="flex items-center gap-3 shrink-0">
        <MoonGlyph moon={moon} size={64} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink leading-tight">{moon.name}</div>
          <div className="text-[11px] text-muted leading-tight mt-0.5" title="How far through the ~29.5-day cycle from one new moon to the next">
            Day {(moon.phase * 29.53).toFixed(1)} of 29.5 · {(moon.fraction * 100).toFixed(0)}% lit
          </div>
        </div>
      </div>

      {/* Sun / twilight timeline */}
      <div className="grid grid-cols-3 gap-2 shrink-0">
        <div className="rounded-lg p-2 border border-[var(--rule)]">
          <div className="inline-flex items-center gap-1 text-[9.5px] font-mono uppercase tracking-wider text-muted-2">
            <SunsetIcon className="h-3 w-3" /> Sunset
          </div>
          <div className="font-mono tabular-nums text-ink text-[13px] mt-0.5">{fmtTime(sun.sunset)}</div>
        </div>
        <div className="rounded-lg p-2 border border-[var(--rule)]">
          <div className="text-[9.5px] font-mono uppercase tracking-wider text-muted-2">Civil dusk</div>
          <div className="font-mono tabular-nums text-ink text-[13px] mt-0.5">{fmtTime(sun.civilDusk)}</div>
        </div>
        <div className="rounded-lg p-2 border border-[var(--rule)]">
          <div className="text-[9.5px] font-mono uppercase tracking-wider text-muted-2">True dark</div>
          <div className="font-mono tabular-nums text-ink text-[13px] mt-0.5">{fmtTime(sun.astronomicalDusk)}</div>
        </div>
      </div>

      {/* Planets up tonight — natural height (3-5 rows) */}
      <div className="flex flex-col shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted">Visible · naked eye</div>
          <div className="text-[10.5px] text-muted-2">{planets.length ? `${planets.length} up` : "nothing up"}</div>
        </div>
        {planets.length === 0 ? (
          <div className="text-muted-2 text-[11.5px] italic mt-1">No planets above the horizon at dusk.</div>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {planets.map((p: PlanetPos) => (
              <li key={p.name} className="grid grid-cols-[16px_1fr_auto_auto] items-center gap-2 py-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PLANET_TONE[p.name], boxShadow: `0 0 6px ${PLANET_TONE[p.name]}` }} />
                <span className="text-ink font-medium truncate">{p.name}</span>
                <span className="inline-flex items-center gap-1 text-muted-2 tabular-nums text-[11px]">
                  <Compass className="h-3 w-3" /> {compass(p.az)}
                </span>
                <span className="text-muted tabular-nums text-[11px]">{Math.round(p.alt)}°</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Istanbul — a tiny window home: local time, weather, bridge traffic */}
      <IstanbulPanel />

      {/* takes up any remaining slack so the year clock pins to the bottom */}
      <div className="flex-1 min-h-0" />

      {/* Lower half — the year clock: where we are in the orbit. */}
      <YearClock />
    </div>
  );
}

// ---- Year clock -------------------------------------------------------------
const SEASONS_N = ["Winter", "Spring", "Summer", "Autumn"]; // northern hemisphere
function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((+d - +start) / 86400000) + 1;
}
function isLeap(y: number): boolean { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function seasonOf(d: Date): string {
  const m = d.getMonth();
  if (m <= 1 || m === 11) return SEASONS_N[0];
  if (m <= 4) return SEASONS_N[1];
  if (m <= 7) return SEASONS_N[2];
  return SEASONS_N[3];
}

function YearClock() {
  const now = new Date();
  const year = now.getFullYear();
  const total = isLeap(year) ? 366 : 365;
  const doy = dayOfYear(now);
  // include the fraction of the current day so the ring creeps in real time
  const frac = (doy - 1 + (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400) / total;
  const pct = frac * 100;
  const daysLeft = total - doy;

  const size = 84, stroke = 8, r = (size - stroke) / 2, C = 2 * Math.PI * r;
  // Quarter ticks for the solstices/equinoxes (~day 80/172/266/355).
  const ticks = [0, 0.25, 0.5, 0.75];

  return (
    <div className="shrink-0 border-t border-[var(--rule-soft)] pt-3 mt-1">
      <div className="flex items-center gap-3.5">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth={stroke} />
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
            {ticks.map((t, i) => {
              const a = t * 2 * Math.PI;
              const x1 = size / 2 + Math.cos(a) * (r - stroke / 2 - 1);
              const y1 = size / 2 + Math.sin(a) * (r - stroke / 2 - 1);
              const x2 = size / 2 + Math.cos(a) * (r + stroke / 2 + 1);
              const y2 = size / 2 + Math.sin(a) * (r + stroke / 2 + 1);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted-2)" strokeWidth="1.5" />;
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="font-mono tabular-nums text-[15px] font-bold text-ink leading-none">{pct.toFixed(1)}%</div>
              <div className="text-[8.5px] uppercase tracking-wider text-muted-2 mt-0.5">of {year}</div>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-accent">Year clock</div>
          <div className="text-[12.5px] text-ink-soft mt-1 leading-snug">
            Day <b className="text-ink tabular-nums">{doy}</b> of {total} · <b className="text-ink tabular-nums">{daysLeft}</b> left
          </div>
          <div className="text-[11px] text-muted mt-0.5">{seasonOf(now)} · {now.toLocaleDateString(undefined, { month: "long", day: "numeric" })}</div>
        </div>
      </div>
      <div className="text-[9.5px] text-muted-2 mt-2 inline-flex items-center gap-1.5">
        <Sun className="h-3 w-3" /> Computed locally — no network calls.
      </div>
    </div>
  );
}

// ---- Istanbul: a tiny window home ------------------------------------------
interface IstWeather { temp?: number; icon?: string; label?: string; wind?: number; humidity?: number; error?: string }

const BRIDGES = [
  { name: "15 Temmuz", full: "15 Temmuz Şehitler Köprüsü", bias: 0 },
  { name: "FSM", full: "Fatih Sultan Mehmet Köprüsü", bias: 0 },
  { name: "Yavuz S. Selim", full: "Yavuz Sultan Selim Köprüsü", bias: -1 },
];
const LEVELS = [
  { label: "Light", color: "var(--up)" },
  { label: "Moderate", color: "#d4a017" },
  { label: "Heavy", color: "var(--down)" },
];

// Best-effort congestion from the Istanbul rush-hour curve (no free per-bridge
// realtime feed exists without a paid traffic key) — clearly marked "est."
function congestion(hour: number, weekend: boolean, bias: number): number {
  let base: number;
  if (hour >= 7 && hour < 10) base = 2;       // morning peak
  else if (hour >= 16 && hour < 20) base = 2; // evening peak
  else if (hour >= 10 && hour < 16) base = 1; // midday
  else if (hour >= 20 && hour < 23) base = 1; // post-dinner
  else base = 0;                              // night / early morning
  if (weekend) base = Math.max(0, base - 1);
  return Math.min(2, Math.max(0, base + bias));
}

function istanbulNow(): { time: string; hour: number; weekend: boolean } {
  const now = new Date();
  let time = "";
  let hour = now.getHours();
  let weekday = now.getDay();
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    time = `${get("hour")}:${get("minute")}`;
    hour = Number(get("hour")) || 0;
    const wd = get("weekday");
    weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  } catch { time = `${String(hour).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`; }
  return { time, hour, weekend: weekday === 0 || weekday === 6 };
}

function IstanbulPanel() {
  const { data } = useSWR<IstWeather>("/api/istanbul", fetcher, { refreshInterval: 1000 * 60 * 15, keepPreviousData: true });
  const ist = istanbulNow();

  return (
    <div className="shrink-0 rounded-xl border border-[var(--rule)] p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-mono uppercase tracking-wider text-accent inline-flex items-center gap-1.5">
          <Building2 className="h-3 w-3" /> İstanbul
        </span>
        <span className="inline-flex items-center gap-2 text-[12px]">
          <span className="inline-flex items-center gap-1 text-ink font-mono tabular-nums"><Clock className="h-3 w-3 text-muted-2" /> {ist.time}</span>
          {data && !data.error && (
            <span className="inline-flex items-center gap-1 text-ink-soft" title={`${data.label} · wind ${data.wind} km/h · ${data.humidity}% RH`}>
              <span>{data.icon}</span><span className="tabular-nums">{data.temp}°</span>
            </span>
          )}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {BRIDGES.map((b) => {
          const lvl = LEVELS[congestion(ist.hour, ist.weekend, b.bias)];
          return (
            <div key={b.name} className="rounded-lg border border-[var(--rule-soft)] px-1.5 py-1.5 text-center" title={`${b.full} · ${lvl.label} (estimated)`}>
              <div className="flex items-center justify-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: lvl.color, boxShadow: `0 0 6px ${lvl.color}` }} />
                <span className="text-[9px] uppercase tracking-wide text-muted-2 truncate">{b.name}</span>
              </div>
              <div className="text-[11px] font-medium mt-0.5" style={{ color: lvl.color }}>{lvl.label}</div>
            </div>
          );
        })}
      </div>
      <div className="text-[9px] text-muted-2 mt-1.5">Bridge traffic — estimated from local rush-hour patterns.</div>
    </div>
  );
}
