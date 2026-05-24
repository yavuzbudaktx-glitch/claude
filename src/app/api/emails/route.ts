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
    const lower = msg.toLowerCase();
    // Distinguish the two common setup gaps so the UI can tell the user
    // exactly what to fix.
    let hint = "Reconnect Google and approve Gmail (read-only) access.";
    if (/service_disabled|has not been used|accessnotconfigured|disabled/.test(lower)) {
      hint = "Enable the Gmail API in your Google Cloud project, then reconnect Google.";
    } else if (/insufficient|scope|accessdenied|access_denied/.test(lower)) {
      hint = "Reconnect Google and check the Gmail (read-only) box on the consent screen.";
    }
    const needsReauth = true;
    return NextResponse.json({ error: msg, needsReauth, hint }, { status: 502 });
  }
}
