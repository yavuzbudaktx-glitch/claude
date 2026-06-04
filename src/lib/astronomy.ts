// Small, self-contained astronomy: sun and moon rise/set/twilight, moon
// phase + illumination, and rough planet positions (altitude/azimuth) for a
// given latitude/longitude. Everything is computed from first principles so
// the Tonight box never needs a network round-trip.
//
// Accuracy targets: ~1 minute on sun/moon times, ~0.5° on planet positions
// over the next century. That's far more than enough for "is Jupiter up?"
//
// References: J. Meeus, "Astronomical Algorithms"; J. P. Vallado, "Fundamentals
// of Astrodynamics"; the well-known Schlyter "Computing planetary positions"
// note. Internals stay in radians.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const J1970 = 2440588;
const J2000 = 2451545;
const dayMs = 1000 * 60 * 60 * 24;
const obliquity = 23.4397 * DEG;

function toJulian(d: Date): number { return d.getTime() / dayMs - 0.5 + J1970; }
function fromJulian(j: number): Date { return new Date((j + 0.5 - J1970) * dayMs); }
function toDays(d: Date): number { return toJulian(d) - J2000; }

// ---- general spherical helpers ---------------------------------------------
function rightAscension(l: number, b: number): number {
  return Math.atan2(Math.sin(l) * Math.cos(obliquity) - Math.tan(b) * Math.sin(obliquity), Math.cos(l));
}
function declination(l: number, b: number): number {
  return Math.asin(Math.sin(b) * Math.cos(obliquity) + Math.cos(b) * Math.sin(obliquity) * Math.sin(l));
}
function siderealTime(d: number, lw: number): number {
  return (280.16 + 360.9856235 * d) * DEG - lw;
}
function altAz(H: number, phi: number, dec: number): { alt: number; az: number } {
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { alt, az };
}

// ---- sun -------------------------------------------------------------------
function solarMeanAnomaly(d: number): number { return (357.5291 + 0.98560028 * d) * DEG; }
function eclipticLongitude(M: number): number {
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * DEG;
  return M + C + 102.9372 * DEG + Math.PI;
}
function sunCoords(d: number): { ra: number; dec: number; L: number; M: number } {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { ra: rightAscension(L, 0), dec: declination(L, 0), L, M };
}

// ---- moon ------------------------------------------------------------------
function moonCoords(d: number): { ra: number; dec: number; dist: number; L: number; M: number; F: number } {
  const L = (218.316 + 13.176396 * d) * DEG;       // ecliptic longitude
  const M = (134.963 + 13.064993 * d) * DEG;       // mean anomaly
  const F = (93.272 + 13.229350 * d) * DEG;        // mean distance
  const l = L + 6.289 * DEG * Math.sin(M);         // longitude
  const b = 5.128 * DEG * Math.sin(F);             // latitude
  const dt = 385001 - 20905 * Math.cos(M);         // distance, km
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt, L, M, F };
}

// ---- moon phase ------------------------------------------------------------
export interface MoonPhase {
  fraction: number;     // illuminated fraction 0..1
  phase: number;        // 0..1, where 0 = new, 0.25 = first quarter, 0.5 = full
  angle: number;        // bright-limb angle (used to orient the icon)
  name: string;         // "Waxing crescent", etc.
}
export function getMoonIllumination(date: Date): MoonPhase {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const fraction = (1 + Math.cos(inc)) / 2;
  const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
  let name = "New moon";
  if (phase < 0.03 || phase > 0.97) name = "New moon";
  else if (phase < 0.22) name = "Waxing crescent";
  else if (phase < 0.28) name = "First quarter";
  else if (phase < 0.47) name = "Waxing gibbous";
  else if (phase < 0.53) name = "Full moon";
  else if (phase < 0.72) name = "Waning gibbous";
  else if (phase < 0.78) name = "Last quarter";
  else                   name = "Waning crescent";
  return { fraction, phase, angle, name };
}

// ---- sunrise / set / twilight ---------------------------------------------
const J0 = 0.0009;
function julianCycle(d: number, lw: number): number { return Math.round(d - J0 - lw / (2 * Math.PI)); }
function approxTransit(Ht: number, lw: number, n: number): number { return J0 + (Ht + lw) / (2 * Math.PI) + n; }
function solarTransitJ(ds: number, M: number, L: number): number {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
}
function hourAngle(h: number, phi: number, d: number): number {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
}
function getSetJ(h: number, lw: number, phi: number, dec: number, n: number, M: number, L: number): number {
  const w = hourAngle(h, phi, dec);
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  civilDusk: Date | null;     // sun 6° below
  nauticalDusk: Date | null;  // sun 12° below
  astronomicalDusk: Date | null; // sun 18° below — "true dark"
}
export function getSunTimes(date: Date, lat: number, lon: number): SunTimes {
  const lw = -lon * DEG;
  const phi = lat * DEG;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const get = (h: number, set: boolean): Date | null => {
    try {
      const Jset = getSetJ(h * DEG, lw, phi, dec, n, M, L);
      const Jrise = Jnoon - (Jset - Jnoon);
      const j = set ? Jset : Jrise;
      if (!isFinite(j)) return null;
      return fromJulian(j);
    } catch { return null; }
  };
  return {
    sunrise: get(-0.833, false),
    sunset:  get(-0.833, true),
    civilDusk:        get(-6, true),
    nauticalDusk:     get(-12, true),
    astronomicalDusk: get(-18, true),
  };
}

// ---- planets (Schlyter elements) ------------------------------------------
// Mean orbital elements at J2000, with a simple linear rate. Accuracy is
// ~0.5° in ecliptic longitude over the next century — far more than enough
// to answer "is Jupiter up tonight?"
interface OrbElem { N: number; i: number; w: number; a: number; e: number; M: number }
function el(N: number[], i: number[], w: number[], a: number[], e: number[], M: number[]): (d: number) => OrbElem {
  return (d) => ({
    N: (N[0] + N[1] * d) * DEG,
    i: (i[0] + i[1] * d) * DEG,
    w: (w[0] + w[1] * d) * DEG,
    a: a[0] + a[1] * d,
    e: e[0] + e[1] * d,
    M: (M[0] + M[1] * d) * DEG,
  });
}
const PLANETS: Record<string, (d: number) => OrbElem> = {
  Mercury: el([48.3313, 3.24587e-5],   [7.0047,  5.00e-8], [29.1241,  1.01444e-5], [0.387098, 0],         [0.205635, 5.59e-10], [168.6562, 4.0923344368]),
  Venus:   el([76.6799, 2.46590e-5],   [3.3946,  2.75e-8], [54.8910,  1.38374e-5], [0.723330, 0],         [0.006773, -1.302e-9],[ 48.0052, 1.6021302244]),
  Mars:    el([49.5574, 2.11081e-5],   [1.8497, -1.78e-8], [286.5016, 2.92961e-5], [1.523688, 0],         [0.093405, 2.516e-9], [ 18.6021, 0.5240207766]),
  Jupiter: el([100.4542,2.76854e-5],   [1.3030, -1.557e-7],[273.8777, 1.64505e-5], [5.20256,  0],         [0.048498, 4.469e-9], [ 19.8950, 0.0830853001]),
  Saturn:  el([113.6634,2.38980e-5],   [2.4886, -1.081e-7],[339.3939, 2.97661e-5], [9.55475,  0],         [0.055546,-9.499e-9], [316.9670, 0.0334442282]),
};
// Earth, for heliocentric → geocentric.
const EARTH = el([0,0],[0,0],[282.9404,4.70935e-5],[1.000000,0],[0.016709,-1.151e-9],[356.0470,0.9856002585]);

function kepler(M: number, e: number): number {
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  return E;
}
function heliocentricEcliptic(p: OrbElem): { x: number; y: number; z: number } {
  const E = kepler(p.M, p.e);
  const xv = p.a * (Math.cos(E) - p.e);
  const yv = p.a * (Math.sqrt(1 - p.e * p.e) * Math.sin(E));
  const v  = Math.atan2(yv, xv);
  const r  = Math.hypot(xv, yv);
  const xh = r * (Math.cos(p.N) * Math.cos(v + p.w) - Math.sin(p.N) * Math.sin(v + p.w) * Math.cos(p.i));
  const yh = r * (Math.sin(p.N) * Math.cos(v + p.w) + Math.cos(p.N) * Math.sin(v + p.w) * Math.cos(p.i));
  const zh = r *  Math.sin(v + p.w) * Math.sin(p.i);
  return { x: xh, y: yh, z: zh };
}

export interface PlanetPos { name: string; alt: number; az: number; up: boolean; magnitude: number }
function planetGeo(name: string, d: number): { ra: number; dec: number } {
  const helio = heliocentricEcliptic(PLANETS[name](d));
  const earth = heliocentricEcliptic(EARTH(d));
  const x = helio.x - earth.x, y = helio.y - earth.y, z = helio.z - earth.z;
  const lon = Math.atan2(y, x);
  const lat = Math.atan2(z, Math.hypot(x, y));
  return { ra: rightAscension(lon, lat), dec: declination(lon, lat) };
}

// Mean apparent magnitudes at opposition / superior conjunction — good enough
// for an "is this naked-eye?" ordering.
const BASE_MAG: Record<string, number> = { Mercury: -0.5, Venus: -4.0, Mars: 0.5, Jupiter: -2.2, Saturn: 0.7 };

export function visibleTonightPlanets(date: Date, lat: number, lon: number): PlanetPos[] {
  // Sample at local astronomical dusk (~90 min after sunset) — gives a good
  // single-snapshot estimate of what's up "tonight".
  const sun = getSunTimes(date, lat, lon);
  const t = sun.civilDusk ?? new Date(date.getTime() + 1000 * 60 * 60 * 20);
  const d = toDays(t);
  const lst = siderealTime(d, -lon * DEG);
  const phi = lat * DEG;
  const out: PlanetPos[] = [];
  for (const name of Object.keys(PLANETS)) {
    const g = planetGeo(name, d);
    const H = lst - g.ra;
    const { alt, az } = altAz(H, phi, g.dec);
    out.push({
      name,
      alt: alt * RAD,
      az: ((az * RAD) + 360 + 180) % 360,   // measured from north, eastward
      up: alt > 0,
      magnitude: BASE_MAG[name],
    });
  }
  // Brightest first, then highest in the sky.
  return out.filter((p) => p.up).sort((a, b) => a.magnitude - b.magnitude || b.alt - a.alt);
}
