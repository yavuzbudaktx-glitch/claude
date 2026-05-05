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
    <section className={`glass rounded-3xl p-6 animate-fadeIn ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
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
