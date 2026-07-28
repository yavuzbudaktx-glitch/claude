"use client";

import { ReactNode, useEffect, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";

export interface CardStatus {
  /** ms timestamp of the last successful data load (e.g. SWR dataUpdatedAt). */
  updatedAt?: number;
  /** a refresh is in flight. */
  loading?: boolean;
  /** the last load failed. */
  error?: boolean;
  /** click handler for the "retry" affordance shown on error. */
  onRetry?: () => void;
}

// A tiny live freshness indicator for the card header: "5m ago", a spinner
// while refreshing, or "failed · retry" on error. Solves silent staleness —
// you can always tell whether a card's data is fresh, loading, or broken.
function FreshPill({ status }: { status: CardStatus }) {
  const [, tick] = useState(0);
  // Re-render every 30s so the relative time stays current.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (status.error) {
    return (
      <button
        onClick={status.onRetry}
        className="inline-flex items-center gap-1 text-[10px] font-medium text-down hover:opacity-80 transition"
        title="Retry"
      >
        <RotateCcw className="h-3 w-3" /> failed
      </button>
    );
  }
  if (status.loading && !status.updatedAt) {
    return <span className="inline-flex items-center gap-1 text-[10px] text-muted"><span className="h-2.5 w-2.5 rounded-full border border-current border-t-transparent animate-spin" /> loading</span>;
  }
  const ago = (() => {
    if (!status.updatedAt) return status.loading ? "updating" : "";
    const m = Math.floor((Date.now() - status.updatedAt) / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();
  if (!ago) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-2" title="Last updated">
      <span className={`h-1.5 w-1.5 rounded-full ${status.loading ? "bg-accent animate-pulse" : "bg-[var(--up)]"}`} />
      {ago}
    </span>
  );
}

// Glass card header: a small glowing gradient dot, a confident bold title,
// optional meta, optional freshness pill, optional actions, and (if
// `collapsible`) a chevron that collapses the body to the header alone.
export function Card({
  id,
  num,
  title,
  meta,
  action,
  status,
  children,
  className = "",
  collapsible = true,
}: {
  id?: string;
  /** Kept for API compatibility — no longer rendered. */
  num?: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  status?: CardStatus;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
}) {
  void num;
  const key = `ui.card.collapsed.${id ?? (title || "untitled").toLowerCase().replace(/\s+/g, "-")}`;
  const [collapsed, setCollapsed] = usePref<boolean>(key, false);

  // We always render a header when the card is collapsible — otherwise there's
  // no chevron to click. Title-less cards get a slim header that's just the
  // chevron, right-aligned, in normal flow (NOT overlapping the content).
  const hasContent = !!(title || meta || action || status);
  const showHeader = hasContent || collapsible;

  return (
    <section className={`card animate-fadeIn ${collapsed ? "is-collapsed" : ""} ${className}`}>
      {showHeader && (
        <header className={hasContent ? "headrule" : "flex items-center justify-end mb-2.5"}>
          {hasContent && <span className="dot" aria-hidden />}
          {title && <span className="text-[14px] font-semibold tracking-tight text-ink">{title}</span>}
          {meta && <span className={title ? "ml-1.5 label" : "label"}>{meta}</span>}
          <div className={`${hasContent ? "ml-auto" : ""} flex items-center gap-2`}>
            {/* `card-fresh` is a theming hook: the Retro PC concept hides the
                relative-time text to keep its title bars authentic. */}
            {status && <span className="card-fresh inline-flex"><FreshPill status={status} /></span>}
            {action}
            {collapsible && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? "Expand card" : "Collapse card"}
                title={collapsed ? "Expand" : "Collapse"}
                className="card-collapse text-muted-2 hover:text-accent transition"
              >
                <ChevronDown
                  className="h-4 w-4 transition-transform"
                  style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                />
              </button>
            )}
          </div>
        </header>
      )}
      {!collapsed && children}
    </section>
  );
}
