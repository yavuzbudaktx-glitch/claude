"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, ShieldPlus } from "lucide-react";

// PIN gate for the private vault. Two modes:
//  - exists=false → set up a new PIN (asks twice to confirm).
//  - exists=true  → enter the PIN to unlock; verified server-side.
// On success the parent receives the verified PIN (kept in memory for the
// session so private items can be created/fetched).
export function PinModal({
  exists,
  onUnlocked,
  onClose,
}: {
  exists: boolean;
  onUnlocked: (pin: string) => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [stage]);

  const active = stage === "confirm" ? confirm : pin;
  const dots = Array.from({ length: Math.max(4, active.length) });

  async function finish(value: string) {
    setBusy(true);
    setErr("");
    try {
      if (exists) {
        const res = await fetch("/api/vault/private", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pin: value }),
        });
        const json = await res.json();
        if (json.unlocked) onUnlocked(value);
        else { setErr("Incorrect PIN."); setPin(""); }
      } else {
        const res = await fetch("/api/vault/private", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pin: value }),
        });
        const json = await res.json();
        if (res.ok) onUnlocked(value);
        else { setErr(json.error || "Could not set PIN."); setPin(""); setConfirm(""); setStage("enter"); }
      }
    } finally {
      setBusy(false);
    }
  }

  function onChange(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 12);
    setErr("");
    if (stage === "confirm") {
      setConfirm(digits);
    } else {
      setPin(digits);
    }
  }

  function submit() {
    if (busy) return;
    if (exists) {
      if (pin.length < 4) return setErr("Enter your PIN.");
      finish(pin);
      return;
    }
    // setup flow
    if (stage === "enter") {
      if (pin.length < 4) return setErr("PIN must be at least 4 digits.");
      setStage("confirm");
      return;
    }
    if (confirm !== pin) { setErr("PINs don't match."); setConfirm(""); return; }
    finish(pin);
  }

  return (
    <div className="vault-modal-backdrop" onClick={onClose}>
      <div className="vault-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <h3>
          {exists ? <Lock size={16} className="vault-icon-secret" /> : <ShieldPlus size={16} className="vault-icon-secret" />}
          {exists ? "Unlock private vault" : stage === "enter" ? "Create a private PIN" : "Confirm your PIN"}
        </h3>

        {!exists && stage === "enter" && (
          <p style={{ fontSize: 12.5, color: "var(--v-muted)", marginBottom: 14, lineHeight: 1.5 }}>
            Pick a 4–12 digit PIN. Type it in the search bar any time to reveal your hidden items.
          </p>
        )}

        <div className="vault-pin">
          {dots.map((_, i) => <span key={i} className={i < active.length ? "on" : ""} />)}
        </div>

        <input
          ref={inputRef}
          className="vault-input vault-mono"
          style={{ textAlign: "center", letterSpacing: "0.4em", fontSize: 18 }}
          type="password"
          inputMode="numeric"
          value={active}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••"
        />

        {err && <p style={{ color: "var(--v-danger)", fontSize: 12, marginTop: 10, textAlign: "center" }}>{err}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="vault-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="vault-btn vault-btn-primary" onClick={submit} disabled={busy}>
            {busy ? "…" : exists ? "Unlock" : stage === "enter" ? "Next" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
