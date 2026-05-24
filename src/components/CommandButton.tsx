"use client";

import { Command } from "lucide-react";

export function CommandButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("morning:open-palette"))}
      className="btn-ghost"
      aria-label="Command palette"
      title="Command palette — ⌘K"
    >
      <Command className="h-4 w-4" />
    </button>
  );
}
