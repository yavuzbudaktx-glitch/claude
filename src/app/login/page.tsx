"use client";

import { createClient } from "@/lib/supabase/client";

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
      <div className="card max-w-md w-full text-center animate-fadeIn">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          Vol. I · Subscribe
        </div>
        <h1 className="font-serif text-4xl md:text-5xl font-light tracking-tight mt-4 leading-none">
          The Morning<br />
          <em className="text-accent not-italic">Edition</em>.
        </h1>
        <p className="text-muted text-sm mt-5 leading-relaxed">
          A private, single-reader newspaper.<br />
          Time, weather, the day&rsquo;s ayet, your calendar, the wire, and a clear desk.
        </p>
        <button
          onClick={signIn}
          className="mt-8 w-full px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] border rule hover:bg-[var(--ink)] hover:text-[var(--bg)] hover:border-[var(--ink)] transition"
        >
          Sign in with Google
        </button>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mt-6">
          Calendar access · Read-only
        </div>
      </div>
    </main>
  );
}
