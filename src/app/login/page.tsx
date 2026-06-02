"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isVault, CURRENT } from "@/lib/app-config";

// Scopes we ask Google for. Each one is gated independently in Google's
// consent screen — the user can untick any of them and the corresponding
// dashboard widget will show a friendly "reconnect & approve" hint.
const GOOGLE_SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
].join(" ");

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const home = CURRENT.home; // "/files" on vault, "/dashboard" on Brief

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setMsg(error.message);
        } else if (data.session) {
          window.location.href = home;
        } else {
          setMsg("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg(error.message);
        else window.location.href = home;
      }
    } finally {
      setBusy(false);
    }
  }

  // Sign in with Google through Supabase's OAuth flow. `access_type=offline`
  // + `prompt=consent` are required for Google to issue a refresh_token —
  // without that, the /api/calendar | /api/emails | /api/drive routes can't
  // mint fresh access tokens later, which is the most common silent failure.
  async function googleSignIn() {
    setBusy(true);
    setMsg(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(home)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        scopes: GOOGLE_SCOPES,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) { setMsg(error.message); setBusy(false); }
    // On success the browser is redirected; nothing else to do here.
  }

  // Doc Anywhere (vault) gets the dark console login. Brief (dashboard) gets a
  // matching but distinctly branded card.
  if (isVault) {
    return (
      <div className="vault-scope">
        <main className="vault-login">
          <div className="vault-login-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/doc-anywhere-logo.png" alt="Doc Anywhere" className="vault-login-logo-img" />
            <h1 className="vault-login-title">Doc Anywhere</h1>
            <div className="vault-login-tag">Personal Cloud Vault</div>

            <p className="vault-login-desc">
              {mode === "signin"
                ? "Sign in to reach your links, notes, passwords and files — from any device."
                : "Create an account to start your private vault."}
            </p>

            <form onSubmit={submit} className="vault-login-form">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" className="vault-login-input vault-mono" />
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password" className="vault-login-input vault-mono" />
              <button type="submit" disabled={busy} className="vault-login-submit">
                {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            {msg && <p className="vault-login-msg">{msg}</p>}

            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}
              className="vault-login-switch"
            >
              {mode === "signin" ? "Need an account? Sign up →" : "← Have an account? Sign in"}
            </button>

            <div className="vault-login-foot">ENCRYPTED · PRIVATE · YOURS</div>
          </div>
        </main>
      </div>
    );
  }

  // Brief / dashboard login — the aurora-glass style.
  return (
    <main className="min-h-dvh flex items-center justify-center px-6">
      <div className="card max-w-md w-full text-center animate-fadeIn !p-8 md:!p-10">
        <div className="label">{CURRENT.name}</div>
        <h1 className="font-display text-5xl md:text-6xl tracking-tight mt-4 leading-[0.95]">
          <span className="text-ink">Your</span>{" "}
          <span className="text-gradient">Rest Area</span>
        </h1>
        <p className="text-muted text-sm mt-5 leading-relaxed">
          {mode === "signin"
            ? "Sign in to open your daily dashboard."
            : "Create an account to set up your dashboard."}
        </p>

        {/* Sign in with Google — the only way Calendar / Inbox / Drive widgets
            get a refresh token. Always rendered first so it's the obvious path. */}
        <button
          type="button"
          onClick={googleSignIn}
          disabled={busy}
          className="mt-8 w-full px-4 py-3 rounded-2xl text-[14px] font-medium inline-flex items-center justify-center gap-2.5 border border-[var(--rule)] bg-[var(--paper)] hover:bg-[var(--paper-2)] hover:border-[var(--accent)] transition disabled:opacity-50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2.1 1.5-4.7 2.4-7.3 2.4-5.3 0-9.7-3.3-11.3-8L6.3 33C9.6 39.7 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2c-.4.3 6.7-4.9 6.7-14.8 0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          {busy ? "Connecting…" : "Continue with Google"}
        </button>

        <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-muted-2">
          <span className="flex-1 h-px bg-[var(--rule)]" />
          or email
          <span className="flex-1 h-px bg-[var(--rule)]" />
        </div>

        <form onSubmit={submit} className="space-y-3 text-left">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none" />
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none" />
          <button type="submit" disabled={busy}
            className="w-full px-4 py-3.5 rounded-2xl text-[14px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))",
              boxShadow: "0 10px 30px -8px var(--glow)",
            }}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {msg && <p className="text-[13px] text-muted mt-4">{msg}</p>}

        <button
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}
          className="label mt-6 hover:text-ink"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
