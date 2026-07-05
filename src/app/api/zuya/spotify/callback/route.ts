import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";
import { spotifyExchangeCode, spotifyRedirectUri } from "@/lib/zuya/spotify";

export const dynamic = "force-dynamic";

function settingsRedirect(req: Request, flag: "connected" | "error") {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  return NextResponse.redirect(`${base.replace(/\/$/, "")}/zuya/settings?spotify=${flag}`);
}

export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.redirect(new URL("/zuya/login", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = cookies().get("zuya-spotify-state")?.value;
  if (!code || !state || !stateCookie || state !== stateCookie) {
    return settingsRedirect(req, "error");
  }

  const refreshToken = await spotifyExchangeCode(code, spotifyRedirectUri(req.url));
  if (!refreshToken) return settingsRedirect(req, "error");

  const service = createServiceClient();
  const { error } = await service
    .from("zuya_spotify_tokens")
    .upsert({ user_id: auth.userId, refresh_token: refreshToken }, { onConflict: "user_id" });
  if (error) return settingsRedirect(req, "error");
  await service.from("zuya_members").update({ spotify_connected: true }).eq("user_id", auth.userId);

  const res = settingsRedirect(req, "connected");
  res.cookies.delete("zuya-spotify-state");
  return res;
}
