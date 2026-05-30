"use client";

import { useState } from "react";
import { Copy, Check, Eye, EyeOff, KeyRound } from "lucide-react";
import type { VaultItem } from "@/lib/vault/types";

type SecretFields = { username?: string; password?: string; notes?: string };

function parse(blob: string | null): SecretFields {
  if (!blob) return {};
  try { return JSON.parse(blob) as SecretFields; } catch { return {}; }
}

// Displays a stored secret. Access is gated by the account login; the password
// stays masked behind a show/hide toggle and offers copy-to-clipboard.
export function SecretModal({ item, onClose }: { item: VaultItem; onClose: () => void }) {
  const fields = parse(item.secret_ciphertext);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState<string>("");

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

  const empty = !fields.username && !fields.password && !fields.notes;

  return (
    <div className="vault-modal-backdrop" onClick={onClose}>
      <div className="vault-modal" onClick={(e) => e.stopPropagation()}>
        <h3><KeyRound size={15} className="vault-icon-secret" /> {item.title}</h3>
        {empty && <p style={{ color: "var(--v-muted)", fontSize: 13 }}>Nothing stored.</p>}
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
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <button className="vault-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
