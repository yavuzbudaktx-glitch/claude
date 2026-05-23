import { NextResponse } from "next/server";

// Per-city, so it must read the request — opt out of static caching. The
// upstream Open-Meteo fetch is still cached for 10 min per coordinate set.
export const dynamic = "force-dynamic";

const DALLAS_LAT = 32.7767;
const DALLAS_LON = -96.797;

function num(v: string | null, fallback: number): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(fallback);
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = num(sp.get("lat"), DALLAS_LAT);
  const lon = num(sp.get("lon"), DALLAS_LON);
  const tzRaw = sp.get("tz") ?? "America/Chicago";
  const tz = /^[A-Za-z0-9_+\-/]+$/.test(tzRaw) ? tzRaw : "auto";

  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: tz,
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "weather_unavailable" }, { status: 502 });
  }

  return NextResponse.json(await res.json());
}
