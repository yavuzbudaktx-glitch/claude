"use client";
import type { ReactNode } from "react";

export default function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="panel w-full max-w-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="panel-head">
          <span>{title}</span>
          <button onClick={onClose} className="text-base leading-none" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="space-y-3 p-3">{children}</div>
      </div>
    </div>
  );
}
