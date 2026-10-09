"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createInitialState, ensureToday } from "@/engine/engine";
import type { GameState } from "@/engine/types";
import { getNow } from "@/lib/clock";

export type RoomActionKind = "pray" | "wake" | "diet" | "cheat" | "urge" | "relapse" | "buy" | "habit" | "late";

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
  replace: (g: GameState) => void;
  reset: () => void;
}

export const useGame = create<Store>()(
  persist(
    (set, get) => ({
      game: createInitialState(getNow()),
      lastAction: null,
      act(fn, action) {
        const now = getNow();
        const before = ensureToday(get().game, now);
        const next = fn(before, now);
        set({
          game: next,
          ...(action && next !== before ? { lastAction: { ...action, nonce: now.getTime() + Math.random() } } : {}),
        });
      },
      tick() {
        const g = ensureToday(get().game, getNow());
        if (g !== get().game) set({ game: g });
      },
      replace(g) {
        set({ game: ensureToday(g, getNow()) });
      },
      reset() {
        set({ game: createInitialState(getNow()), lastAction: null });
      },
    }),
    {
      name: "discipline-quest",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ game: s.game }),
    },
  ),
);
