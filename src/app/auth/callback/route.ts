import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) return NextResponse.redirect(new URL("/login", request.url));

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  }

  const refreshToken = data.session.provider_refresh_token;
  if (refreshToken) {
    await supabase
      .from("user_settings")
      .upsert(
        { user_id: data.session.user.id, google_refresh_token: refreshToken },
        { onConflict: "user_id" },
      );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
