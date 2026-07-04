import { createServiceClient } from "@/lib/supabase/service";
import { refreshAccessToken } from "@/lib/google/refresh";

// Server-only helpers around zuya_google_tokens (a table with RLS and zero
// policies — only the service client can touch it, so partners can never read
// each other's refresh token).

export const ZUYA_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export function zuyaGoogleRedirectUri(requestUrl: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(requestUrl).origin;
  return `${base.replace(/\/$/, "")}/api/zuya/google/callback`;
}

/** Mint an access token for a zuya user, or report why we can't. */
export async function zuyaAccessTokenFor(
  userId: string,
): Promise<{ token: string } | { error: "not_connected" | "needs_reconnect" }> {
  const service = createServiceClient();
  const { data: row } = await service
    .from("zuya_google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row?.refresh_token) return { error: "not_connected" };

  try {
    const token = await refreshAccessToken(row.refresh_token);
    return { token };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("invalid_grant")) {
      // Token revoked or expired (e.g. Google testing-mode 7-day expiry):
      // flip the flag so the UI shows a "Reconnect" chip instead of erroring.
      await service
        .from("zuya_members")
        .update({ google_connected: false })
        .eq("user_id", userId);
      return { error: "needs_reconnect" };
    }
    throw e;
  }
}
