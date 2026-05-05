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
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="flex justify-center">
          <Sun className="h-10 w-10 text-amber-300" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Morning Dashboard</h1>
          <p className="text-muted text-sm mt-1">
            Sign in with Google to sync your tasks across devices and pull in your calendar.
          </p>
        </div>
        <button
          onClick={signIn}
          className="w-full bg-white text-slate-900 hover:bg-white/90 transition rounded-lg px-4 py-2.5 font-medium"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}
