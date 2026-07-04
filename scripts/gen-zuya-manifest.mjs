// Regenerate public/zuya/daily/manifest.json from the images in that folder.
// Keeps captions you already wrote (matching by file name); new files get a
// caption derived from the file name ("first-coffee.jpg" → "first coffee").
// Run after adding photos:  node scripts/gen-zuya-manifest.mjs

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "public/zuya/daily";
const MANIFEST = join(DIR, "manifest.json");
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

mkdirSync(DIR, { recursive: true });

let existing = [];
if (existsSync(MANIFEST)) {
  try {
    existing = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    existing = [];
  }
}
const captionByFile = new Map(existing.map((e) => [e.file, e.caption]));

const files = readdirSync(DIR)
  .filter((f) => IMAGE_EXT.test(f))
  .sort();

const manifest = files.map((file) => ({
  file,
  caption:
    captionByFile.get(file) ??
    file
      .replace(IMAGE_EXT, "")
      .replace(/[-_]+/g, " ")
      .trim(),
}));

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest.json written with ${manifest.length} photo(s)`);
