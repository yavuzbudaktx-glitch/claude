export function Sparkline({
  data,
  width = 80,
  height = 24,
  className = "",
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!data || data.length < 2) {
    return <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const path = `M ${points.join(" L ")}`;

  const up = data[data.length - 1] >= data[0];
  const stroke = up ? "var(--up, #16a34a)" : "var(--accent)";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden>
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ValueChart({
  data,
  height = 110,
  className = "",
}: {
  data: { date: string; value: number }[];
  height?: number;
  className?: string;
}) {
  if (!data || data.length < 2) {
    return (
      <div
        className={`flex items-center justify-center font-mono text-[10px] uppercase tracking-wider text-muted ${className}`}
        style={{ height }}
      >
        Snapshots will populate as you open the dashboard each day.
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padTop = 6;
  const padBottom = 14;
  const innerH = height - padTop - padBottom;

  const w = 1000; // viewBox width; scales responsively
  const stepX = w / (data.length - 1);
  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = padTop + (innerH - ((d.value - min) / range) * innerH);
    return { x, y, ...d };
  });

  const path = `M ${points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L ")}`;
  const fillPath = `${path} L ${w},${height - padBottom} L 0,${height - padBottom} Z`;
  const up = data[data.length - 1].value >= data[0].value;
  const stroke = up ? "var(--up, #16a34a)" : "var(--accent)";

  const startVal = data[0].value;
  const endVal = data[data.length - 1].value;
  const delta = endVal - startVal;
  const deltaPct = startVal !== 0 ? (delta / startVal) * 100 : 0;

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
      >
        <defs>
          <linearGradient id="vc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#vc-fill)" />
        <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) =>
          i === points.length - 1 ? (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill={stroke} />
          ) : null,
        )}
      </svg>
      <div className="absolute left-0 top-0 font-mono text-[10px] uppercase tracking-wider text-muted">
        {data[0].date}
      </div>
      <div className="absolute right-0 top-0 font-mono text-[10px] uppercase tracking-wider text-muted">
        {data[data.length - 1].date}
      </div>
      <div
        className={`absolute right-0 bottom-0 font-mono text-[11px] tabular-nums ${
          up ? "text-emerald-600 dark:text-emerald-400" : "text-accent"
        }`}
      >
        {delta >= 0 ? "+" : ""}${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        {" "}
        ({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
      </div>
    </div>
  );
}
