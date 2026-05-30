import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PrefsProvider } from "@/components/PrefsProvider";
import { CommandPalette } from "@/components/CommandPalette";
import { FocusMode } from "@/components/FocusMode";

export const metadata: Metadata = {
  title: "Doc Anywhere",
  description: "Your personal cloud vault — links, notes, passwords and files, anywhere.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Doc Anywhere" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeScript = `
  (function() {
    try {
      var stored = localStorage.getItem('theme');
      var prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var theme = stored || (prefers ? 'dark' : 'light');
      if (theme === 'dark') document.documentElement.classList.add('dark');
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <PrefsProvider>
          {children}
          <CommandPalette />
          <FocusMode />
        </PrefsProvider>
      </body>
    </html>
  );
}
