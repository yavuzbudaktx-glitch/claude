"use client";

import { useState } from "react";
import { ExternalLink, RotateCcw, Crown } from "lucide-react";

// Lichess's puzzle iframe. We tightly bound its size and re-mount it on
// "refresh" so you get a fresh puzzle without leaving the page. Iframe is
// centered inside a 1:1 frame so it looks intentional rather than skewed.
export function ChessPuzzle() {
  const [n, setN] = useState(0);
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-muted-2 shrink-0">
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Crown className="h-3 w-3" /> Daily puzzle · Lichess
        </span>
        <button
          onClick={() => setN((x) => x + 1)}
          className="inline-flex items-center gap-1 hover:text-accent transition"
          title="New puzzle"
        >
          <RotateCcw className="h-3 w-3" /> new
        </button>
      </div>

      <div className="relative flex-1 min-h-0 grid place-items-center">
        <div className="relative w-full max-w-[360px] aspect-square rounded-xl overflow-hidden border border-[var(--rule)] bg-[var(--rule-soft)]">
          <iframe
            key={n}
            src="https://lichess.org/training/frame?theme=brown&bg=light"
            title="Daily chess puzzle"
            className="absolute inset-0 h-full w-full"
            scrolling="no"
          />
        </div>
      </div>

      <a
        href="https://lichess.org/training"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent transition self-center shrink-0"
      >
        Open on Lichess <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
