"use client";

// The real Chrome dino, embedded from the user's chosen host (trex-runner.com)
// so it plays and behaves exactly like the offline game. The iframe fills the
// whole box. Click it once to give it keyboard focus, then Space / ↑ to jump.

export function TRex() {
  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0">
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-muted shrink-0">
        <span>T-Rex run</span>
        <span className="text-muted-2">click, then Space / ↑ to jump</span>
      </div>
      <div className="relative flex-1 min-h-0 rounded-2xl border border-[var(--rule)] bg-[var(--rule-soft)] overflow-hidden">
        <iframe
          src="https://trex-runner.com/"
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
