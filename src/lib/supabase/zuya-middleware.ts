import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ZUYA_COOKIE_NAME, isZuyaEmail } from "@/lib/zuya/config";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Paths under /zuya reachable without a Zuya session.
function isPublicZuyaPath(path: string): boolean {
  return path === "/zuya/login" || path.startsWith("/api/zuya/auth/");
}

// Session refresh + gate for the Zuya section. Mirrors updateSession() but on
// the dedicated `zuya-auth` cookie, and additionally enforces that everything
// under /zuya and /api/zuya (except login/registration) has a Zuya user.
export async function updateZuyaSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: ZUYA_COOKIE_NAME },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!isZuyaEmail(user?.email) && !isPublicZuyaPath(path)) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/zuya/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed-in zuya user landing on the login page: straight to the dashboard.
  if (isZuyaEmail(user?.email) && path === "/zuya/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/zuya";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
