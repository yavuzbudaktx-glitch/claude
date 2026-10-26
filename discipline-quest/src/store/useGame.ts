"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createInitialState, dismissInbox, ensureToday, equip, markSeen, migrate, moveToSpace, placeItem, placeWall, storeItem, storeWall, updateSettings } from "@/engine/engine";
import type { GameState, ItemId, PlacedItem, Space, WallPlaced } from "@/engine/types";
import { getNow } from "@/lib/clock";
import { SFX } from "@/lib/sound";

export type RoomActionKind = "pray" | "wake" | "diet" | "cheat" | "urge" | "relapse" | "buy" | "habit" | "late" | "equip" | "gym" | "quran" | "bed";

export interface RoomAction {
  kind: RoomActionKind;
  say: string;
  nonce: number;
}

interface Store {
  game: GameState;
  lastAction: RoomAction | null;
  /** Run an engine function against the current clock. Optionally animate the avatar. */
  act: (fn: (s: GameState, now: Date) => GameState, action?: Omit<RoomAction, "nonce">) => void;
  tick: () => void;
  replace: (g: unknown) => void;
  reset: () => void;
  equip: (id: ItemId, say?: string) => void;
  markSeen: (ids: ItemId[]) => void;
  dismiss: () => void;
  place: (p: PlacedItem) => void;
  store: (id: ItemId) => void;
  placeWall: (w: WallPlaced) => void;
  storeWall: (id: ItemId) => void;
  moveToSpace: (id: ItemId, space: Space) => void;
  toggleLights: () => void;
}

const GOOD: RoomActionKind[] = ["pray", "wake", "diet", "urge", "buy", "habit", "equip", "gym", "quran", "bed"];

export const useGame = create<Store>()(
  persist(
    (set, get) => ({
      game: createInitialState(getNow()),
      lastAction: null,
      act(fn, action) {
        const now = getNow();
        const before = ensureToday(get().game, now);
        const next = fn(before, now);
        if (next === before) return;
        if (next.settings.sound && action) {
          const fresh = next.inbox.slice(before.inbox.length);
          if (fresh.some((e) => e.kind === "level")) SFX.levelUp();
          else if (fresh.length) SFX.badge();
          else if (action.kind === "pray") SFX.prayer();
          else if (GOOD.includes(action.kind)) SFX.good();
          else SFX.bad();
        }
        set({ game: next, ...(action ? { lastAction: { ...action, nonce: now.getTime() + Math.random() } } : {}) });
      },
      tick() {
        const g = ensureToday(get().game, getNow());
        if (g !== get().game) set({ game: g });
      },
      replace(g) {
        set({ game: migrate(g, getNow()) });
      },
      reset() {
        set({ game: createInitialState(getNow()), lastAction: null });
      },
      equip(id, say) {
        const next = equip(get().game, id);
        if (next === get().game) return;
        if (next.settings.sound) SFX.tap();
        set({ game: next, ...(say ? { lastAction: { kind: "equip", say, nonce: Date.now() + Math.random() } } : {}) });
      },
      markSeen(ids) {
        const next = markSeen(get().game, ids);
        if (next !== get().game) set({ game: next });
      },
      dismiss() {
        set({ game: dismissInbox(get().game) });
      },
      place(p) {
        const next = placeItem(get().game, p);
        if (next === get().game) return;
        if (next.settings.sound) SFX.tap();
        set({ game: next });
      },
      store(id) {
        set({ game: storeItem(get().game, id) });
      },
      placeWall(w) {
        const next = placeWall(get().game, w);
        if (next === get().game) return;
        if (next.settings.sound) SFX.tap();
        set({ game: next });
      },
      storeWall(id) {
        set({ game: storeWall(get().game, id) });
      },
      moveToSpace(id, space) {
        const next = moveToSpace(get().game, id, space);
        if (next !== get().game) set({ game: next });
      },
      toggleLights() {
        const g = get().game;
        if (g.settings.sound) SFX.tap();
        set({ game: updateSettings(g, { lights: !g.settings.lights }) });
      },
    }),
    {
      name: "discipline-quest",
      version: 5,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ game: s.game }),
      migrate: (persisted) => {
        const p = persisted as { game?: unknown };
        return { game: p?.game ? migrate(p.game, getNow()) : createInitialState(getNow()) } as Store;
      },
      merge: (persisted, current) => {
        const p = persisted as { game?: GameState } | undefined;
        if (!p?.game) return current;
        // Saves written by v1 code without the persist version bump still need upgrading.
        return { ...current, game: (p.game as { version: number }).version === 5 ? p.game : migrate(p.game, getNow()) };
      },
    },
  ),
);
