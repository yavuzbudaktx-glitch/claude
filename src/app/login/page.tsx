"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
          // Email confirmation is disabled → signed in immediately.
          window.location.href = "/files";
        } else {
          setMsg("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg(error.message);
        else window.location.href = "/files";
      }
    } finally {
      setBusy(false);
    }
  }

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
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="vault-login-input vault-mono"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="vault-login-input vault-mono"
            />
            <button type="submit" disabled={busy} className="vault-login-submit">
              {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {msg && <p className="vault-login-msg">{msg}</p>}

          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMsg(null);
            }}
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
