import { ReactNode } from "react";

export function Card({
  title,
  icon,
  children,
  className = "",
  action,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-panel/70 backdrop-blur p-5 shadow-xl shadow-black/20 ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-muted">
            {icon}
            {title && <h2>{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
