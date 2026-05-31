"use client";

import { useEffect } from "react";

// Lightweight command bus so the global command palette can drive actions
// that live inside individual widgets (switch a news tab, add a ticker,
// open focus mode, …) without threading props through the whole tree.

export type AppCommand =
  | { kind: "news-tab"; value: string }
  | { kind: "watchlist-add"; value: string }
  | { kind: "focus" }
  | { kind: "scratchpad" }
  | { kind: "hub"; value?: string };

const EVT = "morning:command";

export function emitCommand(c: AppCommand) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AppCommand>(EVT, { detail: c }));
  }
}

export function useCommand(handler: (c: AppCommand) => void) {
  useEffect(() => {
    const fn = (e: Event) => handler((e as CustomEvent<AppCommand>).detail);
    window.addEventListener(EVT, fn);
    return () => window.removeEventListener(EVT, fn);
  }, [handler]);
}

export function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
