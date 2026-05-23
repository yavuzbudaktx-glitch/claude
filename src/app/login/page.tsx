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
      <div className="card max-w-md w-full text-center animate-fadeIn !p-8 md:!p-10">
        <div className="label">Your personal dashboard</div>
        <h1 className="font-display text-5xl md:text-6xl tracking-tight mt-4 leading-[0.95]">
          <span className="text-ink">Good</span>{" "}
          <span className="text-gradient">Morning</span>
        </h1>
        <p className="text-muted text-sm mt-5 leading-relaxed">
          One calm place for your day — time, weather, the day&rsquo;s hadith,
          your calendar, the headlines, markets, and a clear desk.
        </p>
        <button
          onClick={signIn}
          className="mt-8 w-full px-4 py-3.5 rounded-2xl text-[14px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))",
            boxShadow: "0 10px 30px -8px var(--glow)",
          }}
        >
          Sign in with Google
        </button>
        <div className="label mt-6 !tracking-[0.18em]">
          Calendar access · Read-only
        </div>
      </div>
    </main>
  );
}
