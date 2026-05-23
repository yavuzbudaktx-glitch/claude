"use client";

import { useCallback, useEffect, useState } from "react";

// A single source of truth for the dashboard's location. Persisted to
// localStorage and broadcast over a window event so every widget that
// depends on place (weather, the analog clock, prayer times) updates the
// instant the user picks a new city — no page reload required.

export interface City {
  name: string;
  admin?: string;     // region / state, e.g. "Texas"
  country?: string;   // country code, e.g. "US"
  lat: number;
  lon: number;
  timezone: string;   // IANA tz, e.g. "America/Chicago"
}

export const DEFAULT_CITY: City = {
  name: "Dallas",
  admin: "Texas",
  country: "US",
  lat: 32.7767,
  lon: -96.797,
  timezone: "America/Chicago",
};

const CITY_KEY = "morning.city.v1";
const CITY_EVENT = "morning:city-change";

export function readCity(): City {
  if (typeof window === "undefined") return DEFAULT_CITY;
  try {
    const raw = localStorage.getItem(CITY_KEY);
    if (!raw) return DEFAULT_CITY;
    const c = JSON.parse(raw) as Partial<City>;
    if (
      typeof c.lat === "number" &&
      typeof c.lon === "number" &&
      typeof c.name === "string" &&
      typeof c.timezone === "string"
    ) {
      return {
        name: c.name,
        admin: c.admin,
        country: c.country,
        lat: c.lat,
        lon: c.lon,
        timezone: c.timezone,
      };
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_CITY;
}

export function writeCity(c: City) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CITY_KEY, JSON.stringify(c));
  } catch {
    // ignore quota / privacy-mode errors
  }
  window.dispatchEvent(new CustomEvent(CITY_EVENT));
}

export function useCity(): { city: City; setCity: (c: City) => void } {
  // Start from the default so the server render and the first client
  // render match; hydrate the stored city in an effect to avoid a
  // hydration mismatch.
  const [city, setCityState] = useState<City>(DEFAULT_CITY);

  useEffect(() => {
    setCityState(readCity());
    const onChange = () => setCityState(readCity());
    window.addEventListener(CITY_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CITY_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setCity = useCallback((c: City) => {
    setCityState(c);   // optimistic, instant update in this component
    writeCity(c);      // persist + notify every other useCity()
  }, []);

  return { city, setCity };
}

export interface GeoResult {
  name: string;
  admin?: string;
  country?: string;
  lat: number;
  lon: number;
  timezone: string;
}

// Free, keyless, CORS-enabled geocoding from Open-Meteo. Returns the IANA
// timezone alongside coordinates, which the clock + prayer times need.
export async function searchCities(query: string): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
      `&count=8&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: Array<{
        name: string;
        latitude: number;
        longitude: number;
        timezone: string;
        country?: string;
        country_code?: string;
        admin1?: string;
      }>;
    };
    return (json.results ?? []).map((r) => ({
      name: r.name,
      admin: r.admin1,
      country: r.country_code ?? r.country,
      lat: r.latitude,
      lon: r.longitude,
      timezone: r.timezone,
    }));
  } catch {
    return [];
  }
}

// Wall-clock h/m/s for a given IANA timezone — used by both the analog
// clock and the prayer-time countdown so they read the selected city's
// local time, not the browser's.
export function clockPartsInTz(date: Date, tz: string): { h: number; m: number; s: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    let h = get("hour");
    if (h === 24) h = 0; // some engines emit "24" at midnight
    return { h, m: get("minute"), s: get("second") };
  } catch {
    return { h: date.getHours(), m: date.getMinutes(), s: date.getSeconds() };
  }
}

// Today's date in a timezone as DD-MM-YYYY (the format the Aladhan prayer
// API expects on its /timings/{date} path).
export function cityDateDDMMYYYY(tz: string, date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("day")}-${get("month")}-${get("year")}`;
  } catch {
    const d = date;
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  }
}
