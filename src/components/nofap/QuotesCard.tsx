"use client";

import { useEffect, useState } from "react";
import { Shuffle } from "lucide-react";
import { QUOTES } from "@/lib/nofap";

// Rotating brutal one-liners. Index starts random on mount (not during SSR,
// to keep hydration deterministic) and advances every 20s; the shuffle
// button jumps to a different random quote immediately.
export function QuotesCard() {
  const [idx, setIdx] = useState<number | null>(null);

  useEffect(() => {
    setIdx(Math.floor(Math.random() * QUOTES.length));
    const t = setInterval(() => setIdx((i) => ((i ?? 0) + 1) % QUOTES.length), 20000);
    return () => clearInterval(t);
  }, []);

  const shuffle = () =>
    setIdx((i) => {
      let n = Math.floor(Math.random() * QUOTES.length);
      if (n === i) n = (n + 1) % QUOTES.length;
      return n;
    });

  if (idx === null) return <div className="h-[120px]" />;
  const q = QUOTES[idx];

  return (
    <div className="min-h-[120px] flex flex-col justify-center gap-3 py-2">
      <p key={idx} className="font-display text-xl md:text-2xl text-ink leading-snug animate-fadeIn">
        “{q.text}”
      </p>
      <div className="flex items-center justify-between">
        <span className="label">{q.lang === "tr" ? "TR" : "EN"} · {idx + 1}/{QUOTES.length}</span>
        <button onClick={shuffle} className="btn-ghost !px-2" title="Another one" aria-label="Show another quote">
          <Shuffle className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
