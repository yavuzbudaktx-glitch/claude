import type { Metadata, Viewport } from "next";
import "./globals.css";
// Per-theme upgrade sheets. These load AFTER globals.css so a rule here beats
// the base definition at equal specificity — each theme owns one file, which
// also keeps globals.css from growing without bound.
import "./themes/newspaper.css";
import "./themes/blueprint.css";
import "./themes/mono.css";
import "./themes/comic.css";
import "./themes/terminal.css";
import "./themes/stainedglass.css";
import "./themes/cyberpunk.css";
import "./themes/subway.css";
import "./themes/renaissance.css";
import "./themes/deco.css";
import "./themes/marble.css";
import "./themes/galaxy.css";
import "./themes/aurora.css";
import "./themes/forest.css";
import "./themes/water.css";
import "./themes/sunset.css";
import "./themes/rain.css";
import { PrefsProvider } from "@/components/PrefsProvider";
import { CommandPalette } from "@/components/CommandPalette";
import { FocusMode } from "@/components/FocusMode";
import { ScrollProgress } from "@/components/ScrollProgress";
import { ThemeRestorer } from "@/components/ThemeRestorer";
import { WeatherFx } from "@/components/WeatherFx";
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
          <ThemeRestorer />
          <WeatherFx />
          <ScrollProgress />
          {children}
          <CommandPalette />
          <FocusMode />
        </PrefsProvider>
      </body>
    </html>
  );
}
