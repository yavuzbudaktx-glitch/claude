"use client";

import { useEffect, useState } from "react";

export function Masthead({ name }: { name?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const greeting = (() => {
    if (!now) return "Hello";
    const h = now.getHours();
    if (h < 5)  return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <header>
      <h1 className="font-display text-5xl md:text-6xl lg:text-[64px] leading-[1.0] tracking-tight m-0">
        <span className="text-ink">{greeting}</span>
        {name ? (
          <>
            <span className="text-ink">,</span>{" "}
            <span className="text-gradient">{name}</span>
          </>
        ) : ""}
      </h1>
    </header>
  );
}
