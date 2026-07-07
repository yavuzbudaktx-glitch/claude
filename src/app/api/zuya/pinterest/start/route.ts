import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getZuyaMember } from "@/lib/zuya/server";
import { ZUYA_PINTEREST_SCOPES, pinterestClientId, pinterestRedirectUri } from "@/lib/zuya/pinterest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: pinterestClientId(),
    response_type: "code",
    redirect_uri: pinterestRedirectUri(req.url),
    scope: ZUYA_PINTEREST_SCOPES,
    state,
  });
  const res = NextResponse.redirect(`https://www.pinterest.com/oauth/?${params}`);
  res.cookies.set("zuya-pinterest-state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/zuya/pinterest",
  });
  return res;
}
