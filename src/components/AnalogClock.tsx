"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

export function AnalogClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) {
    return <div className="aspect-square w-full" aria-hidden />;
  }

  const ms = now.getMilliseconds();
  const s = now.getSeconds() + ms / 1000;
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;

  const secondAngle = s * 6;
  const minuteAngle = m * 6;
  const hourAngle = h * 30;

  const numerals = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

  return (
    <div className="flex flex-col items-center w-full">
      <svg viewBox="-110 -110 220 220" className="w-full max-w-[260px] aspect-square">
        <defs>
          <radialGradient id="clockface" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="var(--paper)" />
            <stop offset="100%" stopColor="var(--bg)" />
          </radialGradient>
        </defs>

        <circle cx="0" cy="0" r="100" fill="url(#clockface)" stroke="var(--rule)" strokeWidth="1" />
        <circle cx="0" cy="0" r="92" fill="none" stroke="var(--rule-soft)" strokeWidth="0.5" />

        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i * 6 * Math.PI) / 180;
          const isHour = i % 5 === 0;
          const r1 = isHour ? 78 : 84;
          const r2 = 90;
          return (
            <line
              key={i}
              x1={Math.sin(a) * r1}
              y1={-Math.cos(a) * r1}
              x2={Math.sin(a) * r2}
              y2={-Math.cos(a) * r2}
              stroke="var(--ink)"
              strokeWidth={isHour ? 1.5 : 0.5}
              opacity={isHour ? 0.85 : 0.35}
            />
          );
        })}

        {numerals.map((n, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const r = 66;
          return (
            <text
              key={n}
              x={Math.sin(a) * r}
              y={-Math.cos(a) * r}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="Fraunces, serif"
              fontSize="11"
              fontWeight="500"
              fill="var(--ink)"
              opacity="0.85"
            >
              {n}
            </text>
          );
        })}

        <text
          x="0"
          y="38"
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize="6"
          letterSpacing="2"
          fill="var(--muted)"
        >
          DALLAS · TX
        </text>

        <g style={{ transform: `rotate(${hourAngle}deg)`, transformOrigin: "0 0", transition: "none" }}>
          <line x1="0" y1="10" x2="0" y2="-46" stroke="var(--ink)" strokeWidth="3.5" strokeLinecap="round" />
        </g>
        <g style={{ transform: `rotate(${minuteAngle}deg)`, transformOrigin: "0 0", transition: "none" }}>
          <line x1="0" y1="14" x2="0" y2="-72" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g style={{ transform: `rotate(${secondAngle}deg)`, transformOrigin: "0 0", transition: "none" }}>
          <line x1="0" y1="20" x2="0" y2="-80" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" />
          <circle cx="0" cy="-58" r="3" fill="var(--accent)" />
        </g>

        <circle cx="0" cy="0" r="4" fill="var(--ink)" />
        <circle cx="0" cy="0" r="1.5" fill="var(--accent)" />
      </svg>
      <div className="mt-3 font-mono text-[10px] tracking-[0.18em] text-muted uppercase">
        {format(now, "EEEE · MMM d")}
      </div>
    </div>
  );
}
