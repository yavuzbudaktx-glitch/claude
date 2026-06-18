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

export function useGrowingLibrary(
  source: string,
  fetchUrl: string,
): { videos: LibVideo[]; count: number; label?: string; url?: string; isLoading: boolean } {
  const prefsLoaded = usePrefsLoaded();
  const [stored, setStored] = usePref<Stored | null>(`hub.lib.${source}.v1`, null);
  const [live, setLive] = useState<Stored | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // CRITICAL: wait until PrefsProvider has finished loading from Supabase
    // before we even consider persisting anything. Without this, the first
    // fetch on a fresh mount would write a small (server-throttled) library
    // into prefs with a "now" timestamp BEFORE the saved 500-video version
    // from Supabase arrives — and because mergePerKey takes the newer
    // timestamp, our small one would win and wipe the big saved one.
    if (!prefsLoaded) return;
    let cancelled = false;
    setLoading(!stored);
    fetch(fetchUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { videos?: LibVideo[]; label?: string; url?: string; error?: string }) => {
        if (cancelled) return;
        const vids = (d?.videos ?? []).slice(0, MAX_STORE);
        if (vids.length > 0) {
          const fresh: Stored = { videos: vids, count: vids.length, at: Date.now(), label: d.label, url: d.url };
          setLive(fresh);
          // Persist ONLY when this fetch is at least as big as what we have —
          // never shrink the saved library.
          setStored((prev) => (!prev || vids.length >= prev.count ? fresh : prev));
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUrl, prefsLoaded]);

  // Serve the LARGER of (live, stored) so a throttled fetch this session never
  // collapses the box below what we've previously cached.
  const best = live && stored ? (live.count >= stored.count ? live : stored) : live ?? stored;
  return {
    videos: best?.videos ?? [],
    count: best?.count ?? 0,
    label: best?.label,
    url: best?.url,
    isLoading: loading && !best,
  };
}
