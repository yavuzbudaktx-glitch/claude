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
    <main className="min-h-dvh flex items-center justify-center px-6">
      <div className="card max-w-md w-full text-center animate-fadeIn !p-8 md:!p-10">
        <div className="label">Documents Anywhere</div>
        <h1 className="font-display text-5xl md:text-6xl tracking-tight mt-4 leading-[0.95]">
          <span className="text-ink">Your</span>{" "}
          <span className="text-gradient">Documents</span>
        </h1>
        <p className="text-muted text-sm mt-5 leading-relaxed">
          {mode === "signin"
            ? "Sign in to access your files from anywhere."
            : "Create an account to start syncing your documents."}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-3 text-left">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full px-4 py-3.5 rounded-2xl text-[14px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))",
              boxShadow: "0 10px 30px -8px var(--glow)",
            }}
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {msg && <p className="text-[13px] text-muted mt-4">{msg}</p>}

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMsg(null);
          }}
          className="label mt-6 hover:text-ink"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
