import { TASK_STATUSES, type TaskStatus } from "@/types/db";

function piePath(percent: number, r: number) {
  const p = Math.min(0.9999, Math.max(0, percent));
  if (p === 0) return "";
  const angle = p * 2 * Math.PI - Math.PI / 2;
  const x = r * Math.cos(angle);
  const y = r * Math.sin(angle);
  const largeArc = p > 0.5 ? 1 : 0;
  return `M 0 0 L 0 ${-r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`;
}

export function StatusIcon({
  status,
  size = 14,
  className = "",
}: {
  status: TaskStatus;
  size?: number;
  className?: string;
}) {
  const def = TASK_STATUSES.find((s) => s.id === status) ?? TASK_STATUSES[0];
  const r = (size - 2) / 2;

  return (
    <svg
      viewBox={`-${size / 2} -${size / 2} ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <circle cx="0" cy="0" r={r} fill="none" stroke="currentColor" strokeWidth="1" />
      {def.hold ? (
        <g stroke="currentColor" strokeWidth={Math.max(1, size * 0.13)} strokeLinecap="round">
          <line x1={-r * 0.3} y1={-r * 0.45} x2={-r * 0.3} y2={r * 0.45} />
          <line x1={ r * 0.3} y1={-r * 0.45} x2={ r * 0.3} y2={r * 0.45} />
        </g>
      ) : (
        def.fill > 0 && <path d={piePath(def.fill, r)} fill="currentColor" />
      )}
    </svg>
  );
}
