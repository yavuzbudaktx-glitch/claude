"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { makeVerifier, unlock } from "@/lib/vault/crypto";

// Master-password gate. Two modes:
//  - setup (no key on the account yet): choose a master password, which is
//    confirmed and persisted as {salt, verifier}.
//  - unlock (key exists): enter the master password; verified against the salt.
// On success, the derived CryptoKey is handed back to the parent (memory only).
export function UnlockModal({
  exists,
  salt,
  verifier,
  onUnlocked,
  onClose,
}: {
  exists: boolean;
  salt?: string;
  verifier?: string;
  onUnlocked: (key: CryptoKey) => void;
  onClose: () => void;
}) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (pw.length < 8) return setErr("Use at least 8 characters.");
    setBusy(true);
    try {
      if (exists) {
        const key = await unlock(pw, salt!, verifier!);
        if (!key) return setErr("Wrong master password.");
        onUnlocked(key);
      } else {
        if (pw !== pw2) return setErr("Passwords don't match.");
        const made = await makeVerifier(pw);
        const res = await fetch("/api/vault/key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(made),
        });
        if (!res.ok) return setErr("Could not save master password.");
        const key = await unlock(pw, made.salt, made.verifier);
        if (key) onUnlocked(key);
      }
    } catch {
      setErr("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vault-modal-backdrop" onClick={onClose}>
      <div className="vault-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2">
          <ShieldCheck size={15} className="vault-icon-secret" />
          {exists ? "Unlock vault" : "Set master password"}
        </h3>

        {!exists && (
          <p style={{ fontSize: 12, color: "var(--v-muted)", marginBottom: 14, lineHeight: 1.5 }}>
            This encrypts your passwords in your browser. It is never sent to the
            server and <strong>cannot be recovered</strong> if forgotten.
          </p>
        )}

        <div className="vault-field">
          <label className="vault-label">Master password</label>
          <input
            autoFocus
            type="password"
            className="vault-input"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && exists && submit()}
            placeholder="••••••••"
          />
        </div>

        {!exists && (
          <div className="vault-field">
            <label className="vault-label">Confirm</label>
            <input
              type="password"
              className="vault-input"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
            />
          </div>
        )}

        {err && <p style={{ color: "var(--v-danger)", fontSize: 12, marginBottom: 10 }}>{err}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button className="vault-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="vault-btn vault-btn-primary" onClick={submit} disabled={busy}>
            {busy ? "…" : exists ? "Unlock" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
