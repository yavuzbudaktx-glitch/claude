"use client";

import useSWR from "swr";
import { Cloud, CloudRain, CloudSnow, Sun, CloudSun, CloudLightning, Cloudy } from "lucide-react";
import { Card } from "@/components/Card";
import type { AyahPayload } from "@/lib/quran";

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

function codeToIcon(code: number, size = "h-12 w-12") {
  const cls = `${size} stroke-[1.25]`;
  if (code === 0) return <Sun className={`${cls} text-accent`} />;
  if (code <= 2) return <CloudSun className={`${cls} text-accent`} />;
  if (code === 3) return <Cloudy className={`${cls}`} />;
  if (code >= 45 && code <= 48) return <Cloud className={`${cls}`} />;
  if (code >= 51 && code <= 67) return <CloudRain className={`${cls}`} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={`${cls}`} />;
  if (code >= 80 && code <= 82) return <CloudRain className={`${cls}`} />;
  if (code >= 95) return <CloudLightning className={`${cls}`} />;
  return <Cloud className={`${cls}`} />;
}

function codeToLabel(code: number) {
  if (code === 0) return "Açık";
  if (code <= 2) return "Parçalı güneşli";
  if (code === 3) return "Kapalı";
  if (code >= 45 && code <= 48) return "Sisli";
  if (code >= 51 && code <= 67) return "Yağmurlu";
  if (code >= 71 && code <= 77) return "Karlı";
  if (code >= 80 && code <= 82) return "Sağanak";
  if (code >= 95) return "Fırtınalı";
  return "—";
}

export function WeatherVerseCard() {
  const { data: w, isLoading: wLoading } = useSWR<WeatherResp>("/api/weather", fetcher, {
    refreshInterval: 1000 * 60 * 10,
  });
  const { data: a, isLoading: aLoading } = useSWR<AyahPayload>("/api/quran", fetcher);

  return (
    <Card num="01" title="Hava · Ayet" meta="Dallas · today">
      <div className="grid grid-cols-2 gap-0 -mx-1">
        <div className="px-3 border-r rule-soft border-r-[var(--rule-soft)]">
          <div className="label mb-2">Weather</div>
          {wLoading && <p className="text-muted text-sm">Loading…</p>}
          {w?.current && w.daily && (
            <div className="flex items-start gap-3">
              <div className="mt-1">{codeToIcon(w.current.weather_code)}</div>
              <div>
                <div className="font-serif text-5xl font-light tabular-nums leading-none">
                  {Math.round(w.current.temperature_2m)}°
                </div>
                <div className="text-xs mt-2">{codeToLabel(w.current.weather_code)}</div>
                <div className="font-mono text-[10px] tracking-wider text-muted mt-1 uppercase">
                  H {Math.round(w.daily.temperature_2m_max[0])}° · L {Math.round(w.daily.temperature_2m_min[0])}° ·
                  {" "}feels {Math.round(w.current.apparent_temperature)}°
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-3">
          <div className="label mb-2">Günün Ayeti</div>
          {aLoading && <p className="text-muted text-sm">Loading…</p>}
          {a && (
            <div>
              <p
                dir="rtl"
                lang="ar"
                className="font-arabic text-xl md:text-[22px] leading-loose text-right"
              >
                {a.arabic}
              </p>
              <div className="font-mono text-[10px] tracking-wider text-muted mt-2 uppercase text-right">
                {a.surahNameTurkish} · {a.numberInSurah}
              </div>
            </div>
          )}
        </div>
      </div>

      {a && (
        <div className="mt-4 pt-4 border-t rule">
          <p className="font-serif italic text-[15px] leading-relaxed">
            &ldquo;{a.turkish}&rdquo;
          </p>
          <div className="font-mono text-[10px] tracking-wider text-muted mt-2 uppercase">
            Çeviri · {a.turkishTranslator}
          </div>
        </div>
      )}
    </Card>
  );
}
