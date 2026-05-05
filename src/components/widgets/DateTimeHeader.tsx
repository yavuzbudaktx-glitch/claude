"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

export function DateTimeHeader({ name }: { name?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const greeting = (() => {
    const h = now.getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="text-muted mt-1">{format(now, "EEEE, MMMM d, yyyy")}</p>
      </div>
      <div className="text-5xl font-light tabular-nums text-white/90">
        {format(now, "h:mm")}
        <span className="text-muted text-2xl ml-2">{format(now, "a")}</span>
      </div>
    </div>
  );
}
