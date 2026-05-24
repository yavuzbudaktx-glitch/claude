import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshAccessToken } from "@/lib/google/refresh";
import { fetchRecentEmails } from "@/lib/google/gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: settings } = await supabase
    .from("user_settings")
    .select("google_refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();

  const refreshToken = settings?.google_refresh_token;
  if (!refreshToken) {
    return NextResponse.json({ error: "missing_refresh_token", needsReauth: true }, { status: 400 });
  }

  try {
    const accessToken = await refreshAccessToken(refreshToken);
    const emails = await fetchRecentEmails(accessToken, 12);
    return NextResponse.json({ emails });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "gmail_failed";
    // 403 / insufficient scope → the user authorised before Gmail access was
    // requested, so prompt them to reconnect Google.
    const needsReauth =
      msg.includes("invalid_grant") ||
      msg.includes("403") ||
      msg.toLowerCase().includes("insufficient") ||
      msg.toLowerCase().includes("scope");
    return NextResponse.json({ error: msg, needsReauth }, { status: 502 });
  }
}
