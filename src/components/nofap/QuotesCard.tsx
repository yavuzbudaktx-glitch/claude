"use client";

import { useEffect, useState } from "react";
import { Shuffle } from "lucide-react";
import { QUOTES } from "@/lib/nofap";

// Rotating quotations from real people, with attribution. The index starts
// random on mount (never during SSR, so hydration stays deterministic) and
// advances sequentially every 20s; the shuffle button jumps straight to a
// different quote — never the one already on screen.
export function QuotesCard() {
  const [idx, setIdx] = useState<number | null>(null);

  useEffect(() => {
    setIdx(Math.floor(Math.random() * QUOTES.length));
    const t = setInterval(() => setIdx((i) => ((i ?? 0) + 1) % QUOTES.length), 20000);
    return () => clearInterval(t);
  }, []);

  // Draw from the len-1 quotes that aren't the current one, then shift past it,
  // so every shuffle is guaranteed to change the quote.
  const shuffle = () =>
    setIdx((i) => {
      if (i === null || QUOTES.length < 2) return Math.floor(Math.random() * QUOTES.length);
      const n = Math.floor(Math.random() * (QUOTES.length - 1));
      return n >= i ? n + 1 : n;
    });

  if (idx === null) return <div className="min-h-[120px]" />;
  const q = QUOTES[idx];

  // Long quotes step down a size or two so 2–3 lines still fit the card.
  const size =
    q.text.length > 150
      ? "text-base md:text-lg"
      : q.text.length > 90
        ? "text-lg md:text-xl"
        : "text-xl md:text-2xl";

  return (
    <div className="min-h-[120px] flex flex-col justify-center gap-3 py-2">
      <blockquote key={idx} className="animate-fadeIn min-w-0">
        <p className={`font-display ${size} text-ink leading-snug break-words hyphens-auto`}>
          “{q.text}”
        </p>
        <footer className="mt-2 text-sm text-muted break-words">— {q.author}</footer>
      </blockquote>
      <div className="flex items-center justify-between gap-2">
        <span className="label">{q.lang === "tr" ? "TR" : "EN"} · {idx + 1}/{QUOTES.length}</span>
        <button
          onClick={shuffle}
          className="btn-ghost !px-2 shrink-0"
          title="Another one"
          aria-label="Show another quote"
        >
          <Shuffle className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
