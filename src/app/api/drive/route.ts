import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshAccessToken } from "@/lib/google/refresh";
import { fetchRecentDriveFiles } from "@/lib/google/drive";

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
    const files = await fetchRecentDriveFiles(accessToken, 25);
    return NextResponse.json({ files });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "drive_failed";
    const lower = msg.toLowerCase();
    let hint = "Reconnect Google and approve Drive (read-only) access.";
    if (/service_disabled|has not been used|accessnotconfigured|disabled/.test(lower)) {
      hint = "Enable the Google Drive API in your Cloud project, then reconnect Google.";
    } else if (/insufficient|scope|accessdenied|access_denied/.test(lower)) {
      hint = "Reconnect Google and grant Drive (read-only) on the consent screen.";
    }
    return NextResponse.json({ error: msg, needsReauth: true, hint }, { status: 502 });
  }
}
