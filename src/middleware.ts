import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { updateZuyaSession } from "@/lib/supabase/zuya-middleware";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/zuya") || path.startsWith("/api/zuya")) {
    // Static files under public/zuya (daily photos, manifest) — not app pages.
    if (/\.[a-zA-Z0-9]+$/.test(path)) return NextResponse.next();
    return await updateZuyaSession(request);
  }

  // Everything else: the existing app, byte-identical behavior.
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|workbox-.*).*)"],
};
