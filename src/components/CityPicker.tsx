"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { useCity, searchCities, type GeoResult } from "@/lib/use-city";

export function CityPicker() {
  const { city, setCity } = useCity();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Debounced geocoding search.
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const h = setTimeout(async () => {
      const r = await searchCities(q);
      setResults(r);
      setLoading(false);
    }, 250);
    return () => clearTimeout(h);
  }, [q, open]);

  function choose(r: GeoResult) {
    setCity({
      name: r.name,
      admin: r.admin,
      country: r.country,
      lat: r.lat,
      lon: r.lon,
      timezone: r.timezone,
    });
    setOpen(false);
    setQ("");
    setResults([]);
  }

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 hover:text-accent transition"
        title="Change city"
        aria-label="Change city"
      >
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">{city.name}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-64 card !p-2 shadow-xl">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-[var(--rule)] bg-[var(--paper)]">
            <Search className="h-3.5 w-3.5 text-muted shrink-0" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search any city…"
              className="bg-transparent text-sm w-full focus:outline-none placeholder:text-muted text-ink"
            />
          </div>
          <ul className="mt-1.5 max-h-64 overflow-auto">
            {loading && <li className="px-2.5 py-2 text-xs text-muted">Searching…</li>}
            {!loading && q.trim().length >= 2 && results.length === 0 && (
              <li className="px-2.5 py-2 text-xs text-muted">No matches.</li>
            )}
            {!loading && q.trim().length < 2 && (
              <li className="px-2.5 py-2 text-xs text-muted">Type a city name to search.</li>
            )}
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lon},${i}`}>
                <button
                  onClick={() => choose(r)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-hl transition flex items-baseline justify-between gap-2"
                >
                  <span className="text-sm truncate text-ink">{r.name}</span>
                  <span className="text-[11px] text-muted shrink-0">
                    {[r.admin, r.country].filter(Boolean).join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
