import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service-role key. BYPASSES Row Level Security —
// every query made with it MUST be explicitly scoped by user_id. Used by the
// /api/agent/* routes, which authenticate via device tokens (not OAuth cookies)
// and therefore have no auth.uid() to drive RLS.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
