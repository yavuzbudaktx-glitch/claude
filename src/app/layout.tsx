import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PrefsProvider } from "@/components/PrefsProvider";
import { CommandPalette } from "@/components/CommandPalette";
import { FocusMode } from "@/components/FocusMode";
import { CURRENT } from "@/lib/app-config";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: CURRENT.name,
  description: CURRENT.description,
  manifest: CURRENT.manifest,
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: CURRENT.name },
  icons: {
    icon: [
      { url: CURRENT.icons.favicon },
      { url: CURRENT.icons.icon192, sizes: "192x192", type: "image/png" },
      { url: CURRENT.icons.icon512, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: CURRENT.icons.apple, sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: CURRENT.themeColor,
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
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
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
