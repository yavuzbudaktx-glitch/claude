"use client";

/* eslint-disable @next/next/no-img-element */

// One-click jump to the Doc Anywhere companion app. Renders as a btn-ghost
// with the actual Doc Anywhere logo inside, so it reads as a known
// destination rather than a generic icon.
export function DocAnywhereButton() {
  return (
    <a
      href="https://doc-anywhere.vercel.app/files"
      target="_blank"
      rel="noreferrer"
      aria-label="Open Doc Anywhere"
      title="Open Doc Anywhere"
      className="btn-ghost p-0 overflow-hidden"
    >
      <img
        src="/doc-anywhere-logo.png"
        alt=""
        className="h-6 w-6 rounded-md object-cover"
        draggable={false}
      />
    </a>
  );
}
