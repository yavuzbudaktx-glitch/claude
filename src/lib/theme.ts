// Theme variants. Each variant is a class applied to the <html> element;
// the class flips a curated set of CSS variables AND attaches a body class
// for variant-specific shape/typography overrides in globals.css.
//
// Themes are NOT the same as light/dark. Light/dark is the `.dark` class;
// theme variants stack on top to change the entire visual character of the
// site (palette + corner radius + density + display face + texture).

export type ThemeId = "aurora" | "paper" | "terminal" | "galaxy" | "accounting" | "matte" | "mocha";

export const THEMES: Array<{
  id: ThemeId; label: string; description: string;
}> = [
  { id: "aurora",     label: "Aurora Glass", description: "Default — frosted cards, cyan accent, drifting aurora background." },
  { id: "paper",      label: "Paper",        description: "Warm off-white, ink text, single accent, no glass — editorial." },
  { id: "terminal",   label: "Terminal",     description: "Mono-typography, sharp corners, green-on-black phosphor feel." },
  { id: "galaxy",     label: "Galaxy",       description: "Deep space — magenta/violet accents, starfield drifting behind everything." },
  { id: "accounting", label: "Accounting",   description: "Crisp ledger paper, navy/forest accents — clean numbers-first interface." },
  { id: "matte",      label: "Matte Dark",   description: "Flat charcoal, low gloss, minimalist — content over chrome." },
  { id: "mocha",      label: "White Mocha",  description: "Warm cream + espresso brown, soft latte gradients — cozy & gentle." },
];

const KEY = "brief.theme.v1";

const VALID: ThemeId[] = ["aurora", "paper", "terminal", "galaxy", "accounting", "matte", "mocha"];
const NON_DEFAULT = VALID.filter((v) => v !== "aurora");

export function getTheme(): ThemeId {
  if (typeof window === "undefined") return "aurora";
  try {
    const v = localStorage.getItem(KEY) as ThemeId | null;
    return v && VALID.includes(v) ? v : "aurora";
  } catch { return "aurora"; }
}

export function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // strip every non-default theme class, then add the requested one
  for (const v of NON_DEFAULT) root.classList.remove(`theme-${v}`);
  if (id !== "aurora") root.classList.add(`theme-${id}`);
  root.setAttribute("data-theme", id);
  try { localStorage.setItem(KEY, id); } catch { /* noop */ }
}

// Inline script that runs in <head> before paint so we never get a flash
// of the default theme on top of the user's saved choice.
export const THEME_BOOT_SCRIPT = `
  (function() {
    try {
      var v = localStorage.getItem(${JSON.stringify(KEY)});
      var ok = ['paper','terminal','galaxy','accounting','matte','mocha'];
      var root = document.documentElement;
      if (v && ok.indexOf(v) >= 0) root.classList.add('theme-' + v);
      root.setAttribute('data-theme', v || 'aurora');
    } catch (e) {}
  })();
`;
