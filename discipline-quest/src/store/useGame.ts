"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createInitialState, dismissInbox, ensureToday, equip, markSeen, migrate } from "@/engine/engine";
import type { GameState, ItemId } from "@/engine/types";
import { getNow } from "@/lib/clock";
import { SFX } from "@/lib/sound";

export type RoomActionKind = "pray" | "wake" | "diet" | "cheat" | "urge" | "relapse" | "buy" | "habit" | "late" | "equip";

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
}

const GOOD: RoomActionKind[] = ["pray", "wake", "diet", "urge", "buy", "habit", "equip"];

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
          if (next.inbox.length > before.inbox.length) SFX.badge();
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
    }),
    {
      name: "discipline-quest",
      version: 2,
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
        return { ...current, game: p.game.version === 2 ? p.game : migrate(p.game, getNow()) };
      },
    },
  ),
);
