// UFC fighter portraits hosted in a public Google Drive folder. The user
// uploaded ~2000 fighter photos there; we list the folder once, build a
// name→fileId map, and serve images via Google's lh3 CDN.
//
// Folder ID:
//   1Qp75WUH-8kU3VflUKAEUKcyLD55FlMd0
// Public listing URL (HTML, no auth needed for "anyone with link" folders):
//   https://drive.google.com/embeddedfolderview?id={FOLDER_ID}#list
//
// The HTML response contains an entry for every file:
//   <div class="flip-entry" id="entry-{FILE_ID}">
//     ...
//     <div class="flip-entry-title">{FILENAME}</div>
//   </div>
// We parse those pairs into a normalised name map and look fighter names
// up against it.

const FOLDER_ID = "1Qp75WUH-8kU3VflUKAEUKcyLD55FlMd0";

interface DriveFile { id: string; name: string }

let cachedFiles: DriveFile[] | null = null;
let cachedAt = 0;
const CACHE_MS = 1000 * 60 * 60 * 6; // 6h

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

async function listDriveFolder(): Promise<DriveFile[]> {
  if (cachedFiles && Date.now() - cachedAt < CACHE_MS) return cachedFiles;
  const url = `https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}#list`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
        Accept: "text/html",
      },
      next: { revalidate: 21600 }, // 6h via Next.js too
    });
    if (!res.ok) return cachedFiles ?? [];
    const html = await res.text();
    const re = /<div[^>]+class="flip-entry"[^>]+id="entry-([^"]+)"[\s\S]*?<div[^>]+class="flip-entry-title"[^>]*>([^<]+)<\/div>/g;
    const entries: DriveFile[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      entries.push({ id: m[1], name: decodeEntities(m[2]).trim() });
    }
    if (entries.length > 0) {
      cachedFiles = entries;
      cachedAt = Date.now();
    }
    return entries;
  } catch {
    return cachedFiles ?? [];
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.(png|jpg|jpeg|webp|gif)$/i, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export async function findFighterDrivePhoto(fighterName: string): Promise<string | null> {
  if (!fighterName) return null;
  const files = await listDriveFolder();
  if (files.length === 0) return null;

  const target = normalize(fighterName);
  const targetTokens = tokens(fighterName);

  // 1. Exact normalised match — handles "Magomed Ankalaev" → "magomed ankalaev.png"
  for (const f of files) {
    if (normalize(f.name) === target) return cdnUrlForFile(f.id);
  }

  // 2. Last-first variant — "ankalaev_magomed.png" / "Ankalaev, Magomed.png"
  if (targetTokens.length >= 2) {
    const reversed = [...targetTokens].reverse().join("");
    for (const f of files) {
      if (normalize(f.name) === reversed) return cdnUrlForFile(f.id);
    }
  }

  // 3. Filename contains every token of the fighter's name (in any order).
  //    This catches things like "Magomed_Ankalaev_UFC.png".
  for (const f of files) {
    const fn = normalize(f.name);
    if (targetTokens.every((t) => fn.includes(t))) return cdnUrlForFile(f.id);
  }

  return null;
}

function cdnUrlForFile(fileId: string): string {
  // lh3.googleusercontent.com serves any public Drive file as an image
  // with sizing parameters and no auth required. =s400 caps the longer
  // edge at 400px which is plenty for a 64x64 portrait.
  return `https://lh3.googleusercontent.com/d/${fileId}=s400`;
}
