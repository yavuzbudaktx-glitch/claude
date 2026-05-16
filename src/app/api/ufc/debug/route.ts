// Diagnostic endpoint for the fighter-photo lookup. Hit
// /api/ufc/debug to see exactly which files are in /public/fighters/
// and how each main-event fighter's name maps onto them.

import { NextResponse } from "next/server";
import { findLocalFighterPhotoWithDebug, listIndexedPhotos } from "@/lib/local-fighter-photos";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fresh = url.searchParams.get("fresh") === "1";

  const files = listIndexedPhotos(fresh);

  // Re-fetch the live UFC payload so the same fighter names the card
  // sees are the ones we test against.
  let fighters: Array<{ slot: string; event: string; name: string }> = [];
  try {
    const ufcUrl = new URL("/api/ufc", url.origin).toString();
    const res = await fetch(ufcUrl, { cache: "no-store" });
    if (res.ok) {
      interface MiniFighter { name?: string }
      interface MiniEvent { shortName?: string; fighterA?: MiniFighter | null; fighterB?: MiniFighter | null }
      interface MiniResp { previous?: MiniEvent | null; upcoming?: MiniEvent | null }
      const data = (await res.json()) as MiniResp;
      for (const slot of ["previous", "upcoming"] as const) {
        const ev = data[slot];
        if (!ev) continue;
        for (const role of ["fighterA", "fighterB"] as const) {
          const f = ev[role];
          if (f?.name) fighters.push({ slot, event: ev.shortName ?? "", name: f.name });
        }
      }
    }
  } catch {
    // ignore — debug response still shows the file list.
  }

  const lookups = fighters.map(({ slot, event, name }) => {
    const r = findLocalFighterPhotoWithDebug(name, fresh);
    return { slot, event, ...r.debug, matchedUrl: r.url };
  });

  return NextResponse.json({
    folder: "public/fighters",
    fileCount: files.length,
    sampleFiles: files.slice(0, 30),
    fighters: lookups,
    hints: files.length === 0
      ? [
          "The folder is empty from Node's perspective. Either no photos were committed,",
          "they landed on a different branch than the one Vercel is deploying,",
          "or Vercel's build output is excluding /public/fighters for some reason.",
        ]
      : lookups.every((l) => l.matchedUrl)
        ? ["All current fighters resolved to local files. ✓"]
        : [
            "Some fighters didn't match. Check the `strategy` field on each lookup",
            "— 'no-match' means no filename token contained the fighter's last name.",
            "Compare those names against the `sampleFiles` list and rename if needed.",
          ],
  });
}
