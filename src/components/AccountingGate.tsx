"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lock, ArrowLeft } from "lucide-react";

// Lightweight passcode gate for the Accounting page. This is a soft lock — a
// deterrent, not real security (the passcode lives in the client bundle and a
// determined user could bypass it). It keeps the page from rendering its
// widgets until unlocked, and remembers the unlock for the browser session.
const SESSION_KEY = "brief.accounting.unlocked";
const PASSCODE = "3582";

export function AccountingGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { setUnlocked(sessionStorage.getItem(SESSION_KEY) === "1"); } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready && !unlocked) inputRef.current?.focus();
  }, [ready, unlocked]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (val === PASSCODE) {
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
      setUnlocked(true);
    } else {
      setErr(true);
      setVal("");
    }
  }

  if (!ready) return null; // avoid a flash of either state before we know
  if (unlocked) return <>{children}</>;

  return (
    <main className="min-h-[100dvh] grid place-items-center px-5">
      <div className="w-full max-w-sm card animate-fadeIn text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))" }}>
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl tracking-tight text-ink">Accounting is locked</h1>
        <p className="mt-1.5 text-[13px] text-muted">Enter the passcode to continue.</p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={val}
            onChange={(e) => { setVal(e.target.value); setErr(false); }}
            placeholder="••••"
            className={`w-full text-center tracking-[0.5em] font-mono text-2xl rounded-xl bg-[var(--rule-soft)] py-3 text-ink focus:outline-none focus:ring-2 transition ${err ? "ring-2 ring-[var(--down)]" : "focus:ring-[var(--accent)]"}`}
            aria-label="Passcode"
          />
          {err && <p className="text-[12px] text-down">Wrong passcode — try again.</p>}
          <button type="submit" className="btn-primary w-full">
            Unlock
          </button>
        </form>

        <Link href="/dashboard" className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink transition">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
      </div>
    </main>
  );
}
