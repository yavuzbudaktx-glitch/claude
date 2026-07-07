import { NextResponse } from "next/server";
import { getZuyaMember } from "@/lib/zuya/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Pin {
  id: string;
  link: string;
  image: string;
  description: string;
}

// Parse "username/board-slug" out of whatever the user pasted — a full
// pinterest.com URL, a "user/board" pair, or with/without trailing slashes.
function parseBoard(input: string): { user: string; slug: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  let path = raw;
  const m = /pinterest\.[a-z.]+\/(.+)/i.exec(raw);
  if (m) path = m[1];
  const parts = path.split("?")[0].split("#")[0].split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { user: parts[0], slug: parts[1] };
}

export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const board = new URL(req.url).searchParams.get("board") ?? "";
  const parsed = parseBoard(board);
  if (!parsed) return NextResponse.json({ pins: [], notConfigured: true });

  // Pinterest's public board-widget endpoint — the same JSON the official
  // "board widget" embed uses. No API key or OAuth needed for public boards.
  const endpoint = `https://widgets.pinterest.com/v3/pidgets/boards/${encodeURIComponent(
    parsed.user,
  )}/${encodeURIComponent(parsed.slug)}/pins/`;

  try {
    const res = await fetch(endpoint, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json({ pins: [], error: "Board couldn't be reached." });
    }
    const json = (await res.json()) as {
      data?: { pins?: Array<Record<string, unknown>> };
    };
    const rawPins = json?.data?.pins ?? [];
    const pins: Pin[] = rawPins.slice(0, 10).map((p) => {
      const images = (p.images ?? {}) as Record<string, { url?: string }>;
      // Prefer the largest thumbnail Pinterest returns.
      const best =
        images["736x"]?.url ??
        images["600x315"]?.url ??
        images["237x"]?.url ??
        Object.values(images)[0]?.url ??
        "";
      const id = String(p.id ?? "");
      return {
        id,
        link: id ? `https://www.pinterest.com/pin/${id}/` : "https://www.pinterest.com",
        image: best,
        description: String(p.description ?? ""),
      };
    });
    return NextResponse.json({ pins });
  } catch {
    return NextResponse.json({ pins: [], error: "Board couldn't be reached." });
  }
}
