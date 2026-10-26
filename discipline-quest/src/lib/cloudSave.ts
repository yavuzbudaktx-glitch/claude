"use client";
import type { GameState } from "@/engine/types";

/**
 * Keeps the save in the artifact's own database (claude.ai), in a document private to the viewer.
 * The claude.ai app clears an artifact's localStorage between opens, so that alone isn't enough there.
 * Anywhere else (dev server, the PWA build) `window.claude` is missing and this stays local-only.
 */

interface DocSnap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
}
interface DbNs {
  doc(path: string): DocRef;
}
interface UserNs {
  id(): Promise<string | null>;
}
interface ClaudeHost {
  use(name: "db"): Promise<DbNs | null>;
  use(name: "user"): Promise<UserNs | null>;
}

export type CloudStatus = { mode: "loading" | "cloud" | "local"; savedAt: number | null; error?: string };

const LOCAL_AT = "discipline-quest:savedAt";
/** The doc cap is 256 KiB; trim well before that. */
export const MAX_BYTES = 200_000;

let status: CloudStatus = { mode: "loading", savedAt: null };
const listeners = new Set<() => void>();
const setStatus = (s: CloudStatus) => {
  status = s;
  listeners.forEach((l) => l());
};
export const cloudStatus = () => status;
export const onCloudStatus = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Keep a long-running save under the document size limit: drop the oldest log entries and day records. */
export function trimForCloud(g: GameState): GameState {
  if (JSON.stringify(g).length <= MAX_BYTES) return g;
  const days = Object.keys(g.days).sort();
  const keep = new Set(days.slice(-400));
  const out: GameState = {
    ...g,
    log: g.log.slice(-300),
    days: Object.fromEntries(Object.entries(g.days).filter(([k]) => keep.has(k))),
  };
  if (JSON.stringify(out).length <= MAX_BYTES) return out;
  return { ...out, log: out.log.slice(-60), days: Object.fromEntries(Object.entries(out.days).filter(([k]) => days.slice(-120).includes(k))) };
}

/** Which save to start from: the cloud one unless this device has a newer local write. */
export function pickCloud(cloudAt: number, localAt: number | null) {
  return localAt == null || cloudAt >= localAt;
}

export const localSavedAt = (): number | null => {
  try {
    const v = localStorage.getItem(LOCAL_AT);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
};
const markLocal = (t: number) => {
  try {
    localStorage.setItem(LOCAL_AT, String(t));
  } catch {
    /* storage blocked: the cloud copy still works */
  }
};

let ref: DocRef | null = null;
let lastJson = "";
let pending: GameState | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> | null = null;

async function connect(): Promise<DocRef | null> {
  const host = (globalThis as { claude?: ClaudeHost }).claude;
  if (!host?.use) return null;
  const [db, user] = await Promise.all([host.use("db"), host.use("user")]);
  const id = user ? await user.id() : null;
  if (!db || !id) return null;
  return db.doc(`data/users/${id}/save`);
}

/** Look for a cloud save. Resolves the game to start from (or null to keep the local one). Never rejects. */
export async function loadCloud(): Promise<unknown | null> {
  try {
    ref = await Promise.race([connect(), new Promise<null>((r) => setTimeout(() => r(null), 10_000))]);
    if (!ref) {
      setStatus({ mode: "local", savedAt: localSavedAt() });
      return null;
    }
    const snap = await ref.get();
    const body = snap.exists ? snap.data() : undefined;
    const at = typeof body?.savedAt === "number" ? body.savedAt : 0;
    setStatus({ mode: "cloud", savedAt: body ? at : null });
    if (body?.game && pickCloud(at, localSavedAt())) {
      lastJson = JSON.stringify(body.game);
      return body.game;
    }
    return null;
  } catch {
    ref = null;
    setStatus({ mode: "local", savedAt: localSavedAt(), error: "Couldn't reach your Claude account, saving on this device." });
    return null;
  }
}

async function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!ref || !pending) return;
  if (writing) await writing;
  const g = trimForCloud(pending);
  pending = null;
  const json = JSON.stringify(g);
  if (json === lastJson) return;
  const savedAt = Date.now();
  writing = ref
    .set({ game: JSON.parse(json), savedAt })
    .then(() => {
      lastJson = json;
      setStatus({ mode: "cloud", savedAt });
    })
    .catch(() => {
      setStatus({ ...status, error: "Last save didn't reach your Claude account. It will retry." });
      if (!pending) pending = g;
      timer = setTimeout(flush, 15_000);
    })
    .finally(() => {
      writing = null;
    });
  await writing;
}

/** Called on every game change once loading is done. */
export function saveGame(g: GameState) {
  markLocal(Date.now());
  if (!ref) return;
  pending = g;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void flush());
  window.addEventListener("pagehide", () => void flush());
}
