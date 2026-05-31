"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  Folder, Link2, FileText, KeyRound, File as FileIcon,
  Upload, Plus, Trash2, ExternalLink, Download, Eye, ChevronRight,
  Search, Star, Pencil, Copy, LayoutGrid, List as ListIcon, Lock, Unlock, Check,
} from "lucide-react";
import type { VaultItem, VaultKind } from "@/lib/vault/types";
import { formatSize } from "@/lib/vault/types";
import { AddItemModal } from "./AddItemModal";
import { SecretModal } from "./SecretModal";
import { PinModal } from "./PinModal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
type AddKind = Exclude<VaultKind, "file">;
type View = "grid" | "list";

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
  // Private-vault unlock state. When unlocked we refetch including hidden items.
  const [unlocked, setUnlocked] = useState(false);
  const listKey = unlocked ? "/api/vault/items?private=1" : "/api/vault/items";
  const { data, mutate } = useSWR<{ items: VaultItem[] }>(listKey, fetcher);
  const { data: priv } = useSWR<{ exists: boolean }>("/api/vault/private", fetcher);

  const items = useMemo(() => data?.items ?? [], [data]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const [parent, setParent] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const [addKind, setAddKind] = useState<AddKind | null>(null);
  const [editItem, setEditItem] = useState<VaultItem | null>(null);
  const [viewSecret, setViewSecret] = useState<VaultItem | null>(null);
  const [viewNote, setViewNote] = useState<VaultItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pageDrop, setPageDrop] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const fileInput = useRef<HTMLInputElement>(null);
  const cmdRef = useRef<HTMLInputElement>(null);

  // restore view preference
  useEffect(() => {
    const v = localStorage.getItem("vault-view");
    if (v === "list" || v === "grid") setView(v);
  }, []);
  useEffect(() => { localStorage.setItem("vault-view", view); }, [view]);

  // ⌘K / Ctrl-K focuses the command bar
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        cmdRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 1600);
  }

  const q = query.trim().toLowerCase();
  const isPinQuery = /^\d{4,12}$/.test(query.trim());

  // Searching matches across all items (any folder); otherwise scope to folder.
  const searching = q.length > 0 && !isPinQuery;
  const scope = useMemo(() => {
    if (searching) {
      return items.filter(
        (i) => i.kind !== "folder" && (
          i.title.toLowerCase().includes(q) ||
          (i.url ?? "").toLowerCase().includes(q) ||
          (i.body ?? "").toLowerCase().includes(q)
        ),
      );
    }
    return items.filter((i) => i.parent_id === parent);
  }, [items, parent, q, searching]);

  const favorites = useMemo(
    () => (searching ? [] : scope.filter((i) => i.favorite)),
    [scope, searching],
  );
  const folders = useMemo(
    () => scope.filter((i) => i.kind === "folder" && !i.favorite).sort((a, b) => a.title.localeCompare(b.title)),
    [scope],
  );
  const things = useMemo(
    () => scope.filter((i) => i.kind !== "folder" && (searching || !i.favorite)).sort((a, b) => a.title.localeCompare(b.title)),
    [scope, searching],
  );

  useEffect(() => {
    const visible = [...favorites, ...things];
    const imgs = visible.filter((i) => i.kind === "file" && i.mime?.startsWith("image/") && !thumbs[i.id]);
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
      setThumbs((prev) => { const n = { ...prev }; for (const [id, u] of entries) if (u) n[id] = u; return n; });
    })();
    return () => { alive = false; };
  }, [favorites, things, thumbs]);

  const crumbs = useMemo(() => {
    const chain: VaultItem[] = [];
    let cur = parent ? byId.get(parent) : null;
    while (cur) { chain.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) ?? null : null; }
    return chain;
  }, [parent, byId]);

  const addToCache = useCallback((item: VaultItem) => {
    mutate((cur) => ({ items: [...(cur?.items ?? []), item] }), { revalidate: true });
  }, [mutate]);

  const replaceInCache = useCallback((item: VaultItem) => {
    mutate((cur) => ({ items: (cur?.items ?? []).map((i) => (i.id === item.id ? item : i)) }), { revalidate: false });
  }, [mutate]);

  // ---- command bar: PIN unlock detection ----
  function onCmdKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && isPinQuery) {
      e.preventDefault();
      attemptPin(query.trim());
    }
  }
  async function attemptPin(pin: string) {
    setQuery("");
    if (priv?.exists) {
      const res = await fetch("/api/vault/private", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }),
      });
      const json = await res.json();
      if (json.unlocked) await enterPrivate();
      else flash("Incorrect PIN");
    } else {
      setPinOpen(true); // first-time setup → PinModal
    }
  }

  // Reveal the private vault and drop the user straight INTO their Private
  // folder (creating it the first time). Everything inside it stays hidden, so
  // the model is simple: "in the Private folder = private".
  async function enterPrivate() {
    setUnlocked(true);
    const res = await fetch("/api/vault/items?private=1").then((r) => r.json()).catch(() => null);
    const all: VaultItem[] = res?.items ?? [];
    let root = all.find((i) => i.hidden && i.kind === "folder" && i.parent_id === null);
    if (!root) {
      const created = await fetch("/api/vault/items", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "folder", title: "Private", hidden: true }),
      }).then((r) => r.json()).catch(() => null);
      root = created?.item;
    }
    await mutate();
    if (root) setParent(root.id);
    flash("Private vault unlocked");
  }

  function lockPrivate() {
    setUnlocked(false);
    setParent(null);
    setQuery("");
    flash("Private vault locked");
  }

  // ---- mutations ----
  async function toggleFav(item: VaultItem) {
    const next = !item.favorite;
    replaceInCache({ ...item, favorite: next });
    await fetch(`/api/vault/items/${item.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ favorite: next }),
    });
  }

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
            "x-hidden": unlocked && isInPrivate(targetParent) ? "1" : "0",
          },
          body: await file.arrayBuffer(),
        });
        const json = await res.json().catch(() => null);
        if (json?.item) addToCache(json.item);
      }
      await mutate();
      flash(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}`);
    } finally {
      setBusy(false);
    }
  }

  // Is a folder (or the current root context) within the hidden private vault?
  function isInPrivate(p: string | null): boolean {
    if (!unlocked) return false;
    let cur = p ? byId.get(p) : null;
    while (cur) { if (cur.hidden) return true; cur = cur.parent_id ? byId.get(cur.parent_id) ?? null : null; }
    return false;
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (fileInput.current) fileInput.current.value = "";
    setMenuOpen(false);
    await uploadFiles(files, parent);
  }

  async function moveItem(id: string, targetParent: string | null) {
    if (id === targetParent) return;
    const item = byId.get(id);
    if (!item || item.parent_id === targetParent) return;
    if (item.kind === "folder" && targetParent) {
      let p: string | null = targetParent;
      while (p) { if (p === id) return; p = byId.get(p)?.parent_id ?? null; }
    }
    replaceInCache({ ...item, parent_id: targetParent });
    await fetch(`/api/vault/items/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ parent_id: targetParent }),
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
    mutate((cur) => ({ items: (cur?.items ?? []).filter((i) => i.id !== item.id && i.parent_id !== item.id) }), { revalidate: false });
    await fetch(`/api/vault/items/${item.id}`, { method: "DELETE" });
    await mutate();
    flash("Deleted");
  }

  function copyLink(item: VaultItem) {
    if (item.url) { navigator.clipboard.writeText(item.url); flash("Link copied"); }
  }
  function copyPassword(item: VaultItem) {
    try {
      const f = JSON.parse(item.secret_ciphertext ?? "{}");
      if (f.password) { navigator.clipboard.writeText(f.password); flash("Password copied"); }
    } catch { /* ignore */ }
  }

  function decode(t: string) { try { return decodeURIComponent(t); } catch { return t; } }

  function startAdd(kind: AddKind) { setMenuOpen(false); setAddKind(kind); }

  // ---- drag/drop ----
  function onDropInto(targetParent: string | null, e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    setDropTarget(null); setPageDrop(false);
    const dropped = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (dropped.length) uploadFiles(dropped, targetParent);
    else if (draggingId) moveItem(draggingId, targetParent);
    setDraggingId(null);
  }

  const inPrivateNow = isInPrivate(parent);

  // ---- card / row item actions (shared) ----
  function ItemActions({ item }: { item: VaultItem }) {
    const isImg = item.kind === "file" && item.mime?.startsWith("image/");
    return (
      <>
        {item.kind === "link" && item.url && (
          <>
            <a href={item.url} target="_blank" rel="noreferrer" title="Open"><ExternalLink size={15} /></a>
            <button onClick={() => copyLink(item)} title="Copy link"><Copy size={15} /></button>
          </>
        )}
        {item.kind === "secret" && (
          <>
            <button onClick={() => setViewSecret(item)} title="Reveal"><Eye size={15} /></button>
            <button onClick={() => copyPassword(item)} title="Copy password"><Copy size={15} /></button>
          </>
        )}
        {item.kind === "note" && <button onClick={() => setViewNote(item)} title="Open"><Eye size={15} /></button>}
        {item.kind === "file" && (
          <>
            {isImg && <button onClick={() => openFile(item, true)} title="Preview"><Eye size={15} /></button>}
            <button onClick={() => openFile(item, false)} title="Download"><Download size={15} /></button>
          </>
        )}
        {item.kind !== "file" && item.kind !== "folder" && (
          <button onClick={() => setEditItem(item)} title="Edit"><Pencil size={15} /></button>
        )}
        {(item.kind === "folder" || item.kind === "file") && (
          <button onClick={() => setEditItem(item)} title="Rename"><Pencil size={15} /></button>
        )}
        <button className="vault-act-danger" style={{ marginLeft: "auto" }} onClick={() => remove(item)} title="Delete">
          <Trash2 size={15} />
        </button>
      </>
    );
  }

  function renderCard(item: VaultItem) {
    const Icon = KIND_ICON[item.kind];
    const isImg = item.kind === "file" && item.mime?.startsWith("image/");
    const isFolder = item.kind === "folder";
    const isDropHover = dropTarget === item.id && isFolder;
    return (
      <div
        key={item.id}
        className={`vault-item ${KIND_CARD[item.kind]}${isDropHover ? " vault-item-drophover" : ""}${draggingId === item.id ? " vault-item-dragging" : ""}${item.hidden ? " vault-item-private" : ""}`}
        draggable
        onDragStart={(e) => { setDraggingId(item.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
        onDragOver={isFolder ? (e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(item.id); } : undefined}
        onDragLeave={isFolder ? () => setDropTarget((t) => (t === item.id ? null : t)) : undefined}
        onDrop={isFolder ? (e) => onDropInto(item.id, e) : undefined}
      >
        <div className="vault-item-head">
          <span className="vault-item-iconwrap"><Icon size={16} /></span>
          <span className="vault-item-kind">{item.kind}</span>
          <Star
            size={15}
            className={`vault-fav-star${item.favorite ? " is-fav" : ""}`}
            fill={item.favorite ? "currentColor" : "none"}
            onClick={() => toggleFav(item)}
          />
        </div>

        {isFolder ? (
          <button className="vault-item-title vault-item-title-btn" onClick={() => { setParent(item.id); setQuery(""); }}>
            {decode(item.title)}
          </button>
        ) : (
          <span className="vault-item-title">{decode(item.title)}</span>
        )}

        {isImg && thumbs[item.id] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbs[item.id]} alt={decode(item.title)} className="vault-thumb" draggable={false} />
        )}
        {item.kind === "link" && item.url && <span className="vault-item-sub mono">{item.url.replace(/^https?:\/\//, "")}</span>}
        {item.kind === "note" && item.body && <span className="vault-item-sub">{item.body.slice(0, 90)}{item.body.length > 90 ? "…" : ""}</span>}
        {item.kind === "file" && !isImg && item.size > 0 && <span className="vault-item-sub mono">{formatSize(item.size)}</span>}
        {item.kind === "secret" && <span className="vault-item-sub mono">••••••••••</span>}

        <div className="vault-item-actions"><ItemActions item={item} /></div>
      </div>
    );
  }

  function renderRow(item: VaultItem) {
    const Icon = KIND_ICON[item.kind];
    const isFolder = item.kind === "folder";
    const isDropHover = dropTarget === item.id && isFolder;
    const sub =
      item.kind === "link" ? (item.url ?? "").replace(/^https?:\/\//, "") :
      item.kind === "note" ? (item.body ?? "").slice(0, 80) :
      item.kind === "file" ? formatSize(item.size) :
      item.kind === "secret" ? "••••••••" : "";
    return (
      <div
        key={item.id}
        className={`vault-row ${KIND_CARD[item.kind]}${isDropHover ? " vault-item-drophover" : ""}${draggingId === item.id ? " is-dragging" : ""}`}
        draggable
        onDragStart={(e) => { setDraggingId(item.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
        onDragOver={isFolder ? (e) => { e.preventDefault(); setDropTarget(item.id); } : undefined}
        onDragLeave={isFolder ? () => setDropTarget((t) => (t === item.id ? null : t)) : undefined}
        onDrop={isFolder ? (e) => onDropInto(item.id, e) : undefined}
      >
        <span className="vault-item-iconwrap"><Icon size={15} /></span>
        <div className="vault-row-main">
          {isFolder ? (
            <button className="vault-row-title vault-item-title-btn" onClick={() => { setParent(item.id); setQuery(""); }}>{decode(item.title)}</button>
          ) : (
            <div className="vault-row-title">{decode(item.title)}</div>
          )}
          {sub && <div className="vault-row-sub">{sub}</div>}
        </div>
        <Star size={15} className={`vault-fav-star${item.favorite ? " is-fav" : ""}`} fill={item.favorite ? "currentColor" : "none"} onClick={() => toggleFav(item)} />
        <div className="vault-row-actions"><ItemActions item={item} /></div>
      </div>
    );
  }

  const render = view === "grid" ? renderCard : renderRow;
  const Wrap = ({ children }: { children: React.ReactNode }) =>
    view === "grid" ? <div className="vault-grid">{children}</div> : <div className="vault-list">{children}</div>;

  const empty = favorites.length === 0 && folders.length === 0 && things.length === 0;

  return (
    <div
      className="vault-scope"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setPageDrop(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setPageDrop(false); }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) onDropInto(parent, e); }}
    >
      <div className="vault-shell">
        <div className="vault-topbar">
          <div className="vault-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/doc-anywhere-logo.png" alt="Doc Anywhere" className="vault-logo-img" />
            <span className="vault-title">Doc Anywhere<span className="vault-sub">Personal Vault</span></span>
          </div>

          <div className="vault-cmd">
            <Search size={15} />
            <input
              ref={cmdRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onCmdKey}
              placeholder="Search, or type your PIN…"
              type={isPinQuery ? "password" : "text"}
            />
            {!query && <span className="vault-cmd-hint">⌘K</span>}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div className="vault-seg">
              <button className={view === "grid" ? "is-on" : ""} onClick={() => setView("grid")} title="Grid"><LayoutGrid size={15} /></button>
              <button className={view === "list" ? "is-on" : ""} onClick={() => setView("list")} title="List"><ListIcon size={15} /></button>
            </div>
            {unlocked && (
              <button className="vault-btn" onClick={lockPrivate} title="Lock private vault"><Unlock size={14} /> Private</button>
            )}
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

        {unlocked && (
          <div className="vault-private-banner">
            <Lock size={14} /> Private vault unlocked — hidden items are visible.
            <button className="vault-btn vault-btn-danger" onClick={lockPrivate}>Lock now</button>
          </div>
        )}

        {!searching && (
          <div className="vault-crumbs">
            <button
              onClick={() => setParent(null)}
              className={`${parent ? "" : "vault-crumb-cur"}${dropTarget === "__root__" ? " vault-crumb-drop" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDropTarget("__root__"); }}
              onDragLeave={() => setDropTarget((t) => (t === "__root__" ? null : t))}
              onDrop={(e) => onDropInto(null, e)}
            >Home</button>
            {crumbs.map((c, i) => (
              <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ChevronRight size={13} />
                <button
                  onClick={() => setParent(c.id)}
                  className={`${i === crumbs.length - 1 ? "vault-crumb-cur" : ""}${dropTarget === c.id ? " vault-crumb-drop" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDropTarget(c.id); }}
                  onDragLeave={() => setDropTarget((t) => (t === c.id ? null : t))}
                  onDrop={(e) => onDropInto(c.id, e)}
                >{decode(c.title)}</button>
              </span>
            ))}
          </div>
        )}

        <Wrap>
          {favorites.length > 0 && <div className="vault-sectionlabel"><Star size={12} className="vault-star" fill="currentColor" /> Favorites</div>}
          {favorites.map(render)}
          {folders.length > 0 && <div className="vault-sectionlabel">Folders</div>}
          {folders.map(render)}
          {things.length > 0 && <div className="vault-sectionlabel">{searching ? "Results" : "Items"}</div>}
          {things.map(render)}

          {empty && (
            <div className="vault-empty">
              {searching ? (
                <>No matches for “{query}”.</>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/doc-anywhere-logo.png" alt="" className="vault-empty-logo" />
                  {inPrivateNow
                    ? <>This private folder is empty — add something only you can see.</>
                    : <>Drop files here, or hit <b>New</b> to add a link, note, password or folder.</>}
                </>
              )}
            </div>
          )}
        </Wrap>
      </div>

      {pageDrop && <div className="vault-drop-overlay"><div className="vault-drop-card"><Upload size={26} /> Drop to upload</div></div>}
      {toast && <div className="vault-toast"><Check size={15} /> {toast}</div>}

      {addKind && (
        <AddItemModal
          kind={addKind}
          parentId={parent}
          hidden={inPrivateNow}
          onSaved={addToCache}
          onClose={() => setAddKind(null)}
        />
      )}
      {editItem && editItem.kind !== "file" ? (
        <AddItemModal
          kind={editItem.kind as AddKind}
          parentId={editItem.parent_id}
          edit={editItem}
          onSaved={replaceInCache}
          onClose={() => setEditItem(null)}
        />
      ) : editItem ? (
        <RenameModal item={editItem} onSaved={replaceInCache} onClose={() => setEditItem(null)} />
      ) : null}
      {viewNote && <NoteModal item={viewNote} onClose={() => setViewNote(null)} />}
      {viewSecret && <SecretModal item={viewSecret} onClose={() => setViewSecret(null)} />}
      {pinOpen && (
        <PinModal
          exists={!!priv?.exists}
          onUnlocked={() => { setPinOpen(false); enterPrivate(); }}
          onClose={() => setPinOpen(false)}
        />
      )}
    </div>
  );
}

// Inline note reader, with quick-copy of the body.
function NoteModal({ item, onClose }: { item: VaultItem; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (!item.body) return;
    navigator.clipboard.writeText(item.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="vault-modal-backdrop" onClick={onClose}>
      <div className="vault-modal" onClick={(e) => e.stopPropagation()}>
        <h3><FileText size={16} className="vault-icon-note" /> {item.title}</h3>
        <div className="vault-input" style={{ whiteSpace: "pre-wrap", minHeight: 130, lineHeight: 1.6 }}>
          {item.body || <span style={{ color: "var(--v-muted)" }}>Empty note.</span>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <button className="vault-btn" onClick={copy} disabled={!item.body}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy text"}
          </button>
          <button className="vault-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// Rename dialog for folders and files (which AddItemModal doesn't cover).
function RenameModal({ item, onSaved, onClose }: { item: VaultItem; onSaved: (i: VaultItem) => void; onClose: () => void }) {
  const dec = (t: string) => { try { return decodeURIComponent(t); } catch { return t; } };
  const [title, setTitle] = useState(dec(item.title));
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    // files store their name url-encoded; keep that convention.
    const value = item.kind === "file" ? encodeURIComponent(title.trim()) : title.trim();
    const res = await fetch(`/api/vault/items/${item.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: value }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.item) { onSaved(json.item); onClose(); }
  }
  return (
    <div className="vault-modal-backdrop" onClick={onClose}>
      <div className="vault-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3><Pencil size={15} /> Rename {item.kind}</h3>
        <div className="vault-field">
          <input autoFocus className="vault-input" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="vault-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="vault-btn vault-btn-primary" onClick={save} disabled={busy}>{busy ? "…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
