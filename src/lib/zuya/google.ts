import { createServiceClient } from "@/lib/supabase/service";

// Server-only helpers around zuya_google_tokens (a table with RLS and zero
// policies — only the service client can touch it, so partners can never read
// each other's refresh token).

// Zuya uses its OWN Google OAuth client so its setup never touches the personal
// dashboard's GOOGLE_CLIENT_ID/SECRET (the dashboard mints refresh tokens
// through Supabase's Google provider and refreshes them with those exact keys —
// overwriting them breaks its calendar/mail/drive). Falls back to the shared
// keys only if the Zuya-specific ones aren't set.
export function zuyaGoogleClientId(): string {
  return (process.env.ZUYA_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) ?? "";
}
export function zuyaGoogleClientSecret(): string {
  return (process.env.ZUYA_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET) ?? "";
}

export const ZUYA_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

// Refresh a Zuya access token with Zuya's own client credentials.
async function zuyaRefreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: zuyaGoogleClientId(),
      client_secret: zuyaGoogleClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export function zuyaGoogleRedirectUri(requestUrl: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(requestUrl).origin;
  return `${base.replace(/\/$/, "")}/api/zuya/google/callback`;
}

export type ZuyaTokenResult =
  | { token: string }
  | { error: "not_connected" | "needs_reconnect" | "error"; detail?: string };

/** Mint an access token for a zuya user, or report why we can't. Never throws
 * — unexpected failures come back as { error: "error", detail } so the UI can
 * show the real reason instead of a blank "didn't load". */
export async function zuyaAccessTokenFor(userId: string): Promise<ZuyaTokenResult> {
  const service = createServiceClient();
  const { data: row } = await service
    .from("zuya_google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row?.refresh_token) return { error: "not_connected" };

  try {
    const token = await zuyaRefreshAccessToken(row.refresh_token);
    return { token };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("invalid_grant")) {
      // Token revoked or expired: flip the flag so the UI shows "Reconnect".
      await service.from("zuya_members").update({ google_connected: false }).eq("user_id", userId);
      return { error: "needs_reconnect" };
    }
    // invalid_client / bad keys / API errors — surface the reason.
    return { error: "error", detail: msg.slice(0, 300) };
  }
}
