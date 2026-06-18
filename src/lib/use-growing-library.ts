"use client";

import { useEffect, useState } from "react";
import { usePref, usePrefsLoaded } from "@/components/PrefsProvider";

// A library that only ever GROWS. The "long view" boxes pull a channel's whole
// catalogue from a serverless route, but that route's in-memory cache dies on
// every cold start — so after midnight a fresh (throttled) function instance
// would hand back a truncated list and the box would shrink to a handful of
// videos. The real fix is to keep the biggest library we've EVER seen in the
// user's synced prefs and never trade down to a smaller one. Once any session
// (on any device) loads the full 500-strong Country Life library, it sticks
// everywhere, through cold starts, midnight, and throttling.

export interface LibVideo {
  id: string;
  title: string;
  thumb?: string;
  channel?: string;
  channelLabel?: string;
  channelUrl?: string;
}

interface Stored {
  videos: LibVideo[];
  count: number;
  at: number;
  label?: string;
  url?: string;
}

// Cap what we persist so the synced prefs blob stays sane even for very large
// channels. 2500 is far above every box's minimum.
const MAX_STORE = 2500;

// Merge two video lists by id, preserving order (a first, then b's new ones).
function unionById(a: LibVideo[], b: LibVideo[]): LibVideo[] {
  const seen = new Set<string>();
  const out: LibVideo[] = [];
  for (const v of [...a, ...b]) {
    if (v?.id && !seen.has(v.id)) { seen.add(v.id); out.push(v); }
  }
  return out;
}

export function useGrowingLibrary(
  source: string,
  fetchUrl: string,
): { videos: LibVideo[]; count: number; label?: string; url?: string; isLoading: boolean } {
  const prefsLoaded = usePrefsLoaded();
  const [stored, setStored] = usePref<Stored | null>(`hub.lib.${source}.v1`, null);
  // `live` is tagged with the source it belongs to so a slow/empty fetch on a
  // newly-selected tab can NEVER show the previous tab's videos (that was the
  // "all tabs show Country Life" bug — the failed Bob Ross fetch left the old
  // Country Life `live` on screen).
  const [live, setLive] = useState<{ source: string; data: Stored } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait until PrefsProvider has finished loading from Supabase before we
    // persist anything, or a small cold-start fetch would overwrite the big
    // saved library with a newer timestamp and win the per-key merge.
    if (!prefsLoaded) return;
    let cancelled = false;
    // Drop any stale `live` from the previously-selected source immediately,
    // so during the switch we fall back to THIS source's `stored` (or the
    // loading state), never the other channel's videos.
    setLive(null);
    setLoading(!stored);
    fetch(fetchUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { videos?: LibVideo[]; label?: string; url?: string; error?: string }) => {
        if (cancelled) return;
        const vids = (d?.videos ?? []).slice(0, MAX_STORE);
        if (vids.length > 0) {
          // UNION with what we already have so the library only ever grows
          // toward the full catalogue, even if a given day's walk is partial.
          setStored((prev) => {
            const merged = unionById(prev?.videos ?? [], vids).slice(0, MAX_STORE);
            const fresh: Stored = { videos: merged, count: merged.length, at: Date.now(), label: d.label, url: d.url };
            setLive({ source, data: fresh });
            return fresh;
          });
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUrl, prefsLoaded]);

  // Use live only when it's for THIS source; otherwise fall back to stored.
  const liveData = live && live.source === source ? live.data : null;
  const best =
    liveData && stored
      ? (liveData.count >= stored.count ? liveData : stored)
      : liveData ?? stored;
  return {
    videos: best?.videos ?? [],
    count: best?.count ?? 0,
    label: best?.label,
    url: best?.url,
    isLoading: loading && !best,
  };
}
