// Fighter portraits served straight out of the repo at /public/fighters/.
// Files can be named loosely — "Magomed Ankalaev.png",
// "magomed_ankalaev.jpg", "Magomed-Ankalaev.webp", and even bare
// "Ankalaev.png" all match the same fighter.

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

function buildIndex(): IndexedPhoto[] {
  try {
    const files = readdirSync(FIGHTERS_DIR, { withFileTypes: true });
    return files
      .filter((f) => f.isFile() && /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(f.name))
      .map((f) => ({ fileName: f.name, tokens: normalizeTokens(f.name) }));
  } catch {
    return [];
  }
}

function indexFolder(fresh: boolean): IndexedPhoto[] {
  if (fresh) return buildIndex();
  if (!cached) cached = buildIndex();
  return cached;
}

export interface PhotoMatchDebug {
  name: string;
  tokens: string[];
  strategy: "exact-token-set" | "all-tokens-present" | "last-name-only" | "no-match";
  matchedFile: string | null;
}

export function findLocalFighterPhotoWithDebug(name: string, fresh = false): { url: string | null; debug: PhotoMatchDebug } {
  if (!name) {
    return { url: null, debug: { name, tokens: [], strategy: "no-match", matchedFile: null } };
  }
  const target = normalizeTokens(name);
  if (target.length === 0) {
    return { url: null, debug: { name, tokens: [], strategy: "no-match", matchedFile: null } };
  }
  const targetSet = new Set(target);
  const last = target[target.length - 1];
  const index = indexFolder(fresh);
  if (index.length === 0) {
    return { url: null, debug: { name, tokens: target, strategy: "no-match", matchedFile: null } };
  }

  // 1. Exact-token match (any order, same count). This is the cleanest
  //    case: "Magomed Ankalaev" → "magomed-ankalaev.png".
  for (const photo of index) {
    if (photo.tokens.length !== target.length) continue;
    if (photo.tokens.every((t) => targetSet.has(t))) {
      return { url: urlFor(photo.fileName), debug: { name, tokens: target, strategy: "exact-token-set", matchedFile: photo.fileName } };
    }
  }

  // 2. Every target token appears AS A STANDALONE TOKEN in the photo's
  //    tokens (photo has extras). This catches "Magomed Ankalaev" →
  //    "magomed-ankalaev-pose.png". Token-level matching avoids the old
  //    substring bug where "Jon Jones" would silently take
  //    "antonio-jones.png" because "jon" is a substring of "antonio".
  for (const photo of index) {
    if (target.every((t) => photo.tokens.includes(t))) {
      return { url: urlFor(photo.fileName), debug: { name, tokens: target, strategy: "all-tokens-present", matchedFile: photo.fileName } };
    }
  }

  // 3. Last-name-only fallback. Accept "Ankalaev.png" for
  //    "Magomed Ankalaev" — but ONLY when the file is a single token
  //    that exactly equals the fighter's last name. We don't accept
  //    arbitrary files that just happen to contain the last name,
  //    because that's how you end up with "antonio-jones" served for
  //    "Jon Jones".
  if (last && last.length >= 4) {
    for (const photo of index) {
      if (photo.tokens.length === 1 && photo.tokens[0] === last) {
        return { url: urlFor(photo.fileName), debug: { name, tokens: target, strategy: "last-name-only", matchedFile: photo.fileName } };
      }
    }
  }

  return { url: null, debug: { name, tokens: target, strategy: "no-match", matchedFile: null } };
}

export function findLocalFighterPhoto(name: string): string | null {
  return findLocalFighterPhotoWithDebug(name).url;
}

export function listIndexedPhotos(fresh = false): string[] {
  return indexFolder(fresh).map((p) => p.fileName);
}

function urlFor(fileName: string): string {
  return `/fighters/${encodeURIComponent(fileName)}`;
}
