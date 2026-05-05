"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

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

  const issue = now ? `Vol. I · No. ${Math.floor((+now - +new Date(now.getFullYear(),0,0)) / 86400000)}` : "";

  return (
    <header className="border-b rule pb-4">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-muted mb-2">
        <span>The Morning Edition</span>
        <span>{now ? format(now, "EEEE, MMMM d, yyyy") : ""}</span>
        <span>{issue}</span>
      </div>
      <h1 className="font-serif text-5xl md:text-6xl font-light tracking-[-0.02em] leading-none">
        {greeting}
        {name ? <span>, <em className="not-italic font-medium">{name}</em></span> : ""}
        <span className="text-accent">.</span>
      </h1>
    </header>
  );
}
