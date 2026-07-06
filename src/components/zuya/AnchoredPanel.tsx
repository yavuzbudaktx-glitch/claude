"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

// A popover panel that escapes the header's blurred containing block: it
// portals into the .zuya-scope element (so it keeps the theme variables) and
// positions itself with fixed coords measured from the trigger, clamped to the
// viewport. Fixes dropdowns overflowing / breaking the layout on mobile.
export function AnchoredPanel({
  open,
  onClose,
  anchorRef,
  align = "right",
  width = 320,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  width?: number;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; w: number } | null>(null);

  useEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }
    const compute = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const margin = 8;
      const w = Math.min(width, window.innerWidth - margin * 2);
      let left = align === "right" ? r.right - w : r.left;
      left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
      setPos({ top: r.bottom + 8, left, w });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [open, anchorRef, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (document.getElementById("zuya-anchored")?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose, anchorRef]);

  if (!open || !pos || typeof document === "undefined") return null;
  const host = document.querySelector(".zuya-scope") ?? document.body;

  return createPortal(
    <div
      id="zuya-anchored"
      className="fixed z-[90]"
      style={{ top: pos.top, left: pos.left, width: pos.w, maxHeight: "70vh", overflowY: "auto" }}
    >
      {children}
    </div>,
    host,
  );
}
