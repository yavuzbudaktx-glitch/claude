"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  Folder, Link2, FileText, KeyRound, File as FileIcon,
  Upload, Plus, Trash2, ExternalLink, Download, Eye, ChevronRight,
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
const KIND_CARD: Record<VaultKind, string> = {
  folder: "vault-k-folder", link: "vault-k-link", note: "vault-k-note",
  secret: "vault-k-secret", file: "vault-k-file",
};

export function Vault() {
  const { data, mutate } = useSWR<{ items: VaultItem[] }>("/api/vault/items", fetcher);

  const items = useMemo(() => data?.items ?? [], [data]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const [parent, setParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addKind, setAddKind] = useState<AddKind | null>(null);
  const [viewSecret, setViewSecret] = useState<VaultItem | null>(null);
  const [viewNote, setViewNote] = useState<VaultItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Drag state: id of the item being dragged, and the folder currently hovered
  // as a drop target (or "root" for the breadcrumb / empty page).
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pageDrop, setPageDrop] = useState(false);

  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const inFolder = useMemo(() => items.filter((i) => i.parent_id === parent), [items, parent]);
  const folders = useMemo(
    () => inFolder.filter((i) => i.kind === "folder").sort((a, b) => a.title.localeCompare(b.title)),
    [inFolder],
  );
  const things = useMemo(
    () => inFolder.filter((i) => i.kind !== "folder").sort((a, b) => a.title.localeCompare(b.title)),
    [inFolder],
  );

  useEffect(() => {
    const imgs = things.filter((i) => i.kind === "file" && i.mime?.startsWith("image/") && !thumbs[i.id]);
    if (!imgs.length) return;
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        imgs.map(async (i) => {
          const res = await fetch(`/api/vault/download?id=${i.id}&inline=1`).then((r) => r.json()).catch(() => null);
          return [i.id, res?.url as string | undefined] as const;
        }),
      );
      if (!alive) return;
      setThumbs((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
    })();
    return () => { alive = false; };
  }, [things, thumbs]);

  const crumbs = useMemo(() => {
    const chain: VaultItem[] = [];
    let cur = parent ? byId.get(parent) : null;
    while (cur) { chain.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) ?? null : null; }
    return chain;
  }, [parent, byId]);

  function addToCache(item: VaultItem) {
    mutate((cur) => ({ items: [...(cur?.items ?? []), item] }), { revalidate: true });
  }

  function startAdd(kind: AddKind) {
    setMenuOpen(false);
    setAddKind(kind);
  }

  // Upload one or more browser File objects into a target folder (or root).
  async function uploadFiles(files: File[], targetParent: string | null) {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const res = await fetch("/api/vault/upload", {
          method: "POST",
          headers: {
            "x-title": encodeURIComponent(file.name),
            "x-mime": file.type || "application/octet-stream",
            "x-parent": targetParent ?? "null",
          },
          body: await file.arrayBuffer(),
        });
        const json = await res.json().catch(() => null);
        if (json?.item) addToCache(json.item);
      }
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (fileInput.current) fileInput.current.value = "";
    setMenuOpen(false);
    await uploadFiles(files, parent);
  }

  // Move an existing item into a folder (or to root) by updating parent_id.
  async function moveItem(id: string, targetParent: string | null) {
    if (id === targetParent) return;
    const item = byId.get(id);
    if (!item || item.parent_id === targetParent) return;
    // Prevent dropping a folder into itself / its own descendant.
    if (item.kind === "folder" && targetParent) {
      let p: string | null = targetParent;
      while (p) {
        if (p === id) return;
        p = byId.get(p)?.parent_id ?? null;
      }
    }
    mutate(
      (cur) => ({
        items: (cur?.items ?? []).map((i) => (i.id === id ? { ...i, parent_id: targetParent } : i)),
      }),
      { revalidate: false },
    );
    await fetch(`/api/vault/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parent_id: targetParent }),
    });
    await mutate();
  }

  async function openFile(item: VaultItem, inline: boolean) {
    const res = await fetch(`/api/vault/download?id=${item.id}${inline ? "&inline=1" : ""}`).then((r) => r.json());
    if (res.url) window.open(res.url, "_blank");
  }

  async function remove(item: VaultItem) {
    const what = item.kind === "folder" ? "folder and everything in it" : "item";
    if (!confirm(`Delete this ${what}?`)) return;
    mutate(
      (cur) => ({ items: (cur?.items ?? []).filter((i) => i.id !== item.id && i.parent_id !== item.id) }),
      { revalidate: false },
    );
    await fetch(`/api/vault/items/${item.id}`, { method: "DELETE" });
    await mutate();
  }

  function decodeTitle(t: string) {
    try { return decodeURIComponent(t); } catch { return t; }
  }

  // ---- drag/drop handlers ----
  // A drop target accepts both internal item moves and OS file drops.
  function onDropInto(targetParent: string | null, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    setPageDrop(false);
    const dropped = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (dropped.length) {
      uploadFiles(dropped, targetParent);
    } else if (draggingId) {
      moveItem(draggingId, targetParent);
    }
    setDraggingId(null);
  }

  function renderItem(item: VaultItem) {
    const Icon = KIND_ICON[item.kind];
    const isImg = item.kind === "file" && item.mime?.startsWith("image/");
    const isFolder = item.kind === "folder";
    const isDropHover = dropTarget === item.id && isFolder;
    return (
      <div
        key={item.id}
        className={`vault-item ${KIND_CARD[item.kind]}${isDropHover ? " vault-item-drophover" : ""}${draggingId === item.id ? " vault-item-dragging" : ""}`}
        draggable
        onDragStart={(e) => { setDraggingId(item.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
        onDragOver={isFolder ? (e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(item.id); } : undefined}
        onDragLeave={isFolder ? () => setDropTarget((t) => (t === item.id ? null : t)) : undefined}
        onDrop={isFolder ? (e) => onDropInto(item.id, e) : undefined}
      >
        <div className="vault-item-head">
          <span className="vault-item-iconwrap"><Icon size={15} className={KIND_CLASS[item.kind]} /></span>
          <span className="vault-item-kind">{item.kind}</span>
        </div>

        {isFolder ? (
          <button className="vault-item-title vault-item-title-btn" onClick={() => setParent(item.id)}>
            {item.title}
          </button>
        ) : (
          <span className="vault-item-title">{decodeTitle(item.title)}</span>
        )}

        {isImg && thumbs[item.id] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbs[item.id]} alt={decodeTitle(item.title)} className="vault-thumb" draggable={false} />
        )}

        {item.kind === "link" && item.url && (
          <span className="vault-item-sub">{item.url.replace(/^https?:\/\//, "")}</span>
        )}
        {item.kind === "note" && item.body && (
          <span className="vault-item-sub" style={{ fontFamily: "Inter", color: "var(--v-muted)" }}>
            {item.body.slice(0, 80)}{item.body.length > 80 ? "…" : ""}
          </span>
        )}
        {item.kind === "file" && !isImg && item.size > 0 && (
          <span className="vault-item-sub">{formatSize(item.size)}</span>
        )}
        {item.kind === "secret" && (
          <span className="vault-item-sub" style={{ color: "var(--v-muted)", letterSpacing: "0.15em" }}>••••••••••</span>
        )}

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
              {isImg && <button onClick={() => openFile(item, true)} title="Preview"><Eye size={15} /></button>}
              <button onClick={() => openFile(item, false)} title="Download"><Download size={15} /></button>
            </>
          )}
          <button className="vault-act-danger" style={{ marginLeft: "auto" }} onClick={() => remove(item)} title="Delete">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  }

  const empty = folders.length === 0 && things.length === 0;

  return (
    <div
      className={`vault-scope${pageDrop ? " vault-page-drop" : ""}`}
      onDragOver={(e) => {
        // Allow dropping onto blank page area = current folder. Only show the
        // page overlay for OS file drags, not internal moves.
        if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setPageDrop(true); }
      }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setPageDrop(false); }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) onDropInto(parent, e); }}
    >
      <div className="vault-shell">
        {/* top bar */}
        <div className="vault-topbar">
          <div className="vault-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/doc-anywhere-logo.png" alt="Doc Anywhere" className="vault-logo-img" />
            <span className="vault-title">
              Doc Anywhere
              <span className="vault-sub">Personal Vault</span>
            </span>
          </div>
          <span className="vault-chip"><b>{items.length}</b> items</span>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <button className="vault-btn vault-btn-primary" onClick={() => setMenuOpen((m) => !m)} disabled={busy}>
                <Plus size={15} /> {busy ? "Working…" : "New"}
              </button>
              {menuOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setMenuOpen(false)} />
                  <div className="vault-menu">
                    <button onClick={() => startAdd("folder")}><Folder size={15} className="vault-icon-folder" /> New folder</button>
                    <button onClick={() => startAdd("link")}><Link2 size={15} className="vault-icon-link" /> Save link</button>
                    <button onClick={() => startAdd("note")}><FileText size={15} className="vault-icon-note" /> Write note</button>
                    <button onClick={() => startAdd("secret")}><KeyRound size={15} className="vault-icon-secret" /> Add password</button>
                    <button onClick={() => fileInput.current?.click()}><Upload size={15} className="vault-icon-file" /> Upload file</button>
                  </div>
                </>
              )}
            </div>
          </div>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={onPickFiles} />
        </div>

        {/* breadcrumbs — each crumb is a drop target to move items up a level */}
        <div className="vault-crumbs">
          <button
            onClick={() => setParent(null)}
            className={`${parent ? "" : "vault-crumb-cur"}${dropTarget === "__root__" ? " vault-crumb-drop" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDropTarget("__root__"); }}
            onDragLeave={() => setDropTarget((t) => (t === "__root__" ? null : t))}
            onDrop={(e) => onDropInto(null, e)}
          >
            ~/doc-anywhere
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ChevronRight size={12} />
              <button
                onClick={() => setParent(c.id)}
                className={`${i === crumbs.length - 1 ? "vault-crumb-cur" : ""}${dropTarget === c.id ? " vault-crumb-drop" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDropTarget(c.id); }}
                onDragLeave={() => setDropTarget((t) => (t === c.id ? null : t))}
                onDrop={(e) => onDropInto(c.id, e)}
              >
                {c.title}
              </button>
            </span>
          ))}
        </div>

        {/* grid */}
        <div className="vault-grid">
          {folders.length > 0 && <div className="vault-sectionlabel">Folders</div>}
          {folders.map(renderItem)}
          {things.length > 0 && <div className="vault-sectionlabel">Items</div>}
          {things.map(renderItem)}

          {empty && (
            <div className="vault-empty">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/doc-anywhere-logo.png" alt="" className="vault-empty-logo" />
              Drop files here, or hit <b style={{ color: "var(--v-ink-soft)" }}>New</b> to add a link, note, password or folder.
            </div>
          )}
        </div>
      </div>

      {/* full-page drop hint for OS file drags */}
      {pageDrop && (
        <div className="vault-drop-overlay">
          <div className="vault-drop-card"><Upload size={26} /> Drop to upload here</div>
        </div>
      )}

      {/* modals */}
      {addKind && (
        <AddItemModal kind={addKind} parentId={parent} onCreated={addToCache} onClose={() => setAddKind(null)} />
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
        <h3><FileText size={15} className="vault-icon-note" /> {item.title}</h3>
        <div className="vault-input" style={{ whiteSpace: "pre-wrap", minHeight: 130, fontFamily: "Inter", lineHeight: 1.6 }}>
          {item.body || <span style={{ color: "var(--v-muted)" }}>Empty note.</span>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button className="vault-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
