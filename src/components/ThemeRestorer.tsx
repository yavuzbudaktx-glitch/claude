"use client";

import { useEffect, useRef } from "react";
import { usePref, usePrefsLoaded } from "@/components/PrefsProvider";
import { applyThemeDom, getTheme, setThemeLocal, isThemeId, type ThemeId } from "@/lib/theme";

// The theme now SYNCS ACROSS DEVICES.
//
// It used to live only in localStorage, which is why picking a theme on the
// laptop never reached the phone. It now rides the same per-key versioned
// prefs blob as everything else (see PrefsProvider): each key carries its own
// version stamp and every write re-reads and merges, so a stale device can't
// clobber a newer choice, and a Realtime subscription pushes the change live.
//
// localStorage is still written, but only as a PAINT CACHE: the inline boot
// script in <head> reads it to set the theme class before first paint, which
// is what stops the flash of the default theme. The cloud value is the source
// of truth and overwrites the cache whenever the two disagree.
export function ThemeRestorer() {
  const loaded = usePrefsLoaded();
  const [remote] = usePref<ThemeId | "">("theme", "");
  // Belt-and-suspenders for the class itself: the boot script sets it before
  // paint, but anything that re-renders <html>'s attributes during hydration
  // can strip it, so re-apply the cached value once on mount.
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    applyThemeDom(getTheme());
  }, []);

  useEffect(() => {
    // Wait for the blob to arrive — before that `remote` is just the fallback
    // and would look like "no theme chosen", which must not clear a local pick.
    if (!loaded) return;
    if (!isThemeId(remote)) return;
    if (remote === getTheme()) return;
    applyThemeDom(remote);
    setThemeLocal(remote);
  }, [loaded, remote]);

  return null;
}
