"use client";

// The real Chrome dino, served from Wayou's canonical standalone port — a
// blank page with nothing on it but the game (GitHub Pages doesn't block
// framing). The iframe simply fills the box; the game centers its own canvas.
// Click once to give it focus, then Space / ↑ to jump, ↓ to duck.

export function TRex() {
  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0">
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span>T-Rex run</span>
        <span className="text-muted-2">click, then Space / ↑ to jump</span>
      </div>
      <div className="relative flex-1 min-h-0 rounded-2xl border border-[var(--rule)] bg-white overflow-hidden">
        <iframe
          src="https://wayou.github.io/t-rex-runner/"
          title="T-Rex Runner"
          className="absolute inset-0 h-full w-full"
          loading="lazy"
          scrolling="no"
          allow="autoplay; fullscreen"
        />
      </div>
    </div>
  );
}
