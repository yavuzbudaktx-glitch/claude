"use client";

import useSWR from "swr";
import { Cloud, CloudRain, CloudSnow, Sun, CloudSun, CloudLightning, Cloudy, MapPin } from "lucide-react";
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
  const cls = "h-14 w-14";
  if (code === 0) return <Sun className={`${cls} text-amber-400`} />;
  if (code <= 2) return <CloudSun className={`${cls} text-amber-300`} />;
  if (code === 3) return <Cloudy className={`${cls} text-slate-400`} />;
  if (code >= 45 && code <= 48) return <Cloud className={`${cls} text-slate-400`} />;
  if (code >= 51 && code <= 67) return <CloudRain className={`${cls} text-sky-400`} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={`${cls} text-sky-200`} />;
  if (code >= 80 && code <= 82) return <CloudRain className={`${cls} text-sky-400`} />;
  if (code >= 95) return <CloudLightning className={`${cls} text-yellow-400`} />;
  return <Cloud className={`${cls} text-slate-400`} />;
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
    <Card
      title="Weather"
      icon={<MapPin className="h-3.5 w-3.5" />}
      action={<span className="text-[11px] text-muted">Dallas, TX</span>}
    >
      {isLoading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-rose-400">Couldn&rsquo;t load weather.</p>}
      {data?.current && data.daily && (
        <div className="flex items-center gap-5">
          {codeToIcon(data.current.weather_code)}
          <div>
            <div className="font-serif text-5xl font-light tabular-nums leading-none">
              {Math.round(data.current.temperature_2m)}°
            </div>
            <div className="mt-1 text-sm">{codeToLabel(data.current.weather_code)}</div>
            <div className="text-muted text-xs mt-0.5">
              feels {Math.round(data.current.apparent_temperature)}° · H{" "}
              {Math.round(data.daily.temperature_2m_max[0])}° · L{" "}
              {Math.round(data.daily.temperature_2m_min[0])}°
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
