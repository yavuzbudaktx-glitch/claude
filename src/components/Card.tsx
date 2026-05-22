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
        {num ? (
          <span className="section-num" aria-hidden>
            {num}
          </span>
        ) : null}
        <span
          className="font-serif text-[15px] font-medium tracking-tight text-ink leading-none"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          {title}
        </span>
        {meta && <span className="label ml-1.5">{meta}</span>}
        <div className="ml-auto flex items-center gap-2">{action}</div>
      </header>
      {children}
    </section>
  );
}
