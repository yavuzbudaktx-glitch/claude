"use client";

import { ExternalLink } from "lucide-react";

// Lichess's puzzle embed — a fresh puzzle, no auth, no API key.
// Loads in an iframe so we don't have to ship a chess engine in the bundle.
export function ChessPuzzle() {
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-[var(--rule)] bg-[var(--rule-soft)]">
        <iframe
          src="https://lichess.org/training/frame?theme=auto&bg=transparent"
          title="Daily chess puzzle"
          className="absolute inset-0 h-full w-full"
          style={{ colorScheme: "auto" }}
        />
      </div>
      <a
        href="https://lichess.org/training"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent transition self-end"
      >
        Open on Lichess <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
