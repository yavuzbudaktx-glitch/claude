"use client";

import { useState } from "react";
import { Folder, Link2, FileText, KeyRound } from "lucide-react";
import type { VaultKind } from "@/lib/vault/types";

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

// Create-item dialog for folder | link | note | secret. Secrets are stored as a
// JSON blob (username/password/notes) in secret_ciphertext; access is gated by
// the user's login, so no separate master-password encryption is used.
export function AddItemModal({
  kind,
  parentId,
  onCreated,
  onClose,
}: {
  kind: AddKind;
  parentId: string | null;
  onCreated: (item: import("@/lib/vault/types").VaultItem) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (!title.trim()) return setErr("Title is required.");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { kind, parent_id: parentId, title: title.trim() };
      if (kind === "link") {
        let u = url.trim();
        if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
        payload.url = u;
      }
      if (kind === "note") payload.body = body;
      if (kind === "secret") {
        payload.secret_ciphertext = JSON.stringify({
          username: username.trim(),
          password,
          notes: body.trim(),
        });
      }
      const res = await fetch("/api/vault/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.item) return setErr(json.error || "Could not save.");
      onCreated(json.item);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vault-modal-backdrop" onClick={onClose}>
      <div className="vault-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {(() => { const { Icon, cls } = ICONS[kind]; return <Icon size={15} className={cls} />; })()}
          {LABELS[kind]}
        </h3>

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
              <input
                className="vault-input vault-mono"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="vault-field">
              <label className="vault-label">Password</label>
              <input
                className="vault-input vault-mono"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="secret"
              />
            </div>
          </>
        )}

        {(kind === "note" || kind === "secret") && (
          <div className="vault-field">
            <label className="vault-label">{kind === "secret" ? "Notes" : "Body"}</label>
            <textarea
              className="vault-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={kind === "secret" ? "optional" : "Write something…"}
            />
          </div>
        )}

        {err && <p style={{ color: "var(--v-danger)", fontSize: 12, marginBottom: 10 }}>{err}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button className="vault-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="vault-btn vault-btn-primary" onClick={submit} disabled={busy}>
            {busy ? "…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
