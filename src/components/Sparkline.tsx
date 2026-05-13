// Catmull-Rom-to-Bezier path generator. Renders a smoothly-interpolated curve
// through the given points instead of a polyline of straight segments — so a
// 5-point synthesized sparkline reads visually as a chart, not a zigzag.
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`;
  if (pts.length === 2) {
    return `M ${pts[0][0]},${pts[0][1]} L ${pts[1][0]},${pts[1][1]}`;
  }
  let d = `M ${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  className = "",
  up,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  up?: boolean;
}) {
  if (!data || data.length < 2) {
    return <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const pts: Array<[number, number]> = data.map((v, i) => [
    i * stepX,
    height - ((v - min) / range) * (height - 2) - 1,
  ]);

  const path = smoothPath(pts);
  const isUp = up ?? data[data.length - 1] >= data[0];
  const stroke = isUp ? "var(--up, #16a34a)" : "var(--accent)";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden>
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

