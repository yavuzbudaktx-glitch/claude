import type { Metadata, Viewport } from "next";

// Zuya's own identity: title, PWA manifest, icons. Nested metadata overrides
// the root layout's for everything under /zuya.
export const metadata: Metadata = {
  title: "Zuya",
  description: "Yavuz & Züleyha — our little corner of the internet.",
  manifest: "/manifest.zuya.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Zuya" },
  icons: {
    icon: [
      { url: "/icons/zuya-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/zuya-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/zuya-apple-touch.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#3d1f33",
};

// Theme scope only — auth gating lives in the (app) group's layout so the
// login page stays reachable. `.zuya-scope` swaps the CSS variables to the
// warm blush/plum palette and paints its own background over the aurora.
export default function ZuyaLayout({ children }: { children: React.ReactNode }) {
  return <div className="zuya-scope zt-rose">{children}</div>;
}
