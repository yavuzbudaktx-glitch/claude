"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";

// A light passcode gate. This page is not linked from anywhere in the app —
// you reach it by knowing the URL, and then you enter this code. The check
// is client-side (this is a personal motivation page, not a vault), and the
// unlock is kept in sessionStorage so a new browser session asks again.
const PASSCODE = "3582";
const KEY = "nofap.unlocked";

export function NofapGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) === "1") setUnlocked(true);
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && !unlocked) inputRef.current?.focus();
  }, [ready, unlocked]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() === PASSCODE) {
      try { sessionStorage.setItem(KEY, "1"); } catch {}
      setUnlocked(true);
    } else {
      setError(true);
      setValue("");
    }
  };

  // Avoid flashing either the lock screen or the content before we know.
  if (!ready) return null;
  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-[100dvh] grid place-items-center px-6">
      <form onSubmit={submit} className="card w-full max-w-sm flex flex-col items-center gap-5 py-10 text-center">
        <div className="h-12 w-12 rounded-full grid place-items-center" style={{ background: "var(--paper-2)" }}>
          <Lock className="h-5 w-5 text-accent" />
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-2xl text-ink">Locked</h1>
          <p className="text-[13px] text-muted">
            Enter the code. If you don&apos;t know it, you&apos;re not meant to be here.
          </p>
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Passcode"
          placeholder="••••"
          className={`w-40 text-center tracking-[0.5em] font-display text-2xl rounded-xl border bg-[var(--paper)] px-3 py-2.5 text-ink outline-none transition ${
            error ? "border-[var(--down)]" : "border-[var(--glass-border)] focus:border-[var(--accent)]"
          }`}
        />
        {error && <p className="text-[12px] text-down -mt-2">Wrong code.</p>}
        <button
          type="submit"
          className="w-full rounded-xl py-2.5 text-white font-semibold text-[15px] hover:opacity-90 active:scale-[0.98] transition"
          style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))" }}
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
