"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, ArrowLeft, Eye, EyeOff, RotateCcw, AlertTriangle } from "lucide-react";
import { createZuyaClient } from "@/lib/supabase/zuya-client";
import { ZUYA_DISPLAY_NAMES, ZUYA_USERNAMES, zuyaEmail, type ZuyaUsername } from "@/lib/zuya/config";

type Status =
  | { state: "loading" }
  | { state: "ready"; registered: Record<ZuyaUsername, boolean> }
  | { state: "error"; problem: string; detail?: string };

// Human explanations for every way the backend can be not-ready, so a setup
// problem shows up here in plain words instead of dead buttons.
function problemText(problem: string, detail?: string): string {
  switch (problem) {
    case "migration_missing":
      return "The database isn't set up yet. Yavuz: open Supabase → SQL Editor, paste supabase/migrations/0013_zuya.sql from the repo, and press Run. Then retry here.";
    case "missing_service_key":
      return "The server is missing its Supabase key. Yavuz: Vercel → project “brief” → Settings → Environment Variables → add SUPABASE_SERVICE_ROLE_KEY (copy it from Supabase → Settings → API), then redeploy.";
    case "fetch_failed":
      return "Couldn't reach the server. Check your connection and retry.";
    default:
      return `Something's off on the server${detail ? `: ${detail}` : "."} Retry in a moment.`;
  }
}

export default function ZuyaLoginPage() {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [who, setWho] = useState<ZuyaUsername | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatus({ state: "loading" });
    try {
      const res = await fetch("/api/zuya/auth/status", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (d && d.ready === true) {
        setStatus({
          state: "ready",
          registered: { yavuz: !!d.yavuz, zuleyha: !!d.zuleyha },
        });
      } else if (d && d.ready === false) {
        setStatus({ state: "error", problem: d.problem ?? "server_error", detail: d.detail });
      } else {
        setStatus({ state: "error", problem: "server_error", detail: `HTTP ${res.status}` });
      }
    } catch {
      setStatus({ state: "error", problem: "fetch_failed" });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const isFirstTime = who !== null && status.state === "ready" && !status.registered[who];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!who) return;
    setBusy(true);
    setMsg(null);
    try {
      if (isFirstTime) {
        if (password.length < 8) {
          setMsg("Password needs at least 8 characters.");
          return;
        }
        if (password !== confirm) {
          setMsg("Passwords don't match.");
          return;
        }
        const res = await fetch("/api/zuya/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: who, password }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setMsg(d.error ?? `Registration failed (HTTP ${res.status}).`);
          return;
        }
      }
      const supabase = createZuyaClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: zuyaEmail(who),
        password,
      });
      if (error) {
        setMsg(isFirstTime ? error.message : "Wrong password. Try again, aşkım.");
        return;
      }
      window.location.href = "/zuya";
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-10">
      <div className="card max-w-sm w-full text-center animate-fadeIn !p-8 md:!p-10">
        <div className="mx-auto h-12 w-12 rounded-full grid place-items-center"
          style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-to))" }}>
          <Heart className="h-6 w-6 text-white" fill="currentColor" />
        </div>
        <h1 className="font-display text-5xl tracking-tight mt-4 text-gradient leading-[1.1] pb-1">Zuya</h1>
        <p className="label mt-1">Yavuz ♥ Züleyha</p>

        {status.state === "error" && (
          <div className="mt-6 rounded-2xl border border-[var(--down)] bg-[color-mix(in_srgb,var(--down)_8%,transparent)] p-4 text-left">
            <p className="text-[13px] text-ink-soft leading-relaxed inline-flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-down shrink-0 mt-0.5" />
              <span>{problemText(status.problem, status.detail)}</span>
            </p>
            <button
              onClick={() => void loadStatus()}
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:brightness-110"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {status.state === "loading" && (
          <p className="text-muted text-sm mt-6 inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" />
            waking up…
          </p>
        )}

        {status.state === "ready" && !who && (
          <>
            <p className="text-muted text-sm mt-6">Who are you?</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {ZUYA_USERNAMES.map((u) => (
                <button
                  key={u}
                  onClick={() => { setWho(u); setMsg(null); }}
                  className="rounded-2xl px-4 py-6 border border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--accent)] hover:bg-[var(--paper-2)] transition"
                >
                  <span className="block text-2xl font-display text-ink">
                    {ZUYA_DISPLAY_NAMES[u]}
                  </span>
                  {!status.registered[u] && (
                    <span className="label mt-1 block text-accent">first visit</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {status.state === "ready" && who && (
          <form onSubmit={submit} className="mt-6 space-y-3 text-left">
            <button
              type="button"
              onClick={() => { setWho(null); setPassword(""); setConfirm(""); setMsg(null); }}
              className="label inline-flex items-center gap-1 hover:text-ink"
            >
              <ArrowLeft className="h-3 w-3" /> not {ZUYA_DISPLAY_NAMES[who]}?
            </button>

            <p className="text-sm text-ink-soft">
              {isFirstTime ? (
                <>Welcome, <b>{ZUYA_DISPLAY_NAMES[who]}</b> ♥ Choose a password — you&apos;ll use it from now on.</>
              ) : (
                <>Welcome back, <b>{ZUYA_DISPLAY_NAMES[who]}</b> ♥</>
              )}
            </p>

            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                required
                minLength={isFirstTime ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isFirstTime ? "Choose a password (min 8)" : "Your password"}
                autoFocus
                className="w-full px-4 py-3 pr-11 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-2 hover:text-ink"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {isFirstTime && (
              <input
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat the password"
                className="w-full px-4 py-3 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-3.5 rounded-2xl text-[14px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))",
                boxShadow: "0 10px 30px -8px var(--glow)",
              }}
            >
              {busy ? "…" : isFirstTime ? "Set password & come in" : "Come in"}
            </button>
          </form>
        )}

        {msg && <p className="text-[13px] text-down mt-4 text-left">{msg}</p>}

        <div className="label mt-8">seni seviyorum, her gün</div>
      </div>
    </main>
  );
}
