// Theme variants. Each variant is a class applied to the <html> element;
// the class flips a curated set of CSS variables AND attaches a body class
// for variant-specific shape/typography overrides in globals.css.
//
// Themes are NOT the same as light/dark. Light/dark is the `.dark` class;
// theme variants stack on top to change the entire visual character of the
// site. `kind` splits the picker into two sections: "concept" themes carry a
// full atmosphere (texture, motion, bespoke card chrome); "theme" entries
// are clean palettes/looks.

export type ThemeId =
  | "aurora" | "galaxy" | "forest" | "water" | "rain" | "sunset"
  | "terminal" | "accounting" | "mono"
  | "newspaper" | "blueprint" | "comic"
  | "mosaic" | "stainedglass" | "deco" | "cyberpunk"
  | "renaissance" | "marble" | "subway";

export type ThemeKind = "concept" | "theme";

export const THEMES: Array<{
  id: ThemeId; label: string; description: string; kind: ThemeKind;
}> = [
  // ---- CONCEPTS: themes that change the IDENTITY of the site (different
  //                typography, card chrome, decorative chrome — you'd
  //                recognise the look as "a newspaper" or "a comic book").
  { id: "newspaper",    label: "Newspaper",    kind: "concept", description: "Times-style serif type, columns, drop-caps, hairline ruling — like reading a Sunday paper." },
  { id: "comic",        label: "Comic",        kind: "concept", description: "Halftone dots, ink-line panels, KAPOW red, offset hard shadows — your dashboard as a comic book." },
  { id: "blueprint",    label: "Blueprint",    kind: "concept", description: "Architect's drafting page — white technical strokes on cyan, corner brackets, drafting grid." },
  { id: "terminal",     label: "Terminal",     kind: "concept", description: "Mono-typography, sharp corners, green phosphor, CRT scanlines — day or night." },
  { id: "accounting",   label: "Accounting",   kind: "concept", description: "Green-bar ledger paper — banded rows, a red margin rule, double-rule headers, tabular figures." },
  { id: "mosaic",       label: "Mosaic",       kind: "concept", description: "Mediterranean azulejo — terracotta + cobalt tiles, hand-laid grout, an unmistakably handmade surface." },
  { id: "stainedglass", label: "Stained Glass",kind: "concept", description: "Leaded cathedral panes — jewel reds, sapphire, emerald, with light spilling through the glazing." },
  { id: "deco",         label: "Art Deco",     kind: "concept", description: "1920s glamour — gold geometry on deep emerald & black, sunburst-crowned cards, high-contrast serif." },
  { id: "cyberpunk",    label: "Cyberpunk",    kind: "concept", description: "Neon at midnight — hot pink + electric cyan over deep indigo, scanlines, holographic shimmer." },
  { id: "mono",         label: "Mono",         kind: "concept", description: "Pure black & white, hard edges, heavy rules — brutalist clarity." },
  { id: "renaissance",  label: "Renaissance",  kind: "concept", description: "Oil paintings in gold-leaf frames. Burnt umber, cream, gilt; Trajan-ish serif type; brushed-canvas card grain." },
  { id: "marble",       label: "Marble",       kind: "concept", description: "Carrara on white — veined slab surfaces, gold-leaf accents, columnar dividers, classical serif." },
  { id: "subway",       label: "Subway",       kind: "concept", description: "NYC vintage station — white subway tile, mosaic borders, brass numerals, hand-painted enamel signs." },
  // ---- THEMES: atmospheric palettes — same site, different mood/colour.
  { id: "aurora",       label: "Aurora Glass", kind: "theme",   description: "Default — frosted cards, cyan accent, drifting aurora background." },
  { id: "galaxy",       label: "Galaxy",       kind: "theme",   description: "Deep space — violet nebula, a dense drifting starfield behind everything." },
  { id: "forest",       label: "Forest",       kind: "theme",   description: "A living woodland — sun shafts through the canopy, drifting leaves, bark-grain cards." },
  { id: "water",        label: "Water",        kind: "theme",   description: "Submerged in a turquoise sea — flowing caustics, streaming bubbles, deep aqua glow." },
  { id: "rain",         label: "Rain",         kind: "theme",   description: "A storm at the window — slate sky, three parallax sheets of rain streaking down the whole page." },
  { id: "sunset",       label: "Sunset",       kind: "theme",   description: "Golden hour at the coast — peach sky, a slowly sinking sun, long horizon afterglow." },
];

const KEY = "brief.theme.v1";

const VALID: ThemeId[] = [
  "aurora", "galaxy", "forest", "water", "rain", "sunset",
  "mosaic", "stainedglass", "deco", "cyberpunk",
  "renaissance", "marble", "subway",
  "terminal", "accounting", "mono",
  "newspaper", "blueprint", "comic",
];
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
      var ok = ['galaxy','forest','water','rain','sunset','mosaic','stainedglass','deco','cyberpunk','renaissance','marble','subway','terminal','accounting','mono','newspaper','blueprint','comic'];
      var root = document.documentElement;
      var saved = v && ok.indexOf(v) >= 0 ? v : null;
      if (saved) root.classList.add('theme-' + saved);
      root.setAttribute('data-theme', saved || 'aurora');
    } catch (e) {}
  })();
`;
