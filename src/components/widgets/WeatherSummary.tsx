"use client";

import useSWR from "swr";
import {
  Cloud, CloudRain, CloudSnow, Sun, CloudSun, CloudLightning, Cloudy,
} from "lucide-react";
import { useCity } from "@/lib/use-city";
import { CityPicker } from "@/components/CityPicker";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface WeatherResp {
  current?: { temperature_2m: number; apparent_temperature: number; weather_code: number; time?: string };
  daily?: {
    time?: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code?: number[];
  };
}

function codeToIcon(code: number) {
  const cls = "h-3.5 w-3.5 stroke-[1.5]";
  if (code === 0) return <Sun className={cls} />;
  if (code <= 2) return <CloudSun className={cls} />;
  if (code === 3) return <Cloudy className={cls} />;
  if (code >= 45 && code <= 48) return <Cloud className={cls} />;
  if (code >= 51 && code <= 67) return <CloudRain className={cls} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={cls} />;
  if (code >= 80 && code <= 82) return <CloudRain className={cls} />;
  if (code >= 95) return <CloudLightning className={cls} />;
  return <Cloud className={cls} />;
}

function codeToLabel(code: number) {
  if (code === 0) return "Clear";
  if (code <= 2) return "Mostly sunny";
  if (code === 3) return "Overcast";
  if (code >= 45 && code <= 48) return "Foggy";
  if (code >= 51 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Storms";
  return "—";
}

export function WeatherSummary() {
  const { city } = useCity();
  const { data } = useSWR<WeatherResp>(
    `/api/weather?lat=${city.lat}&lon=${city.lon}&tz=${encodeURIComponent(city.timezone)}`,
    fetcher,
    { refreshInterval: 1000 * 60 * 10, keepPreviousData: true },
  );

  const c = data?.current;
  const d = data?.daily;

  // Today's index in the daily array, matched by date in the city's TZ.
  // Open-Meteo's `timezone` param should make daily.time[0] = today, but if
  // anything's off (empty/auto tz, dst boundary, day-end) date matching is
  // the only bulletproof way to land on the right cell.
  const todayIdx = (() => {
    if (!d?.time?.length) return 0;
    const tz = city.timezone || undefined;
    let key: string;
    try {
      key = new Date().toLocaleDateString("en-CA", tz ? { timeZone: tz } : undefined);
    } catch {
      key = new Date().toLocaleDateString("en-CA");
    }
    const i = d.time.findIndex((t) => t === key || t.startsWith(key + "T") || t.startsWith(key));
    return i >= 0 ? i : 0;
  })();

  // Status reflects what's happening RIGHT NOW (current observed/modeled
  // weather), not the day's overall forecast — so a sunny morning before
  // an afternoon storm reads as "Clear", not "Storms".
  const codeForStatus = c?.weather_code ?? d?.weather_code?.[todayIdx] ?? -1;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {c && d ? (
        <>
          {codeToIcon(codeForStatus)}
          <span>{codeToLabel(codeForStatus)} {Math.round(c.temperature_2m)}°</span>
          <span className="text-muted-2">·</span>
          <span>H {Math.round(d.temperature_2m_max[todayIdx])}° L {Math.round(d.temperature_2m_min[todayIdx])}°</span>
          <span className="text-muted-2">·</span>
        </>
      ) : null}
      <CityPicker />
    </span>
  );
}
