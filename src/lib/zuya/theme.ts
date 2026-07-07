// Zuya theme selection. Reuses the dashboard's theme-* classes, but applied to
// the .zuya-scope element (not <html>) so it never collides with the personal
// dashboard's own theme. "rose" is Zuya's default palette (the zt-rose class).

export type ZuyaThemeId =
  | "rose"
  | "galaxy" | "forest" | "water" | "sunset"
  | "terminal" | "accounting" | "mono"
  | "newspaper" | "blueprint" | "comic"
  | "mosaic" | "stainedglass" | "deco" | "cyberpunk"
  | "renaissance" | "marble" | "subway";

export const ZUYA_THEMES: Array<{ id: ZuyaThemeId; label: string }> = [
  { id: "rose", label: "Dawn Rose" },
  { id: "galaxy", label: "Galaxy" },
  { id: "sunset", label: "Sunset" },
  { id: "forest", label: "Forest" },
  { id: "water", label: "Water" },
  { id: "cyberpunk", label: "Cyberpunk" },
  { id: "deco", label: "Art Deco" },
  { id: "renaissance", label: "Renaissance" },
  { id: "marble", label: "Marble" },
  { id: "mosaic", label: "Mosaic" },
  { id: "stainedglass", label: "Stained Glass" },
  { id: "subway", label: "Subway" },
  { id: "newspaper", label: "Newspaper" },
  { id: "comic", label: "Comic" },
  { id: "blueprint", label: "Blueprint" },
  { id: "terminal", label: "Terminal" },
  { id: "accounting", label: "Accounting" },
  { id: "mono", label: "Mono" },
];

const KEY = "zuya.theme.v1";
const THEME_CLASSES = ZUYA_THEMES.filter((t) => t.id !== "rose").map((t) => `theme-${t.id}`);

export function getZuyaTheme(): ZuyaThemeId {
  if (typeof window === "undefined") return "rose";
  try {
    const v = localStorage.getItem(KEY) as ZuyaThemeId | null;
    return v && ZUYA_THEMES.some((t) => t.id === v) ? v : "rose";
  } catch {
    return "rose";
  }
}

export function applyZuyaThemeDom(id: ZuyaThemeId) {
  if (typeof document === "undefined") return;
  const el = document.querySelector<HTMLElement>(".zuya-scope");
  if (!el) return;
  el.classList.remove("zt-rose", ...THEME_CLASSES);
  if (id === "rose") el.classList.add("zt-rose");
  else el.classList.add(`theme-${id}`);
}

export function applyZuyaTheme(id: ZuyaThemeId) {
  applyZuyaThemeDom(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* noop */
  }
}
