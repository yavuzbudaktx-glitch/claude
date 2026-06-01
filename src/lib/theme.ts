// Theme variants. Each variant is a class applied to the <html> element;
// the class flips a curated set of CSS variables AND attaches a body class
// for variant-specific shape/typography overrides in globals.css.
//
// Themes are NOT the same as light/dark. Light/dark is the `.dark` class;
// theme variants stack on top to change the entire visual character of the
// site (palette + corner radius + density + display face + texture).

export type ThemeId = "aurora" | "paper" | "terminal";

export const THEMES: Array<{
  id: ThemeId; label: string; description: string;
}> = [
  { id: "aurora",   label: "Aurora Glass", description: "Default — frosted cards, cyan accent, drifting aurora background." },
  { id: "paper",    label: "Paper",        description: "Warm off-white, ink text, single accent, no glass — editorial." },
  { id: "terminal", label: "Terminal",     description: "Mono-typography, sharp corners, green-on-black phosphor feel." },
];

const KEY = "brief.theme.v1";

export function getTheme(): ThemeId {
  if (typeof window === "undefined") return "aurora";
  try {
    const v = localStorage.getItem(KEY);
    return v === "paper" || v === "terminal" ? v : "aurora";
  } catch { return "aurora"; }
}

export function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("theme-paper", "theme-terminal");
  if (id === "paper") root.classList.add("theme-paper");
  if (id === "terminal") root.classList.add("theme-terminal");
  root.setAttribute("data-theme", id);
  try { localStorage.setItem(KEY, id); } catch { /* noop */ }
}

// Inline script that runs in <head> before paint so we never get a flash
// of the default theme on top of the user's saved choice.
export const THEME_BOOT_SCRIPT = `
  (function() {
    try {
      var v = localStorage.getItem(${JSON.stringify(KEY)});
      var root = document.documentElement;
      if (v === 'paper') root.classList.add('theme-paper');
      else if (v === 'terminal') root.classList.add('theme-terminal');
      root.setAttribute('data-theme', v || 'aurora');
    } catch (e) {}
  })();
`;
