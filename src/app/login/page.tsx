"use client";

import { createClient } from "@/lib/supabase/client";
import { Sun } from "lucide-react";

export default function LoginPage() {
  const supabase = createClient();

  async function signIn() {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
        redirectTo,
      },
    });
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-6">
      <div className="glass rounded-3xl px-8 py-10 max-w-sm w-full text-center space-y-6 animate-fadeIn">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-full bg-amber-300/30 flex items-center justify-center">
            <Sun className="h-7 w-7 text-amber-500" />
          </div>
        </div>
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">Morning Dashboard</h1>
          <p className="text-muted text-sm mt-2">
            Sign in with Google to sync your tasks across devices and pull in your calendar.
          </p>
        </div>
        <button
          onClick={signIn}
          className="w-full rounded-xl px-4 py-2.5 font-medium bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90 transition"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}
