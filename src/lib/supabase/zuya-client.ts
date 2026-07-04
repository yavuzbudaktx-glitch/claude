"use client";

import { createBrowserClient } from "@supabase/ssr";
import { ZUYA_COOKIE_NAME } from "@/lib/zuya/config";

// Browser client for the Zuya section, stored under a dedicated cookie name so
// a Zuya login coexists with (never evicts) the personal-dashboard session.
//
// IMPORTANT: `isSingleton: false`. @supabase/ssr keeps ONE module-level cached
// browser client, created by whoever calls createBrowserClient first. The
// dashboard's PrefsProvider (root layout) creates it first under the default
// cookie name — without opting out, this call would receive that cached client
// and silently ignore our cookieOptions, writing the session to the dashboard
// cookie that the Zuya middleware never reads (→ perpetual bounce to /login).
// We keep our own module-level cache so all Zuya callers still share one client.
let cached: ReturnType<typeof createBrowserClient> | null = null;

export function createZuyaClient() {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: ZUYA_COOKIE_NAME },
      isSingleton: false,
    },
  );
  return cached;
}
