import { ReactNode } from "react";

export function Card({
  num,
  title,
  meta,
  action,
  children,
  className = "",
}: {
  num?: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card animate-fadeIn ${className}`}>
      <header className="headrule">
        <span className="label">
          {num ? <span className="text-accent mr-2">№ {num}</span> : null}
          {title}
        </span>
        <div className="ml-auto flex items-center gap-2">{action}</div>
        {meta && <div className="ml-2 label">{meta}</div>}
      </header>
      {children}
    </section>
  );
}
