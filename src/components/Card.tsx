"use client";

import { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";

// Glass card header: a small glowing gradient dot, a confident bold title,
// optional meta, optional actions, and (if `collapsible`) a chevron that
// collapses the body to the header alone. Collapsed state syncs via prefs
// under the supplied id, so it persists across devices.
export function Card({
  id,
  num,
  title,
  meta,
  action,
  children,
  className = "",
  collapsible = true,
}: {
  /** Stable id, used as the prefs key for collapsed state. Falls back to title. */
  id?: string;
  /** Kept for API compatibility — no longer rendered. */
  num?: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
}) {
  void num;
  const key = `ui.card.collapsed.${id ?? title.toLowerCase().replace(/\s+/g, "-")}`;
  const [collapsed, setCollapsed] = usePref<boolean>(key, false);

  return (
    <section className={`card animate-fadeIn ${collapsed ? "is-collapsed" : ""} ${className}`}>
      <header className="headrule">
        <span className="dot" aria-hidden />
        {title && <span className="text-[14px] font-semibold tracking-tight text-ink">{title}</span>}
        {meta && <span className={title ? "ml-1.5 label" : "label"}>{meta}</span>}
        <div className="ml-auto flex items-center gap-2">
          {action}
          {collapsible && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand card" : "Collapse card"}
              title={collapsed ? "Expand" : "Collapse"}
              className="text-muted-2 hover:text-accent transition"
            >
              <ChevronDown
                className="h-4 w-4 transition-transform"
                style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
              />
            </button>
          )}
        </div>
      </header>
      {!collapsed && children}
    </section>
  );
}
