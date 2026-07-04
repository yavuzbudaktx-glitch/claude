import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getZuyaMember } from "@/lib/zuya/server";
import { ZUYA_GOOGLE_SCOPES, zuyaGoogleRedirectUri, zuyaGoogleClientId } from "@/lib/zuya/google";

export const dynamic = "force-dynamic";

// Kick off the Google OAuth consent flow (direct — NOT through Supabase's
// provider, which would replace the Zuya session). State is mirrored in a
// short-lived httpOnly cookie and checked in the callback.
export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: zuyaGoogleClientId(),
    redirect_uri: zuyaGoogleRedirectUri(req.url),
    response_type: "code",
    scope: ZUYA_GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );
  res.cookies.set("zuya-google-state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/zuya/google",
  });
  return res;
}
