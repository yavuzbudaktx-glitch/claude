"use client";

import { useEffect, useState, type ReactNode } from "react";

export function Masthead({ name, actions }: { name?: string; actions?: ReactNode }) {
  const [now, setNow] = useState<Date | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

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
      {/* Publisher's nameplate. Only the Newspaper concept shows it (CSS), and
          it removes ITSELF if the file 404s — a background-image can't do that,
          which is why the earlier attempt left a block of empty space. */}
      {!logoFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="https://images.seeklogo.com/logo-png/22/2/zaman-gazetesi-logo-png_seeklogo-224128.png"
          alt=""
          aria-hidden
          className="masthead-logo"
          onError={() => setLogoFailed(true)}
        />
      )}
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-5xl md:text-6xl lg:text-[64px] leading-[1.0] tracking-tight m-0 min-w-0">
          <span className="text-ink">{greeting}</span>
          {name ? (
            <>
              <span className="text-ink">,</span>{" "}
              <span className="text-gradient">{name}</span>
            </>
          ) : ""}
        </h1>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 pt-1">{actions}</div>
        )}
      </div>
    </header>
  );
}
