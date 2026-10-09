"use client";
import dynamic from "next/dynamic";

// Everything lives in localStorage, so render client-only to avoid hydration mismatches.
const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => <div className="p-8 text-center font-pixel text-xs text-white">Loading room…</div>,
});

export default function Page() {
  return <App />;
}
