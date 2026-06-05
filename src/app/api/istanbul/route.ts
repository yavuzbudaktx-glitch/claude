// Istanbul weather (Open-Meteo, keyless, CORS-friendly). Time is computed
// client-side from the IANA zone; traffic on the Bosphorus crossings is
// estimated client-side from the local rush-hour curve (no free per-bridge
// real-time feed exists without a paid traffic key).

import { NextResponse } from "next/server";

export const revalidate = 900;

const WMO: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear", icon: "☀️" },
  1: { label: "Mainly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" }, 48: { label: "Rime fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" }, 53: { label: "Drizzle", icon: "🌦️" }, 55: { label: "Heavy drizzle", icon: "🌦️" },
  61: { label: "Light rain", icon: "🌧️" }, 63: { label: "Rain", icon: "🌧️" }, 65: { label: "Heavy rain", icon: "🌧️" },
  66: { label: "Freezing rain", icon: "🌧️" }, 67: { label: "Freezing rain", icon: "🌧️" },
  71: { label: "Light snow", icon: "🌨️" }, 73: { label: "Snow", icon: "🌨️" }, 75: { label: "Heavy snow", icon: "❄️" },
  77: { label: "Snow grains", icon: "🌨️" },
  80: { label: "Showers", icon: "🌦️" }, 81: { label: "Showers", icon: "🌦️" }, 82: { label: "Violent showers", icon: "⛈️" },
  85: { label: "Snow showers", icon: "🌨️" }, 86: { label: "Snow showers", icon: "🌨️" },
  95: { label: "Thunderstorm", icon: "⛈️" }, 96: { label: "Thunderstorm", icon: "⛈️" }, 99: { label: "Thunderstorm", icon: "⛈️" },
};

interface OM { current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number; relative_humidity_2m?: number } }

export async function GET() {
  try {
    const r = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=41.0082&longitude=28.9784" +
      "&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=Europe%2FIstanbul",
      { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return NextResponse.json({ error: `om_${r.status}` }, { status: 502 });
    const j = (await r.json()) as OM;
    const code = j.current?.weather_code ?? 3;
    const w = WMO[code] ?? { label: "—", icon: "🌡️" };
    return NextResponse.json(
      {
        temp: Math.round(j.current?.temperature_2m ?? 0),
        code,
        label: w.label,
        icon: w.icon,
        wind: Math.round(j.current?.wind_speed_10m ?? 0),
        humidity: Math.round(j.current?.relative_humidity_2m ?? 0),
      },
      { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=3600" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "weather_unavailable" }, { status: 502 });
  }
}
