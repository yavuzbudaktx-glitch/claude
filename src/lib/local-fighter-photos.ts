// Fighter portraits served straight out of the repo at /public/fighters/.
// We read the folder once at module load, build a normalised-name index,
// then look fighters up against it on every request. Files can be named
// loosely — "Magomed Ankalaev.png", "magomed_ankalaev.jpg",
// "Magomed-Ankalaev.webp" all match the same fighter.

import { readdirSync } from "fs";
import path from "path";

const FIGHTERS_DIR = path.join(process.cwd(), "public", "fighters");

interface IndexedPhoto { fileName: string; tokens: string[] }
let cached: IndexedPhoto[] | null = null;

function normalizeTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.(png|jpg|jpeg|webp|gif|avif)$/i, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function indexFolder(): IndexedPhoto[] {
  if (cached) return cached;
  try {
    const files = readdirSync(FIGHTERS_DIR, { withFileTypes: true });
    cached = files
      .filter((f) => f.isFile() && /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(f.name))
      .map((f) => ({ fileName: f.name, tokens: normalizeTokens(f.name) }));
    return cached;
  } catch {
    cached = [];
    return cached;
  }
}

export function findLocalFighterPhoto(name: string): string | null {
  if (!name) return null;
  const target = normalizeTokens(name);
  if (target.length === 0) return null;
  const targetSet = new Set(target);
  const targetJoined = target.join("");
  const index = indexFolder();
  if (index.length === 0) return null;

  // 1. Exact-token match (any order): "Magomed Ankalaev" → all photos
  //    whose tokens are exactly {"magomed","ankalaev"} match.
  for (const photo of index) {
    if (photo.tokens.length !== target.length) continue;
    if (photo.tokens.every((t) => targetSet.has(t))) return urlFor(photo.fileName);
  }

  // 2. Filename joined contains every name token. Catches things like
  //    "magomed_ankalaev_pose.png" where there's an extra tag.
  for (const photo of index) {
    const joined = photo.tokens.join("");
    if (target.every((t) => joined.includes(t))) return urlFor(photo.fileName);
  }

  // 3. The joined fighter name appears anywhere in the joined filename.
  for (const photo of index) {
    if (photo.tokens.join("").includes(targetJoined)) return urlFor(photo.fileName);
  }

  return null;
}

function urlFor(fileName: string): string {
  // Serves from the same origin as the app — no CORS, no rate limits,
  // browser caches aggressively.
  return `/fighters/${encodeURIComponent(fileName)}`;
}
