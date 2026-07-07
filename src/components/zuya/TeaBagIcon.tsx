import type { CSSProperties } from "react";

// A small tea-bag mark (lucide has none) — used for the "Demleniyor" status.
export function TeaBag({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* tag */}
      <rect x="9.5" y="2.5" width="5" height="3" rx="1" />
      {/* string */}
      <path d="M12 5.5V9" />
      {/* pouch */}
      <path d="M8.5 9h7v5.5A3.5 3.5 0 0 1 12 18a3.5 3.5 0 0 1-3.5-3.5V9Z" />
      {/* seam */}
      <path d="M10 12.5h4" />
    </svg>
  );
}
