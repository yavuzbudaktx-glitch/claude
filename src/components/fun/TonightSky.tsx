"use client";

import { useEffect, useMemo, useState } from "react";
import { Moon as MoonIcon, Sun, Sunset as SunsetIcon, Compass } from "lucide-react";
import {
  getMoonIllumination,
  getSunTimes,
  visibleTonightPlanets,
  type MoonPhase,
  type PlanetPos,
} from "@/lib/astronomy";
import { useCity } from "@/lib/use-city";

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
        <span className="text-muted-2 tabular-nums">{(moon.fraction * 100).toFixed(0)}% lit</span>
      </div>

      {/* Moon hero */}
      <div className="flex items-center gap-3 shrink-0">
        <MoonGlyph moon={moon} size={64} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink leading-tight">{moon.name}</div>
          <div className="text-[11px] text-muted leading-tight mt-0.5">
            Phase angle {Math.round(moon.phase * 360)}°
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

      {/* Planets up tonight */}
      <div className="flex flex-col min-h-0 flex-1">
        <div className="flex items-center justify-between mb-1 shrink-0">
          <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted">Visible · naked eye</div>
          <div className="text-[10.5px] text-muted-2">{planets.length ? `${planets.length} up` : "nothing up"}</div>
        </div>
        {planets.length === 0 ? (
          <div className="text-muted-2 text-[11.5px] italic mt-1">No planets above the horizon at dusk.</div>
        ) : (
          <ul className="flex-1 min-h-0 overflow-y-auto pr-1 divide-y divide-[var(--rule-soft)]">
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

      <div className="text-[9.5px] text-muted-2 shrink-0 inline-flex items-center gap-1.5">
        <Sun className="h-3 w-3" /> Computed locally — no network calls.
      </div>
    </div>
  );
}
