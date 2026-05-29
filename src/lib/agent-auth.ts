import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

export type Device = {
  id: string;
  user_id: string;
  name: string;
  platform: string | null;
  sync_cursor: number;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Validate the `Authorization: Bearer <token>` header against the devices table.
 * Returns the resolved device (incl. user_id) or null if missing/invalid/revoked.
 *
 * Callers MUST scope every subsequent query by the returned user_id — the
 * service-role client bypasses RLS.
 */
export async function requireDevice(request: Request): Promise<Device | null> {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const tokenHash = hashToken(match[1].trim());
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("devices")
    .select("id, user_id, name, platform, sync_cursor, revoked")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data || data.revoked) return null;

  // Best-effort heartbeat; ignore failures.
  await supabase
    .from("devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    id: data.id,
    user_id: data.user_id,
    name: data.name,
    platform: data.platform,
    sync_cursor: data.sync_cursor,
  };
}
