import { createZuyaServerClient } from "@/lib/supabase/zuya-server";
import { isZuyaEmail, type ZuyaUsername } from "@/lib/zuya/config";

export interface ZuyaMember {
  user_id: string;
  username: ZuyaUsername;
  display_name: string;
  status: string;
  status_updated_at: string | null;
  avatar_updated_at: string | null;
  google_connected: boolean;
  notif_prefs: Record<string, unknown>;
}

// Resolve the signed-in Zuya user + their member row, or null if the request
// has no valid Zuya session. The single auth check used by layouts and
// API routes (middleware already gates, this is the authoritative re-check).
export async function getZuyaMember(): Promise<{
  userId: string;
  member: ZuyaMember;
} | null> {
  const supabase = createZuyaServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isZuyaEmail(user.email)) return null;

  const { data: member } = await supabase
    .from("zuya_members")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return null;

  return { userId: user.id, member: member as ZuyaMember };
}
