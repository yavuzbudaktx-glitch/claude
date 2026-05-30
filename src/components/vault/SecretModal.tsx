"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Eye, EyeOff } from "lucide-react";
import type { VaultItem } from "@/lib/vault/types";
import { decryptSecret, type SecretFields } from "@/lib/vault/crypto";

// Decrypts and displays a secret using the in-memory master key. The plaintext
// exists only here, in component state, for as long as the modal is open.
export function SecretModal({
  item,
  masterKey,
  onClose,
}: {
  item: VaultItem;
  masterKey: CryptoKey;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<SecretFields | null>(null);
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!item.secret_ciphertext) return setErr("Empty secret.");
        const f = await decryptSecret(masterKey, item.secret_ciphertext);
        if (alive) setFields(f);
      } catch {
        if (alive) setErr("Could not decrypt with this master password.");
      }
    })();
    return () => { alive = false; };
  }, [item, masterKey]);

  function copy(label: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1200);
  }

  function Row({ label, value, mask }: { label: string; value: string; mask?: boolean }) {
    if (!value) return null;
    return (
      <div className="vault-field">
        <label className="vault-label">{label}</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            readOnly
            className="vault-input vault-mono"
            type={mask && !show ? "password" : "text"}
            value={value}
          />
          {mask && (
            <button className="vault-btn" onClick={() => setShow((s) => !s)} title="Show/hide">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
          <button className="vault-btn" onClick={() => copy(label, value)} title="Copy">
            {copied === label ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vault-modal-backdrop" onClick={onClose}>
      <div className="vault-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{item.title}</h3>
        {err && <p style={{ color: "var(--v-danger)", fontSize: 12 }}>{err}</p>}
        {!fields && !err && (
          <p style={{ color: "var(--v-muted)", fontSize: 13 }}>Decrypting…</p>
        )}
        {fields && (
          <>
            <Row label="Username" value={fields.username ?? ""} />
            <Row label="Password" value={fields.password ?? ""} mask />
            {fields.notes ? (
              <div className="vault-field">
                <label className="vault-label">Notes</label>
                <div className="vault-input vault-mono" style={{ whiteSpace: "pre-wrap" }}>
                  {fields.notes}
                </div>
              </div>
            ) : null}
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <button className="vault-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
