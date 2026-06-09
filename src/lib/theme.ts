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
  | "newspaper" | "blueprint" | "comic"
  | "mosaic" | "stainedglass" | "deco"
  // Five new in this batch — Cyberpunk and Vinyl are full concept themes,
  // Pastel / Onyx / Sage are palette themes.
  | "cyberpunk" | "vinyl" | "pastel" | "onyx" | "sage";

export const THEMES: Array<{
  id: ThemeId; label: string; description: string;
}> = [
  { id: "aurora",       label: "Aurora Glass", description: "Default — frosted cards, cyan accent, drifting aurora background." },
  { id: "galaxy",       label: "Galaxy",       description: "Deep space — violet nebula, a dense drifting starfield behind everything." },
  { id: "forest",       label: "Forest",       description: "A living woodland — sun shafts through the canopy, drifting leaves, bark-grain cards." },
  { id: "water",        label: "Water",        description: "Submerged in a turquoise sea — flowing caustics, streaming bubbles, deep aqua glow." },
  { id: "sunset",       label: "Sunset",       description: "Golden hour at the coast — peach sky, a slowly sinking sun, long horizon afterglow." },
  { id: "mosaic",       label: "Mosaic",       description: "Mediterranean azulejo — terracotta + cobalt tiles, hand-laid grout, an unmistakably handmade surface." },
  { id: "stainedglass", label: "Stained Glass",description: "Leaded cathedral panes — jewel reds, sapphire, emerald, with light spilling through the glazing." },
  { id: "deco",         label: "Art Deco",     description: "1920s glamour — gold geometry on deep emerald & black, sunburst fans, symmetric chevrons, high-contrast serif." },
  { id: "cyberpunk",    label: "Cyberpunk",    description: "Neon at midnight — hot pink + electric cyan over deep indigo, scanlines, holographic shimmer, pixel-perfect chrome." },
  { id: "vinyl",        label: "Vinyl",        description: "A record store on a Sunday afternoon — warm cream + brass over walnut, rotating record-groove background, label-style cards." },
  { id: "pastel",       label: "Pastel",       description: "Macaron palette — peach, mint, lavender on cream. Soft, airy, generous." },
  { id: "onyx",         label: "Onyx",         description: "Deep matte black with copper accents. Quiet luxury, no shine." },
  { id: "sage",         label: "Sage",         description: "Calm sage green, ivory paper, walnut accents. A reading room in a cabin." },
  { id: "terminal",     label: "Terminal",     description: "Mono-typography, sharp corners, green phosphor, CRT scanlines — day or night." },
  { id: "accounting",   label: "Accounting",   description: "Green-bar ledger paper — alternating rows align to the band rhythm, a red margin rule down the left, double-rule headers, tabular figures." },
  { id: "mono",         label: "Mono",         description: "Pure black & white, hard edges, heavy rules — brutalist clarity." },
  { id: "newspaper",    label: "Newspaper",    description: "Times-style serif type, columns, drop-caps, hairline ruling — like reading a Sunday paper." },
  { id: "blueprint",    label: "Blueprint",    description: "Architect's drafting page — white technical strokes on cyan, corner brackets, drafting grid." },
  { id: "comic",        label: "Comic",        description: "Halftone dots, ink-line panels, KAPOW red, offset hard shadows — your dashboard as a comic book." },
];

const KEY = "brief.theme.v1";

const VALID: ThemeId[] = ["aurora", "galaxy", "forest", "water", "sunset", "mosaic", "stainedglass", "deco", "cyberpunk", "vinyl", "pastel", "onyx", "sage", "terminal", "accounting", "mono", "newspaper", "blueprint", "comic"];
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
      var ok = ['galaxy','forest','water','sunset','mosaic','stainedglass','deco','cyberpunk','vinyl','pastel','onyx','sage','terminal','accounting','mono','newspaper','blueprint','comic'];
      var root = document.documentElement;
      if (v && ok.indexOf(v) >= 0) root.classList.add('theme-' + v);
      root.setAttribute('data-theme', v || 'aurora');
    } catch (e) {}
  })();
`;
