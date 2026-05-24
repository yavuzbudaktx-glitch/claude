"use client";

import { Timer } from "lucide-react";
import { emitCommand } from "@/lib/commands";

export function FocusButton() {
  return (
    <button
      onClick={() => emitCommand({ kind: "focus" })}
      className="btn-ghost"
      aria-label="Focus mode"
      title="Focus mode"
    >
      <Timer className="h-4 w-4" />
    </button>
  );
}
