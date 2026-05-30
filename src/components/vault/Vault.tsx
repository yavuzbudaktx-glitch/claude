"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Folder, Link2, FileText, KeyRound, File as FileIcon, Upload, Plus,
  Trash2, ExternalLink, Download, Eye, ChevronRight, LayoutDashboard,
} from "lucide-react";
import type { VaultItem, VaultKind } from "@/lib/vault/types";
import { formatSize } from "@/lib/vault/types";
import { AddItemModal } from "./AddItemModal";
import { SecretModal } from "./SecretModal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type AddKind = Exclude<VaultKind, "file">;

const KIND_ICON: Record<VaultKind, typeof Folder> = {
  folder: Folder, link: Link2, note: FileText, secret: KeyRound, file: FileIcon,
};
const KIND_CLASS: Record<VaultKind, string> = {
  folder: "vault-icon-folder", link: "vault-icon-link", note: "vault-icon-note",
  secret: "vault-icon-secret", file: "vault-icon-file",
};

export function Vault() {
  const { data, mutate } = useSWR<{ items: VaultItem[] }>("/api/vault/items", fetcher);

  const items = useMemo(() => data?.items ?? [], [data]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const [parent, setParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Modals
  const [addKind, setAddKind] = useState<AddKind | null>(null);
  const [viewSecret, setViewSecret] = useState<VaultItem | null>(null);
  const [viewNote, setViewNote] = useState<VaultItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    return items
      .filter((i) => i.parent_id === parent)
      .sort((a, b) => (a.kind === "folder" ? -1 : 1) - (b.kind === "folder" ? -1 : 1) || a.title.localeCompare(b.title));
  }, [items, parent]);

  // Breadcrumb chain from root to current folder.
  const crumbs = useMemo(() => {
    const chain: VaultItem[] = [];
    let cur = parent ? byId.get(parent) : null;
    while (cur) { chain.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) ?? null : null; }
    return chain;
  }, [parent, byId]);

  // Insert a freshly-created item into the cache immediately so it shows without
  // waiting for a refetch, then revalidate in the background.
  function addToCache(item: VaultItem) {
    mutate(
      (cur) => ({ items: [...(cur?.items ?? []), item] }),
      { revalidate: true },
    );
  }

  function startAdd(kind: AddKind) {
    setMenuOpen(false);
    setAddKind(kind);
  }

  async function onUploadFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const res = await fetch("/api/vault/upload", {
          method: "POST",
          headers: {
            "x-title": encodeURIComponent(file.name),
            "x-mime": file.type || "application/octet-stream",
            "x-parent": parent ?? "null",
          },
          body: await file.arrayBuffer(),
        });
        const json = await res.json().catch(() => null);
        if (json?.item) addToCache(json.item);
      }
      await mutate();
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
      setMenuOpen(false);
    }
  }

  async function openFile(item: VaultItem, inline: boolean) {
    const res = await fetch(`/api/vault/download?id=${item.id}${inline ? "&inline=1" : ""}`)
      .then((r) => r.json());
    if (res.url) window.open(res.url, "_blank");
  }

  async function remove(item: VaultItem) {
    const what = item.kind === "folder" ? "folder and everything in it" : "item";
    if (!confirm(`Delete this ${what}?`)) return;
    // Optimistically drop it (and any children) from the cache.
    mutate(
      (cur) => ({
        items: (cur?.items ?? []).filter((i) => i.id !== item.id && i.parent_id !== item.id),
      }),
      { revalidate: false },
    );
    await fetch(`/api/vault/items/${item.id}`, { method: "DELETE" });
    await mutate();
  }

  function decodeTitle(t: string) {
    try { return decodeURIComponent(t); } catch { return t; }
  }

  return (
    <div className="vault-scope">
      <div className="vault-shell">
        {/* top bar */}
        <div className="vault-topbar">
          <span className="vault-title"><span className="vault-dot" />The Vault</span>
          <span className="vault-chip">{items.length} items</span>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <button
                className="vault-btn vault-btn-primary"
                onClick={() => setMenuOpen((m) => !m)}
                disabled={busy}
              >
                <Plus size={14} /> {busy ? "Uploading…" : "New"}
              </button>
              {menuOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setMenuOpen(false)} />
                  <div className="vault-menu">
                    <button onClick={() => startAdd("folder")}><Folder size={15} className="vault-icon-folder" /> Folder</button>
                    <button onClick={() => startAdd("link")}><Link2 size={15} className="vault-icon-link" /> Link</button>
                    <button onClick={() => startAdd("note")}><FileText size={15} className="vault-icon-note" /> Note</button>
                    <button onClick={() => startAdd("secret")}><KeyRound size={15} className="vault-icon-secret" /> Password</button>
                    <button onClick={() => fileInput.current?.click()}><Upload size={15} className="vault-icon-file" /> Upload file</button>
                  </div>
                </>
              )}
            </div>
            <Link href="/" className="vault-btn" title="Back to dashboard">
              <LayoutDashboard size={14} />
            </Link>
          </div>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={onUploadFiles} />
        </div>

        {/* breadcrumbs */}
        <div className="vault-crumbs">
          <button onClick={() => setParent(null)}>~/vault</button>
          {crumbs.map((c) => (
            <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <ChevronRight size={12} />
              <button onClick={() => setParent(c.id)}>{c.title}</button>
            </span>
          ))}
        </div>

        {/* grid */}
        <div className="vault-grid">
          {visible.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <div key={item.id} className="vault-item">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon size={16} className={KIND_CLASS[item.kind]} />
                  <span className="vault-item-kind">{item.kind}</span>
                </div>

                {item.kind === "folder" ? (
                  <button
                    className="vault-item-title"
                    style={{ textAlign: "left", cursor: "pointer" }}
                    onClick={() => setParent(item.id)}
                  >
                    {item.title}
                  </button>
                ) : (
                  <span className="vault-item-title">{decodeTitle(item.title)}</span>
                )}

                {item.kind === "link" && item.url && (
                  <span className="vault-item-sub">{item.url.replace(/^https?:\/\//, "")}</span>
                )}
                {item.kind === "note" && item.body && (
                  <span className="vault-item-sub" style={{ fontFamily: "Inter", color: "var(--v-muted)" }}>
                    {item.body.slice(0, 60)}{item.body.length > 60 ? "…" : ""}
                  </span>
                )}
                {item.kind === "file" && item.size > 0 && (
                  <span className="vault-item-sub">{formatSize(item.size)}</span>
                )}
                {item.kind === "secret" && (
                  <span className="vault-item-sub" style={{ color: "var(--v-muted)" }}>•••••••••</span>
                )}

                {/* actions */}
                <div className="vault-item-actions">
                  {item.kind === "link" && item.url && (
                    <a href={item.url} target="_blank" rel="noreferrer" title="Open"><ExternalLink size={15} /></a>
                  )}
                  {item.kind === "secret" && (
                    <button onClick={() => setViewSecret(item)} title="Reveal"><Eye size={15} /></button>
                  )}
                  {item.kind === "note" && (
                    <button onClick={() => setViewNote(item)} title="Open"><Eye size={15} /></button>
                  )}
                  {item.kind === "file" && (
                    <>
                      {item.mime?.startsWith("image/") && (
                        <button onClick={() => openFile(item, true)} title="Preview"><Eye size={15} /></button>
                      )}
                      <button onClick={() => openFile(item, false)} title="Download"><Download size={15} /></button>
                    </>
                  )}
                  <button className="vault-act-danger" style={{ marginLeft: "auto" }} onClick={() => remove(item)} title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}

          {visible.length === 0 && (
            <div className="vault-empty">
              empty — hit New to add a link, note, password or file.
            </div>
          )}
        </div>
      </div>

      {/* modals */}
      {addKind && (
        <AddItemModal
          kind={addKind}
          parentId={parent}
          onCreated={addToCache}
          onClose={() => setAddKind(null)}
        />
      )}
      {viewNote && <NoteModal item={viewNote} onClose={() => setViewNote(null)} />}
      {viewSecret && <SecretModal item={viewSecret} onClose={() => setViewSecret(null)} />}
    </div>
  );
}

// Lightweight inline note reader.
function NoteModal({ item, onClose }: { item: VaultItem; onClose: () => void }) {
  return (
    <div className="vault-modal-backdrop" onClick={onClose}>
      <div className="vault-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{item.title}</h3>
        <div className="vault-input" style={{ whiteSpace: "pre-wrap", minHeight: 120, fontFamily: "Inter" }}>
          {item.body || <span style={{ color: "var(--v-muted)" }}>Empty note.</span>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button className="vault-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
