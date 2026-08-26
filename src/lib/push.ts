import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

// Web Push, shared by Rest Area and Zuya.
//
// No third-party service is involved: the VAPID keypair is self-generated and
// lives in env, and delivery is handled by whichever push service the browser
// itself uses (Google for Chrome, Mozilla for Firefox, Apple for Safari). None
// of them require an account from us.
//
// A browser has exactly ONE PushSubscription per service worker, so there is one
// device registry rather than one per feature — `zuya_push_subs` is that
// registry, named for whatever shipped first. A second table would only ever
// hold duplicate rows for the same endpoints.
export const PUSH_SUBS_TABLE = "zuya_push_subs";

let configured = false;
export function pushConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:yavuzbudaktx@gmail.com", pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send a push to every device a user has registered. Returns how many were
 * delivered, so callers can tell "nothing was due" apart from "nobody is
 * subscribed". Dead subscriptions (404/410) are pruned. Never throws.
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  const service = createServiceClient();
  const { data: subs } = await service
    .from(PUSH_SUBS_TABLE)
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return 0;

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        // The subscription is gone for good — the browser was reinstalled, the
        // user cleared site data, or they revoked permission.
        if (code === 404 || code === 410) {
          await service.from(PUSH_SUBS_TABLE).delete().eq("id", s.id);
        }
      }
    }),
  );
  return sent;
}
