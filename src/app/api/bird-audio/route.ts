// Same-origin audio proxy for the Bird-of-the-day song. Browsers can be
// fussy about cross-origin <audio> (mixed content, missing CORS headers,
// redirect handling, referrer blocks) — xeno-canto's and Commons' CDNs trip
// at least one of those on some clients, which is why the song "still doesn't
// play." Streaming the file through our own origin sidesteps every one of
// those: to the browser it's a plain same-origin media file.
//
// Range requests are forwarded so the <audio> scrubber works.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Only proxy audio from the hosts we actually use — never an open relay.
const ALLOWED = [
  "xeno-canto.org",
  "www.xeno-canto.org",
  "upload.wikimedia.org",
  "commons.wikimedia.org",
];

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return new NextResponse("missing url", { status: 400 });

  let target: URL;
  try { target = new URL(raw); } catch { return new NextResponse("bad url", { status: 400 }); }
  if (!ALLOWED.includes(target.hostname)) {
    return new NextResponse("host not allowed", { status: 403 });
  }

  const range = req.headers.get("range") ?? undefined;
  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        // A real-browser UA + referer keeps xeno-canto from 403-ing the hotlink.
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Referer: `https://${target.hostname}/`,
        ...(range ? { Range: range } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse("upstream error", { status: 502 });
    }
    const headers = new Headers();
    const ct = upstream.headers.get("content-type") ?? "audio/mpeg";
    headers.set("Content-Type", ct);
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    const cr = upstream.headers.get("content-range");
    if (cr) headers.set("Content-Range", cr);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=86400");
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  }
}
