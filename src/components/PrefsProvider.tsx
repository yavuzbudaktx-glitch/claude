"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

// One per-user JSON blob (city, tracked team, hidden events, saved news,
// scratchpad, habits, …) that syncs across devices. The provider is the
// single writer, so independent widgets never clobber each other's keys.
// localStorage is the instant/offline cache; Supabase user_settings.prefs
// is the cross-device source of truth.
//
// Conflict handling: every write bumps a monotonic `_v` timestamp. On load
// we compare the local cache's `_v` to the cloud row's `_v` and let the
// NEWER one win — so opening a stale device (or a slow cloud read) can never
// roll your latest edits back to an empty/old state. We also flush
// immediately on tab-hide / pagehide so a quick navigation never drops an
// in-flight (debounced) save.

type Prefs = Record<string, unknown>;
const KEY = "morning.prefs.v1";
const VER = "_v";

function versionOf(p: Prefs): number {
  const v = p[VER];
  return typeof v === "number" ? v : 0;
}
// Merge two prefs blobs, letting the newer one win on key conflicts while
// preserving keys that exist only in the older one.
function mergeByVersion(a: Prefs, b: Prefs): Prefs {
  return versionOf(b) >= versionOf(a) ? { ...a, ...b } : { ...b, ...a };
}

interface Ctx {
  prefs: Prefs;
  setPref: (k: string, v: unknown) => void;
  loaded: boolean;
}
const PrefsContext = createContext<Ctx>({ prefs: {}, setPref: () => {}, loaded: false });

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>({});
  const [loaded, setLoaded] = useState(false);
  const userId = useRef<string | null>(null);
  const hydrated = useRef(false);
  // Always-current snapshot of prefs for the flush handlers (which run
  // outside React's render cycle).
  const prefsRef = useRef<Prefs>(prefs);
  prefsRef.current = prefs;
  // Create the Supabase client lazily, client-side only, so this provider
  // (which wraps every page) never instantiates it during SSR/prerender.
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  const sb = () => (sbRef.current ??= createClient());

  const flush = useCallback(() => {
    const uid = userId.current;
    if (!uid || !hydrated.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(prefsRef.current)); } catch {}
    sb()
      .from("user_settings")
      .upsert({ user_id: uid, prefs: prefsRef.current }, { onConflict: "user_id" })
      .then(() => {}, () => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = sb();

    let local: Prefs = {};
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) local = JSON.parse(raw) as Prefs;
    } catch {
      local = {};
    }
    setPrefs(local); // instant paint from cache

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      userId.current = uid;
      if (uid) {
        const { data, error } = await supabase
          .from("user_settings")
          .select("prefs")
          .eq("user_id", uid)
          .maybeSingle();
        if (!cancelled && !error && data?.prefs && typeof data.prefs === "object") {
          const remote = data.prefs as Prefs;
          // Newer-wins merge against whatever's currently in state (which may
          // already include edits the user made while this request was in
          // flight) — never blindly clobber with a stale cloud row.
          setPrefs((cur) => mergeByVersion(cur, remote));
        }
      }
      hydrated.current = true;
      setLoaded(true);
    })();

    return () => { cancelled = true; };
  }, []);

  // Persist: localStorage immediately, debounced Supabase upsert.
  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
    const uid = userId.current;
    if (!uid) return;
    const t = setTimeout(() => {
      sb()
        .from("user_settings")
        .upsert({ user_id: uid, prefs }, { onConflict: "user_id" })
        .then(() => {}, () => {});
    }, 600);
    return () => clearTimeout(t);
  }, [prefs]);

  // Belt-and-suspenders: flush the moment the tab is hidden or unloaded, so a
  // fast navigation away (e.g. accounting → dashboard) never loses the
  // last <600ms of edits.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  const setPref = useCallback((k: string, v: unknown) => {
    setPrefs((p) => ({ ...p, [k]: v, [VER]: Date.now() }));
  }, []);

  return (
    <PrefsContext.Provider value={{ prefs, setPref, loaded }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const { prefs, setPref } = useContext(PrefsContext);
  const value = (prefs[key] === undefined ? fallback : (prefs[key] as T));
  const set = useCallback((v: T) => setPref(key, v), [key, setPref]);
  return [value, set];
}

// True once the cross-device prefs blob has finished hydrating from Supabase.
// Effects that *write* derived data (e.g. monthly net-worth snapshots) should
// gate on this so they don't record values built from the empty fallback.
export function usePrefsLoaded(): boolean {
  return useContext(PrefsContext).loaded;
}
