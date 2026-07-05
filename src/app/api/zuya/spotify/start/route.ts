import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getZuyaMember } from "@/lib/zuya/server";
import { ZUYA_SPOTIFY_SCOPES, spotifyClientId, spotifyRedirectUri } from "@/lib/zuya/spotify";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: spotifyClientId(),
    response_type: "code",
    redirect_uri: spotifyRedirectUri(req.url),
    scope: ZUYA_SPOTIFY_SCOPES,
    state,
  });
  const res = NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
  res.cookies.set("zuya-spotify-state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/zuya/spotify",
  });
  return res;
}
