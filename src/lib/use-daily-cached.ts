"use client";

import { useEffect, useState } from "react";
import { usePref } from "@/components/PrefsProvider";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";

// A "daily-cached SWR" hook for the Frame box. SWR alone deduplicates within
// a session, but a page reload clears its in-memory cache and the box
// re-fetches every time you open it — which made today's art swap, today's
// wiki article reroll, the bird re-pick when the API drifted. This hook
// fixes that by persisting each endpoint's response in synced prefs keyed
// on the LOCAL DATE: once today's response is cached, opening / reopening
// the tab and reloading the page return the same response without a fetch,
// then everything auto-refreshes at local midnight.
//
// Bonus: prefs sync across devices, so once your laptop has today's bird
// your phone shows the same bird.

interface CacheEntry<T> { date: string; data: T }

export function useDailyCached<T>(
  storageKey: string,
  fetchUrl: string | null,
): { data: T | undefined; isLoading: boolean; error: boolean } {
  const [today, setToday] = useState(() => localDateKey());

  // Re-key the cache at local midnight so the boxes self-refresh without
  // the user having to reload. We also recheck on tab focus to catch the
  // case where the tab was hidden across midnight.
  useEffect(() => {
    const tick = () => setToday(localDateKey());
    const t = setTimeout(tick, Math.max(1000, msUntilLocalMidnight()));
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => { clearTimeout(t); window.removeEventListener("focus", onFocus); };
  }, [today]);

  const [entry, setEntry] = usePref<CacheEntry<T> | null>(`hub.daily.${storageKey}`, null);
  const fresh = !!entry && entry.date === today;
  const [loading, setLoading] = useState(!fresh && !!fetchUrl);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!fetchUrl) return;
    if (fresh) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(false);
    fetch(fetchUrl)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((d) => {
        if (cancelled) return;
        // Don't cache obvious failures so we'll retry tomorrow's midnight
        // (or next page load if today's fetch was a transient blip).
        if (d && !d.error) setEntry({ date: today, data: d as T });
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, fetchUrl, fresh]);

  return { data: fresh ? entry!.data : undefined, isLoading: loading, error };
}
