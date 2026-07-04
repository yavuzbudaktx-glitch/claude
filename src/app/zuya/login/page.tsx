"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, ArrowLeft, Eye, EyeOff, RotateCcw } from "lucide-react";
import { createZuyaClient } from "@/lib/supabase/zuya-client";
import { ZUYA_DISPLAY_NAMES, ZUYA_USERNAMES, zuyaEmail, type ZuyaUsername } from "@/lib/zuya/config";

// The status fetch is ONLY a hint (labels a name "first visit" and preselects
// set-password vs sign-in). It never gates the UI — the form and the reset
// button always render, and the server is the source of truth on submit. This
// is deliberate: a transient status hiccup must not lock anyone out.
type Registered = Partial<Record<ZuyaUsername, boolean>>;

export default function ZuyaLoginPage() {
  const [registered, setRegistered] = useState<Registered>({});
  const [who, setWho] = useState<ZuyaUsername | null>(null);
  const [firstTimeToggle, setFirstTimeToggle] = useState(false); // user chose "set a password"
  const [forceFirstTime, setForceFirstTime] = useState(false); // after "start over"
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/zuya/auth/status", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (d && d.ready === true) {
        setRegistered({ yavuz: !!d.yavuz, zuleyha: !!d.zuleyha });
      }
    } catch {
      // Non-blocking — the form works without it.
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Known-registered from the hint: true / false / undefined(unknown).
  const hint = who ? registered[who] : undefined;
  // Show the set-password (two-field) flow when: we know it's a new account,
  // the user asked to set one, or they just reset.
  const isFirstTime = who !== null && (forceFirstTime || firstTimeToggle || hint === false);

  async function signIn(supabase: ReturnType<typeof createZuyaClient>, username: ZuyaUsername) {
    const { error } = await supabase.auth.signInWithPassword({
      email: zuyaEmail(username),
      password,
    });
    if (error) {
      setMsg(error.message);
      return false;
    }
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!who) return;
    setBusy(true);
    setMsg(null);
    try {
      if (!password) {
        setMsg("Enter a password.");
        return;
      }
      const supabase = createZuyaClient();

      if (isFirstTime) {
        if (password !== confirm) {
          setMsg("The two passwords don't match.");
          return;
        }
        const res = await fetch("/api/zuya/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: who, password }),
        });
        if (res.status === 409) {
          // Already registered — the hint was stale. Just sign in instead.
          if (await signIn(supabase, who)) window.location.href = "/zuya";
          return;
        }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setMsg(d.error ?? `Couldn't create the account (HTTP ${res.status}).`);
          return;
        }
      }

      if (await signIn(supabase, who)) window.location.href = "/zuya";
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function startOver() {
    if (!who) return;
    setResetting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/zuya/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: who }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error ?? "Couldn't reset — try again.");
        return;
      }
      setPassword("");
      setConfirm("");
      setForceFirstTime(true);
      setRegistered((r) => ({ ...r, [who]: false }));
      setMsg("Done — set a fresh password below.");
    } finally {
      setResetting(false);
    }
  }

  function pickName(u: ZuyaUsername) {
    setWho(u);
    setForceFirstTime(false);
    setFirstTimeToggle(false);
    setPassword("");
    setConfirm("");
    setMsg(null);
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-10">
      <div className="card max-w-sm w-full text-center animate-fadeIn !p-8 md:!p-10">
        <div className="mx-auto h-12 w-12 rounded-full grid place-items-center"
          style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-to))" }}>
          <Heart className="h-6 w-6 text-white" fill="currentColor" />
        </div>
        <h1 className="font-display text-5xl tracking-tight mt-4 text-gradient leading-[1.1] pb-1">Zuya</h1>
        <p className="label mt-1">Yavuz &amp; Züleyha</p>

        {!who && (
          <>
            <p className="text-muted text-sm mt-6">Who are you?</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {ZUYA_USERNAMES.map((u) => (
                <button
                  key={u}
                  onClick={() => pickName(u)}
                  className="rounded-2xl px-4 py-6 border border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--accent)] hover:bg-[var(--paper-2)] transition"
                >
                  <span className="block text-2xl font-display text-ink">
                    {ZUYA_DISPLAY_NAMES[u]}
                  </span>
                  {registered[u] === false && (
                    <span className="label mt-1 block text-accent">first visit</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {who && (
          <form onSubmit={submit} className="mt-6 space-y-3 text-left">
            <button
              type="button"
              onClick={() => setWho(null)}
              className="label inline-flex items-center gap-1 hover:text-ink"
            >
              <ArrowLeft className="h-3 w-3" /> not {ZUYA_DISPLAY_NAMES[who]}?
            </button>

            <p className="text-sm text-ink-soft">
              {isFirstTime ? (
                <>Set a password for <b>{ZUYA_DISPLAY_NAMES[who]}</b>. You&apos;ll use it from now on.</>
              ) : (
                <>Enter your password, <b>{ZUYA_DISPLAY_NAMES[who]}</b>.</>
              )}
            </p>

            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                required
                minLength={1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isFirstTime ? "Choose a password" : "Your password"}
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
                minLength={1}
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

            {/* Escape hatches — always available, never gated on the status hint. */}
            <div className="flex items-center justify-between pt-1">
              {!isFirstTime ? (
                <button
                  type="button"
                  onClick={() => setFirstTimeToggle(true)}
                  className="text-[12px] text-muted hover:text-ink transition"
                >
                  First time? Set a password
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={startOver}
                disabled={resetting}
                className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-down transition disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" />
                {resetting ? "resetting…" : "Start over"}
              </button>
            </div>
          </form>
        )}

        {msg && <p className="text-[13px] text-down mt-4 text-left">{msg}</p>}
      </div>
    </main>
  );
}
