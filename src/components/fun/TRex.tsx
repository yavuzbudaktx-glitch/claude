"use client";

// The real Chrome dino, served from Wayou's canonical standalone port — a
// blank page with nothing on it but the game. The iframe ships a hard white
// background that fights every theme; rather than darkening the card to
// match, we BLEND the iframe against the card so the white disappears.
//
// `mix-blend-mode: multiply` is the trick: multiplied with anything, pure
// white becomes that thing, while the near-black dino sprites stay near-
// black. In dark mode we add `filter: invert(1) hue-rotate(180deg)` first,
// which flips the page's grayscale (white→black, dino→white) before
// multiplying — the result is a bright dino on the dark theme.
// Click once to give it focus, then Space / ↑ to jump, ↓ to duck.

export function TRex() {
  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0">
      <div className="text-center text-[10.5px] font-mono uppercase tracking-wider text-muted-2 shrink-0">
        click, then Space / ↑ to jump · ↓ to duck
      </div>
      <div className="trex-frame relative flex-1 min-h-0 rounded-2xl border border-[var(--rule)] overflow-hidden">
        <iframe
          src="https://wayou.github.io/t-rex-runner/"
          title="T-Rex Runner"
          className="trex-iframe absolute inset-0 h-full w-full"
          loading="lazy"
          scrolling="no"
          allow="autoplay; fullscreen"
        />
      </div>
    </div>
  );
}
