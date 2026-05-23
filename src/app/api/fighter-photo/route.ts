import { NextResponse } from "next/server";
import { findLocalFighterPhoto } from "@/lib/local-fighter-photos";

// Resolve a fighter's portrait by name: the user's curated photo in
// /public/fighters/ wins; otherwise fall back to the fighter's Wikipedia
// infobox image, which exists for essentially every champion. Used by the
// UFC rankings card (which fetches its data client-side and can't read the
// filesystem itself).

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function wikipediaThumb(name: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      name.replace(/\s+/g, "_"),
    )}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
      type?: string;
    };
    if (json.type === "disambiguation") return null;
    return json.thumbnail?.source ?? json.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (!name) return NextResponse.json({ url: null });

  const local = findLocalFighterPhoto(name);
  if (local) return NextResponse.json({ url: local });

  const wiki = await wikipediaThumb(name);
  return NextResponse.json({ url: wiki });
}
