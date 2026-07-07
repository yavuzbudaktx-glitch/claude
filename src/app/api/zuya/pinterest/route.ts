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

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "text/html,application/json,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.pinterest.com/",
};

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

// Strategy 1: Pinterest's board-widget JSON endpoint. When it works it's the
// cleanest (gives pin ids + descriptions), but it 404s for many boards now.
async function fromWidget(user: string, slug: string): Promise<Pin[] | null> {
  const endpoint = `https://widgets.pinterest.com/v3/pidgets/boards/${encodeURIComponent(
    user,
  )}/${encodeURIComponent(slug)}/pins/`;
  try {
    const res = await fetch(endpoint, { headers: BROWSER_HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { pins?: Array<Record<string, unknown>> } };
    const raw = json?.data?.pins ?? [];
    if (raw.length === 0) return null;
    return raw.slice(0, 10).map((p) => {
      const images = (p.images ?? {}) as Record<string, { url?: string }>;
      const best =
        images["736x"]?.url ?? images["600x315"]?.url ?? images["237x"]?.url ??
        Object.values(images)[0]?.url ?? "";
      const id = String(p.id ?? "");
      return {
        id,
        link: id ? `https://www.pinterest.com/pin/${id}/` : "https://www.pinterest.com",
        image: best,
        description: String(p.description ?? ""),
      };
    });
  } catch {
    return null;
  }
}

// Strategy 2: scrape the public board page for pin image URLs. Pinterest
// server-renders the first screenful of pins, so their i.pinimg.com thumbnails
// are in the HTML even without login.
async function fromHtml(
  user: string,
  slug: string,
): Promise<{ pins: Pin[]; status: number } | null> {
  const url = `https://www.pinterest.com/${encodeURIComponent(user)}/${encodeURIComponent(slug)}/`;
  let html = "";
  let status = 0;
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, cache: "no-store" });
    status = res.status;
    if (!res.ok) return { pins: [], status };
    html = await res.text();
  } catch {
    return null;
  }

  // Collect i.pinimg.com image URLs (the `_RS` avatar sizes carry an
  // underscore and don't match, so they're naturally excluded). Dedupe by the
  // pin's file hash so the same image at different sizes counts once, and
  // normalize whatever size Pinterest emitted up to 564x for display.
  const re = /https:\/\/i\.pinimg\.com\/[0-9a-zA-Zx]+\/[0-9a-f/]+\/[0-9a-f]{20,}\.(?:jpg|jpeg|png|webp)/g;
  const seen = new Set<string>();
  const pins: Pin[] = [];
  const pinIds = html.match(/\/pin\/(\d+)\//g)?.map((m) => m.split("/")[2]) ?? [];
  let idx = 0;
  for (const raw of html.match(re) ?? []) {
    const file = raw.slice(raw.lastIndexOf("/") + 1);
    if (seen.has(file)) continue;
    seen.add(file);
    const image = raw.replace(/i\.pinimg\.com\/[0-9a-zA-Zx]+\//, "i.pinimg.com/564x/");
    // Best-effort pin link — pair with the Nth pin id seen, else the board.
    const id = pinIds[idx++];
    pins.push({
      id: file,
      link: id ? `https://www.pinterest.com/pin/${id}/` : `https://www.pinterest.com/${user}/${slug}/`,
      image,
      description: "",
    });
    if (pins.length >= 10) break;
  }
  return { pins, status };
}

export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const board = new URL(req.url).searchParams.get("board") ?? "";
  const parsed = parseBoard(board);
  if (!parsed) return NextResponse.json({ pins: [], notConfigured: true });

  const widget = await fromWidget(parsed.user, parsed.slug);
  if (widget && widget.length > 0) return NextResponse.json({ pins: widget });

  const html = await fromHtml(parsed.user, parsed.slug);
  if (html && html.pins.length > 0) return NextResponse.json({ pins: html.pins });

  const status = html?.status;
  return NextResponse.json({
    pins: [],
    error:
      status && status >= 400
        ? `Pinterest returned ${status} for that board. Make sure it's public and the link points to the board itself.`
        : "Couldn't read any pins from that board. Make sure it's public and the link is the board's URL.",
  });
}
