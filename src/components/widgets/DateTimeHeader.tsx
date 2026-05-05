"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

export function DateTimeHeader({ name }: { name?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const greeting = (() => {
    if (!now) return "Hello";
    const h = now.getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 animate-fadeIn">
      <div>
        <h1 className="font-serif text-4xl md:text-5xl font-medium tracking-tight">
          {greeting}
          {name ? `, ${name}` : ""}
          <span className="text-amber-400">.</span>
        </h1>
        <p className="text-muted mt-2 text-sm md:text-base">
          {now ? format(now, "EEEE, MMMM d, yyyy") : " "}
        </p>
      </div>
      <div className="font-serif text-5xl md:text-6xl font-light tabular-nums">
        {now ? format(now, "h:mm") : " "}
        <span className="text-muted text-2xl ml-2 align-baseline">
          {now ? format(now, "a") : ""}
        </span>
      </div>
    </div>
  );
}
