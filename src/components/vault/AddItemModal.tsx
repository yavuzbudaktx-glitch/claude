"use client";

import { useState } from "react";
import { Folder, Link2, FileText, KeyRound } from "lucide-react";
import type { VaultItem, VaultKind } from "@/lib/vault/types";

type AddKind = Exclude<VaultKind, "file">;

const LABELS: Record<AddKind, string> = {
  folder: "New folder",
  link: "Save link",
  note: "New note",
  secret: "New password",
};

const ICONS: Record<AddKind, { Icon: typeof Folder; cls: string }> = {
  folder: { Icon: Folder, cls: "vault-icon-folder" },
  link: { Icon: Link2, cls: "vault-icon-link" },
  note: { Icon: FileText, cls: "vault-icon-note" },
  secret: { Icon: KeyRound, cls: "vault-icon-secret" },
};

type SecretFields = { username?: string; password?: string; notes?: string };
function parseSecret(blob: string | null): SecretFields {
  if (!blob) return {};
  try { return JSON.parse(blob) as SecretFields; } catch { return {}; }
}

// Create OR edit a non-file item. Pass `edit` to prefill and switch to PATCH.
// `hidden` marks new items as part of the private vault.
export function AddItemModal({
  kind,
  parentId,
  hidden = false,
  edit,
  onSaved,
  onClose,
}: {
  kind: AddKind;
  parentId: string | null;
  hidden?: boolean;
  edit?: VaultItem;
  onSaved: (item: VaultItem) => void;
  onClose: () => void;
}) {
  const editSecret = edit ? parseSecret(edit.secret_ciphertext) : {};
  const [title, setTitle] = useState(edit ? decode(edit.title) : "");
  const [url, setUrl] = useState(edit?.url ?? "");
  const [body, setBody] = useState(edit ? (kind === "secret" ? editSecret.notes ?? "" : edit.body ?? "") : "");
  const [username, setUsername] = useState(editSecret.username ?? "");
  const [password, setPassword] = useState(editSecret.password ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function decode(t: string) { try { return decodeURIComponent(t); } catch { return t; } }

  async function submit() {
    setErr("");
    if (!title.trim()) return setErr("Title is required.");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { title: title.trim() };
      if (kind === "link") {
        let u = url.trim();
        if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
        payload.url = u;
      }
      if (kind === "note") payload.body = body;
      if (kind === "secret") {
        payload.secret_ciphertext = JSON.stringify({ username: username.trim(), password, notes: body.trim() });
      }

      let res: Response;
      if (edit) {
        res = await fetch(`/api/vault/items/${edit.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/vault/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, kind, parent_id: parentId, hidden }),
        });
      }
      const json = await res.json();
      if (!res.ok || !json.item) return setErr(json.error || "Could not save.");
      onSaved(json.item);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const { Icon, cls } = ICONS[kind];
  const heading = edit ? `Edit ${kind === "secret" ? "password" : kind}` : LABELS[kind];

  return (
    <div className="vault-modal-backdrop" onClick={onClose}>
      <div className="vault-modal" onClick={(e) => e.stopPropagation()}>
        <h3><Icon size={16} className={cls} /> {heading}</h3>

        <div className="vault-field">
          <label className="vault-label">{kind === "secret" ? "Label" : "Title"}</label>
          <input
            autoFocus
            className="vault-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && kind !== "note" && kind !== "secret" && submit()}
            placeholder={kind === "link" ? "e.g. Supabase dashboard" : "Name"}
          />
        </div>

        {kind === "link" && (
          <div className="vault-field">
            <label className="vault-label">URL</label>
            <input
              className="vault-input vault-mono"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="https://…"
            />
          </div>
        )}

        {kind === "secret" && (
          <>
            <div className="vault-field">
              <label className="vault-label">Username / email</label>
              <input className="vault-input vault-mono" value={username}
                onChange={(e) => setUsername(e.target.value)} placeholder="optional" />
            </div>
            <div className="vault-field">
              <label className="vault-label">Password</label>
              <input className="vault-input vault-mono" type="text" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="secret" />
            </div>
          </>
        )}

        {(kind === "note" || kind === "secret") && (
          <div className="vault-field">
            <label className="vault-label">{kind === "secret" ? "Notes" : "Body"}</label>
            <textarea className="vault-textarea" value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={kind === "secret" ? "optional" : "Write something…"} />
          </div>
        )}

        {err && <p style={{ color: "var(--v-danger)", fontSize: 12, marginBottom: 10 }}>{err}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button className="vault-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="vault-btn vault-btn-primary" onClick={submit} disabled={busy}>
            {busy ? "…" : edit ? "Save changes" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
