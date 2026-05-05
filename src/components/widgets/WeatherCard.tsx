"use client";

import useSWR from "swr";
import { Cloud, CloudRain, CloudSnow, Sun, CloudSun, CloudLightning, Cloudy } from "lucide-react";
import { Card } from "@/components/Card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface WeatherResp {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    relative_humidity_2m: number;
  };
  daily?: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
  };
}

function codeToIcon(code: number) {
  if (code === 0) return <Sun className="h-10 w-10 text-amber-300" />;
  if (code <= 2) return <CloudSun className="h-10 w-10 text-amber-200" />;
  if (code === 3) return <Cloudy className="h-10 w-10 text-slate-300" />;
  if (code >= 45 && code <= 48) return <Cloud className="h-10 w-10 text-slate-300" />;
  if (code >= 51 && code <= 67) return <CloudRain className="h-10 w-10 text-sky-300" />;
  if (code >= 71 && code <= 77) return <CloudSnow className="h-10 w-10 text-sky-100" />;
  if (code >= 80 && code <= 82) return <CloudRain className="h-10 w-10 text-sky-300" />;
  if (code >= 95) return <CloudLightning className="h-10 w-10 text-yellow-300" />;
  return <Cloud className="h-10 w-10 text-slate-300" />;
}

function codeToLabel(code: number) {
  if (code === 0) return "Clear sky";
  if (code <= 2) return "Mostly sunny";
  if (code === 3) return "Overcast";
  if (code >= 45 && code <= 48) return "Foggy";
  if (code >= 51 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Thunderstorms";
  return "—";
}

export function WeatherCard() {
  const { data, error, isLoading } = useSWR<WeatherResp>("/api/weather", fetcher, {
    refreshInterval: 1000 * 60 * 10,
  });

  return (
    <Card title="Dallas Weather">
      {isLoading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-rose-400">Couldn&rsquo;t load weather.</p>}
      {data?.current && data.daily && (
        <div className="flex items-center gap-5">
          {codeToIcon(data.current.weather_code)}
          <div>
            <div className="text-4xl font-semibold tabular-nums">
              {Math.round(data.current.temperature_2m)}°F
            </div>
            <div className="text-muted text-sm">
              {codeToLabel(data.current.weather_code)} · feels {Math.round(data.current.apparent_temperature)}°
            </div>
            <div className="text-muted text-sm">
              H {Math.round(data.daily.temperature_2m_max[0])}° · L{" "}
              {Math.round(data.daily.temperature_2m_min[0])}° · {Math.round(data.current.wind_speed_10m)} mph
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
