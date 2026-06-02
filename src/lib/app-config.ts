// Which app this deployment is. Set NEXT_PUBLIC_APP=vault on the Doc Anywhere
// Vercel project; leave unset (or =dashboard) on the dashboard project. One
// codebase, two identities — driven entirely by this env var.
export type AppId = "vault" | "dashboard";

export const APP: AppId =
  process.env.NEXT_PUBLIC_APP === "vault" ? "vault" : "dashboard";

export const isVault = APP === "vault";

export const APP_CONFIG = {
  vault: {
    name: "Doc Anywhere",
    description: "Your personal cloud vault — links, notes, passwords and files, anywhere.",
    themeColor: "#0F5C56",
    manifest: "/manifest.vault.webmanifest",
    home: "/files",
    icons: {
      icon192: "/icons/icon-192.png",
      icon512: "/icons/icon-512.png",
      apple: "/icons/apple-touch-icon.png",
      favicon: "/favicon.ico",
    },
  },
  dashboard: {
    name: "Rest Area",
    description: "Your personal daily edition: time, weather, hadith, calendar, headlines and tasks.",
    themeColor: "#6C6CF0",
    manifest: "/manifest.brief.webmanifest",
    home: "/dashboard",
    icons: {
      icon192: "/icons/brief-192.png",
      icon512: "/icons/brief-512.png",
      apple: "/icons/brief-apple-touch.png",
      favicon: "/brief-favicon.ico",
    },
  },
} as const;

export const CURRENT = APP_CONFIG[APP];
