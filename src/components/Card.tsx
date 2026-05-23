import { ReactNode } from "react";

// Clean header: small accent dot, bold title in ink, optional meta in
// muted, optional action(s) flushed right. No section number prefix,
// no rules — just a confident title bar that lets the content breathe.

export function Card({
  num,
  title,
  meta,
  action,
  children,
  className = "",
}: {
  /** Kept for API compatibility but no longer rendered. */
  num?: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // num intentionally unused — preserved on the Card API so callers
  // don't break, but the new aesthetic drops the "№ 01" prefix.
  void num;
  return (
    <section className={`card animate-fadeIn ${className}`}>
      <header className="headrule">
        <span className="dot bg-accent" aria-hidden />
        <span className="text-[14px] font-semibold tracking-tight text-ink">
          {title}
        </span>
        {meta && <span className="ml-1.5 label">{meta}</span>}
        <div className="ml-auto flex items-center gap-2">{action}</div>
      </header>
      {children}
    </section>
  );
}
