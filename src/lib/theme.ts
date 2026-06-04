// Theme variants. Each variant is a class applied to the <html> element;
// the class flips a curated set of CSS variables AND attaches a body class
// for variant-specific shape/typography overrides in globals.css.
//
// Themes are NOT the same as light/dark. Light/dark is the `.dark` class;
// theme variants stack on top to change the entire visual character of the
// site (palette + corner radius + density + display face + texture). The
// strongest ones (Galaxy, Forest, Water, Lust, Terminal, the concept set)
// carry a full atmosphere, not just a recolor.

export type ThemeId =
  | "aurora" | "galaxy" | "forest" | "water" | "sunset"
  | "terminal" | "accounting" | "mono"
  | "newspaper" | "blueprint" | "comic" | "sketch";

export const THEMES: Array<{
  id: ThemeId; label: string; description: string;
}> = [
  { id: "aurora",     label: "Aurora Glass", description: "Default — frosted cards, cyan accent, drifting aurora background." },
  { id: "galaxy",     label: "Galaxy",       description: "Deep space — violet nebula, a dense drifting starfield behind everything." },
  { id: "forest",     label: "Forest",       description: "A living woodland — sun shafts through the canopy, drifting leaves, bark-grain cards." },
  { id: "water",      label: "Water",        description: "Submerged in a turquoise sea — flowing caustics, streaming bubbles, deep aqua glow." },
  { id: "sunset",     label: "Sunset",       description: "Golden hour at the coast — peach sky, a slowly sinking sun, long horizon afterglow." },
  { id: "terminal",   label: "Terminal",     description: "Mono-typography, sharp corners, green phosphor, CRT scanlines — day or night." },
  { id: "accounting", label: "Accounting",   description: "Crisp ledger paper, navy/forest accents — clean numbers-first interface." },
  { id: "mono",       label: "Mono",         description: "Pure black & white, hard edges, heavy rules — brutalist clarity." },
  { id: "newspaper",  label: "Newspaper",    description: "Times-style serif type, columns, drop-caps, hairline ruling — like reading a Sunday paper." },
  { id: "blueprint",  label: "Blueprint",    description: "Architect's drafting page — white technical strokes on cyan, corner brackets, drafting grid." },
  { id: "comic",      label: "Comic",        description: "Halftone dots, ink-line panels, KAPOW red, offset hard shadows — your dashboard as a comic book." },
  { id: "sketch",     label: "Sketchbook",   description: "Pencil on grid paper, wobbly hand-drawn outlines, Caveat handwriting — work in your own margin notes." },
];

const KEY = "brief.theme.v1";

const VALID: ThemeId[] = ["aurora", "galaxy", "forest", "water", "sunset", "terminal", "accounting", "mono", "newspaper", "blueprint", "comic", "sketch"];
const NON_DEFAULT = VALID.filter((v) => v !== "aurora");

export function getTheme(): ThemeId {
  if (typeof window === "undefined") return "aurora";
  try {
    const v = localStorage.getItem(KEY) as ThemeId | null;
    return v && VALID.includes(v) ? v : "aurora";
  } catch { return "aurora"; }
}

export function applyTheme(id: ThemeId) {
  applyThemeDom(id);
  try { localStorage.setItem(KEY, id); } catch { /* noop */ }
}

// Apply theme to the DOM without writing to localStorage. Used for hover
// previews in the picker, so peeking at a theme never overwrites the user's
// actual saved choice (the previous code wrote to localStorage on every
// hover, which is why the theme sometimes "reverted" after a refresh).
export function applyThemeDom(id: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const v of NON_DEFAULT) root.classList.remove(`theme-${v}`);
  if (id !== "aurora") root.classList.add(`theme-${id}`);
  root.setAttribute("data-theme", id);
}

// Inline script that runs in <head> before paint so we never get a flash
// of the default theme on top of the user's saved choice.
export const THEME_BOOT_SCRIPT = `
  (function() {
    try {
      var v = localStorage.getItem(${JSON.stringify(KEY)});
      var ok = ['galaxy','forest','water','sunset','terminal','accounting','mono','newspaper','blueprint','comic','sketch'];
      var root = document.documentElement;
      if (v && ok.indexOf(v) >= 0) root.classList.add('theme-' + v);
      root.setAttribute('data-theme', v || 'aurora');
    } catch (e) {}
  })();
`;
