import { NextResponse } from "next/server";

export const revalidate = 600;

const DALLAS_LAT = 32.7767;
const DALLAS_LON = -96.797;

export async function GET() {
  const params = new URLSearchParams({
    latitude: String(DALLAS_LAT),
    longitude: String(DALLAS_LON),
    current: "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "America/Chicago",
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "weather_unavailable" }, { status: 502 });
  }

  return NextResponse.json(await res.json());
}
