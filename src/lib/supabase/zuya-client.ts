"use client";

import { createBrowserClient } from "@supabase/ssr";
import { ZUYA_COOKIE_NAME } from "@/lib/zuya/config";

// Browser client for the Zuya section. Identical to the main client except it
// stores its session under a dedicated cookie name, so a Zuya login coexists
// with (never evicts) the personal-dashboard session in the same browser.
export function createZuyaClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { name: ZUYA_COOKIE_NAME } },
  );
}
