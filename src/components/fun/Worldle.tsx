"use client";

import { ExternalLink, Globe2 } from "lucide-react";

// Worldle (teuteuf) — the daily geography guessing game with maps and
// directional hints. Embedded straight from worldle.teuteuf.fr so it's always
// the current daily puzzle and resets at midnight UTC on its own. If their
// frame-ancestors policy ever blocks framing, the panel surfaces a clear
// "open Worldle" link instead of going blank.

export function Worldle() {
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-muted-2 shrink-0">
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Globe2 className="h-3 w-3" /> Worldle · teuteuf.fr
        </span>
        <a
          href="https://worldle.teuteuf.fr/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-accent transition"
          title="Open in a new tab"
        >
          open <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-[var(--rule)] bg-white">
        <iframe
          src="https://worldle.teuteuf.fr/"
          title="Worldle — daily geography game"
          className="absolute inset-0 h-full w-full"
          loading="lazy"
          allow="autoplay; fullscreen; clipboard-write"
        />
      </div>
    </div>
  );
}
