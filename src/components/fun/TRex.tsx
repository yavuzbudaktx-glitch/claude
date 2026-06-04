"use client";

// The real Chrome dino, served from Wayou's canonical standalone port (a
// blank page with nothing on it but the game). The iframe is scaled up and
// vertically re-centered so the play area fills the box without showing the
// "Press space to play" hint above the canvas. Click to focus, Space / ↑ to
// jump, ↓ to duck.

export function TRex() {
  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0">
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span>T-Rex run</span>
        <span className="text-muted-2">click, then Space / ↑ to jump</span>
      </div>
      <div className="relative flex-1 min-h-0 rounded-2xl border border-[var(--rule)] bg-[var(--rule-soft)] overflow-hidden">
        <iframe
          src="https://wayou.github.io/t-rex-runner/"
          title="T-Rex Runner"
          className="absolute"
          // The standalone port centers the canvas vertically in a full-height
          // body. Scaling it up + pulling it slightly down crops the empty
          // sky and parks the dino's feet on the bottom of our card.
          style={{
            top: "-8%", left: "-10%",
            width: "120%", height: "120%",
            transformOrigin: "center center",
          }}
          loading="lazy"
          scrolling="no"
          allow="autoplay; fullscreen"
        />
      </div>
    </div>
  );
}
