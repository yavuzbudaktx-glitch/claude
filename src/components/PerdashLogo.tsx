// Brand mark for Perdash — a miniature analog clock face paired with the
// serif wordmark. The clock motif ties the logo to the AnalogClock that
// dominates the masthead; the serif comes from the same font family as
// every other heading in the app so it reads as "of a piece".

export function PerdashLogo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 leading-none ${className}`}>
      <svg
        viewBox="-50 -50 100 100"
        width={size}
        height={size}
        aria-hidden
        className="shrink-0"
      >
        {/* Face */}
        <circle cx="0" cy="0" r="44" fill="none" stroke="currentColor" strokeWidth="3" />
        {/* Twelve tick marks at hour positions */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const sin = Math.sin(angle);
          const cos = -Math.cos(angle);
          const outer = 40;
          const inner = i % 3 === 0 ? 30 : 35;
          return (
            <line
              key={i}
              x1={sin * inner}
              y1={cos * inner}
              x2={sin * outer}
              y2={cos * outer}
              stroke="currentColor"
              strokeWidth={i % 3 === 0 ? 3 : 1.5}
              strokeLinecap="round"
            />
          );
        })}
        {/* Hour hand frozen at 10:10 — the classic "smiling clock" pose */}
        <line
          x1="0"
          y1="0"
          x2={-Math.cos((20 * Math.PI) / 180) * 22}
          y2={-Math.sin((20 * Math.PI) / 180) * 22}
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Minute hand */}
        <line
          x1="0"
          y1="0"
          x2={Math.cos((20 * Math.PI) / 180) * 32}
          y2={-Math.sin((20 * Math.PI) / 180) * 32}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Centre dot in accent so the logo carries the brand colour */}
        <circle cx="0" cy="0" r="4" fill="var(--accent)" />
      </svg>
      <span className="font-serif text-[1.6em] tracking-tight font-medium">
        Perdash<span className="text-accent">.</span>
      </span>
    </span>
  );
}
