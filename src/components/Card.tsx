import { ReactNode } from "react";

// Glass card header: a small glowing gradient dot, a confident bold title,
// optional meta, and any actions flushed right. The `num` prop is kept on
// the API for compatibility but is no longer rendered.
export function Card({
  num,
  title,
  meta,
  action,
  children,
  className = "",
}: {
  /** Kept for API compatibility — no longer rendered. */
  num?: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  void num;
  return (
    <section className={`card animate-fadeIn ${className}`}>
      <header className="headrule">
        <span className="dot" aria-hidden />
        {title && <span className="text-[14px] font-semibold tracking-tight text-ink">{title}</span>}
        {meta && <span className={title ? "ml-1.5 label" : "label"}>{meta}</span>}
        <div className="ml-auto flex items-center gap-2">{action}</div>
      </header>
      {children}
    </section>
  );
}
