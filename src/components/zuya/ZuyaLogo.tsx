// Zuya's mark — an original lighthouse (a light that guides you home).
export function ZuyaLogo({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* light beams */}
      <path d="M6.8 8.3 4.3 7.2M17.2 8.3l2.5-1.1M7.2 5.4 5.4 4M16.8 5.4 18.6 4" opacity="0.75" />
      {/* lantern room + roof */}
      <path d="M10 8.2V6.6l2-2 2 2v1.6" />
      {/* tower, tapering out to the base */}
      <path d="M9 21 10 8.2h4L15 21Z" />
      {/* gallery line under the lantern */}
      <path d="M9.6 11.2h4.8" />
      {/* door */}
      <path d="M11 21v-3a1 1 0 0 1 2 0v3" />
      {/* ground */}
      <path d="M6.5 21h11" />
    </svg>
  );
}
