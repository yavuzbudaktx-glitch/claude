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

type Prefs = Record<string, unknown>;
const KEY = "morning.prefs.v1";

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
  // Create the Supabase client lazily, client-side only, so this provider
  // (which wraps every page) never instantiates it during SSR/prerender.
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  const sb = () => (sbRef.current ??= createClient());

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
          // Remote wins, but keep any local-only keys.
          setPrefs({ ...local, ...(data.prefs as Prefs) });
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

  const setPref = useCallback((k: string, v: unknown) => {
    setPrefs((p) => ({ ...p, [k]: v }));
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
