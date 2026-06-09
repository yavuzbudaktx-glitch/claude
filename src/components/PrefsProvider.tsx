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
// scratchpad, habits, …) that syncs across devices in NEAR-REAL-TIME via a
// Supabase Realtime subscription. localStorage is the instant/offline cache;
// the user_settings.prefs row in Supabase is the cross-device source of truth.
//
// Conflict handling: every write bumps a monotonic `_v` timestamp. On load
// AND on every realtime change, we compare versions and let the newer blob
// win, while preserving keys present only in the older one.
//
// Failure visibility: writes used to swallow errors silently — if RLS or a
// dropped network call blocked a write, the user could see "saves locally
// but not on my other devices" forever with no signal. The route now warns
// in the console (PrefsProvider: sync failed: …) so this is debuggable.

type Prefs = Record<string, unknown>;
const KEY = "morning.prefs.v1";
const VER = "_v";

function versionOf(p: Prefs): number {
  const v = p[VER];
  return typeof v === "number" ? v : 0;
}
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
  const prefsRef = useRef<Prefs>(prefs);
  prefsRef.current = prefs;
  // Tracks the last `_v` we ourselves wrote — used to ignore realtime
  // echoes of our own write coming back to us (Supabase will broadcast it).
  const lastOwnV = useRef<number>(0);
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  const sb = () => (sbRef.current ??= createClient());

  const flush = useCallback(() => {
    const uid = userId.current;
    if (!uid || !hydrated.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(prefsRef.current)); } catch {}
    sb()
      .from("user_settings")
      .upsert({ user_id: uid, prefs: prefsRef.current }, { onConflict: "user_id" })
      .then(
        ({ error }) => { if (error) console.warn("PrefsProvider: sync failed:", error.message); },
        (err) => console.warn("PrefsProvider: sync failed:", err),
      );
  }, []);

  // -- Initial load ----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const supabase = sb();

    let local: Prefs = {};
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) local = JSON.parse(raw) as Prefs;
    } catch { local = {}; }
    setPrefs(local);

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
        if (!cancelled) {
          if (error) console.warn("PrefsProvider: initial load failed:", error.message);
          if (!error && data?.prefs && typeof data.prefs === "object") {
            const remote = data.prefs as Prefs;
            setPrefs((cur) => mergeByVersion(cur, remote));
          }
        }
      }
      hydrated.current = true;
      setLoaded(true);
    })();

    return () => { cancelled = true; };
  }, []);

  // -- Realtime: subscribe to changes on OUR user_settings row -------------
  // This is the actual cross-device sync. When Device A writes, Supabase
  // pushes the new row to Device B over its websocket and we merge it in.
  useEffect(() => {
    if (!loaded) return;
    const uid = userId.current;
    if (!uid) return;
    const supabase = sb();
    const ch = supabase
      .channel(`user_settings:${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_settings", filter: `user_id=eq.${uid}` },
        (payload: { new?: { prefs?: Prefs } }) => {
          const remote = payload.new?.prefs;
          if (!remote || typeof remote !== "object") return;
          const remoteV = versionOf(remote);
          // Drop echoes of our own writes (Supabase sends them back too).
          if (remoteV === lastOwnV.current) return;
          setPrefs((cur) => mergeByVersion(cur, remote));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loaded]);

  // -- Persist: localStorage immediate, debounced Supabase upsert ----------
  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
    const uid = userId.current;
    if (!uid) return;
    // 200ms debounce — fast enough that a rapid sequence of toggles still
    // lands as ONE write, slow enough that you can't accidentally lose an
    // edit by navigating away. Pagehide also force-flushes (below).
    const t = setTimeout(() => {
      lastOwnV.current = versionOf(prefs);
      sb()
        .from("user_settings")
        .upsert({ user_id: uid, prefs }, { onConflict: "user_id" })
        .then(
          ({ error }) => { if (error) console.warn("PrefsProvider: sync failed:", error.message); },
          (err) => console.warn("PrefsProvider: sync failed:", err),
        );
    }, 200);
    return () => clearTimeout(t);
  }, [prefs]);

  // Force-flush on tab hide / unload so a fast nav can never drop in-flight writes.
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

export function usePref<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const { prefs, setPref } = useContext(PrefsContext);
  const value = (prefs[key] === undefined ? fallback : (prefs[key] as T));
  const ref = useRef(value); ref.current = value;
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      const next = typeof v === "function" ? (v as (prev: T) => T)(ref.current) : v;
      setPref(key, next);
    },
    [key, setPref],
  );
  return [value, set];
}

export function usePrefsLoaded(): boolean {
  return useContext(PrefsContext).loaded;
}
