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

// One per-user JSON blob (city, tracked team, applications, habits, goals,
// scratchpad, …) that syncs across devices. The hard problem this solves is
// DATA LOSS: the old version did last-write-wins on the WHOLE blob, so a
// device holding a stale copy would silently wipe everything another device
// had added the moment you changed one unrelated thing (this is how the
// tracked applications disappeared).
//
// The fix is PER-KEY versioning + READ-MERGE-WRITE:
//   • every key carries its own version timestamp in a hidden `__meta` map.
//   • merging two blobs keeps, for each key, whichever side's version is
//     newer — so edits to different keys on different devices both survive,
//     and the same key resolves to the most recent edit.
//   • every write first RE-READS the current cloud row and merges the local
//     edits on top, so a write can never overwrite a key this device didn't
//     just touch.
//   • a Realtime subscription pushes other devices' changes in live.
// Net effect: no edit on any device can destroy an edit on another.

type Prefs = Record<string, unknown> & { __meta?: Record<string, number> };
const KEY = "morning.prefs.v1";
const META = "__meta";

function metaOf(p: Prefs): Record<string, number> {
  const m = p[META];
  return (m && typeof m === "object") ? (m as Record<string, number>) : {};
}

// Merge `incoming` onto `base`, keeping the newer value per key. Returns the
// SAME reference as `base` when nothing changed (so React/effects can bail
// and we never loop). Keys never seen before are treated as version 0.
function mergePerKey(base: Prefs, incoming: Prefs): Prefs {
  const baseMeta = metaOf(base);
  const incMeta = metaOf(incoming);
  let changed = false;
  const out: Prefs = { ...base };
  const outMeta: Record<string, number> = { ...baseMeta };

  for (const k of Object.keys(incoming)) {
    if (k === META) continue;
    const bv = baseMeta[k] ?? 0;
    const iv = incMeta[k] ?? 0;
    // Take incoming when it's at least as new AND actually different.
    if (iv >= bv) {
      const same = JSON.stringify(base[k]) === JSON.stringify(incoming[k]);
      if (!same || iv > bv) {
        if (!same) { out[k] = incoming[k]; changed = true; }
        if (iv > (outMeta[k] ?? 0)) { outMeta[k] = iv; changed = true; }
      }
    }
  }
  // Carry across any meta entries newer than what we have (covers keys that
  // exist in base but got a fresher version stamp from incoming).
  for (const k of Object.keys(incMeta)) {
    if ((incMeta[k] ?? 0) > (outMeta[k] ?? 0)) { outMeta[k] = incMeta[k]; changed = true; }
  }

  if (!changed) return base;
  out[META] = outMeta;
  return out;
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
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  const sb = () => (sbRef.current ??= createClient());
  const writing = useRef(false);

  // READ-MERGE-WRITE: re-read the cloud row, merge our local edits on top
  // (per key), persist the merged result, and adopt it locally. This is the
  // operation that makes concurrent multi-device editing safe.
  const persist = useCallback(async () => {
    const uid = userId.current;
    if (!uid || !hydrated.current || writing.current) return;
    writing.current = true;
    try {
      const local = prefsRef.current;
      // 1) read the latest remote
      let remote: Prefs = {};
      const { data, error } = await sb()
        .from("user_settings").select("prefs").eq("user_id", uid).maybeSingle();
      if (error) console.warn("PrefsProvider: read-before-write failed:", error.message);
      if (data?.prefs && typeof data.prefs === "object") remote = data.prefs as Prefs;
      // 2) merge local edits on top of remote (local wins per key when newer)
      const merged = mergePerKey(remote, local);
      // 3) write the merged blob
      const { error: upErr } = await sb()
        .from("user_settings")
        .upsert({ user_id: uid, prefs: merged }, { onConflict: "user_id" });
      if (upErr) console.warn("PrefsProvider: sync write failed:", upErr.message);
      try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch {}
      // 4) adopt merged locally (brings in other devices' keys). mergePerKey
      //    returns the same ref when nothing's new, so this can't loop.
      setPrefs((cur) => mergePerKey(cur, merged));
    } finally {
      writing.current = false;
    }
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
          .from("user_settings").select("prefs").eq("user_id", uid).maybeSingle();
        if (!cancelled) {
          if (error) console.warn("PrefsProvider: initial load failed:", error.message);
          if (!error && data?.prefs && typeof data.prefs === "object") {
            setPrefs((cur) => mergePerKey(cur, data.prefs as Prefs));
          }
        }
      }
      hydrated.current = true;
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // -- Realtime: other devices' writes arrive here and merge in live -------
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
          if (remote && typeof remote === "object") {
            setPrefs((cur) => mergePerKey(cur, remote));
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loaded]);

  // -- Persist on change (debounced) ---------------------------------------
  useEffect(() => {
    if (!hydrated.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
    if (!userId.current) return;
    const t = setTimeout(() => { void persist(); }, 250);
    return () => clearTimeout(t);
  }, [prefs, persist]);

  // Force-flush on tab hide / unload.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") void persist(); };
    const onPageHide = () => { void persist(); };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [persist]);

  const setPref = useCallback((k: string, v: unknown) => {
    setPrefs((p) => {
      const meta = { ...metaOf(p), [k]: Date.now() };
      return { ...p, [k]: v, [META]: meta };
    });
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
