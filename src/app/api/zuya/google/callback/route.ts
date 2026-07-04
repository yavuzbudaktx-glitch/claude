import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";
import { zuyaGoogleRedirectUri } from "@/lib/zuya/google";

export const dynamic = "force-dynamic";

function settingsRedirect(req: Request, flag: "connected" | "error") {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  return NextResponse.redirect(`${base.replace(/\/$/, "")}/zuya/settings?google=${flag}`);
}

export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.redirect(new URL("/zuya/login", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = cookies().get("zuya-google-state")?.value;

  if (!code || !state || !stateCookie || state !== stateCookie) {
    return settingsRedirect(req, "error");
  }

  // Exchange the code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: zuyaGoogleRedirectUri(req.url),
    }),
  });
  if (!tokenRes.ok) return settingsRedirect(req, "error");

  const tokens = (await tokenRes.json()) as {
    refresh_token?: string;
    access_token?: string;
    scope?: string;
    id_token?: string;
  };
  if (!tokens.refresh_token) return settingsRedirect(req, "error");

  // Best-effort: which Google account was connected (for the settings UI).
  let googleEmail: string | null = null;
  if (tokens.access_token) {
    try {
      const uiRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (uiRes.ok) googleEmail = ((await uiRes.json()) as { email?: string }).email ?? null;
    } catch {
      // non-fatal
    }
  }

  const service = createServiceClient();
  const { error: tokenErr } = await service.from("zuya_google_tokens").upsert(
    {
      user_id: auth.userId,
      refresh_token: tokens.refresh_token,
      google_email: googleEmail,
      scopes: tokens.scope ?? null,
    },
    { onConflict: "user_id" },
  );
  if (tokenErr) return settingsRedirect(req, "error");

  await service
    .from("zuya_members")
    .update({ google_connected: true })
    .eq("user_id", auth.userId);

  const res = settingsRedirect(req, "connected");
  res.cookies.delete("zuya-google-state");
  return res;
}
