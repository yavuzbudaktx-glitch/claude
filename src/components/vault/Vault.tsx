"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Folder, Link2, FileText, KeyRound, File as FileIcon, Image as ImageIcon,
  Upload, Plus, Trash2, ExternalLink, Download, Eye, ChevronRight,
  LayoutDashboard, Database,
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

  // Signed thumbnail URLs for image files, fetched lazily once.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const inFolder = useMemo(
    () => items.filter((i) => i.parent_id === parent),
    [items, parent],
  );
  const folders = useMemo(
    () => inFolder.filter((i) => i.kind === "folder").sort((a, b) => a.title.localeCompare(b.title)),
    [inFolder],
  );
  const things = useMemo(
    () => inFolder.filter((i) => i.kind !== "folder").sort((a, b) => a.title.localeCompare(b.title)),
    [inFolder],
  );

  // Fetch signed preview URLs for any image files currently visible.
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

  function renderItem(item: VaultItem) {
    const Icon = KIND_ICON[item.kind];
    const isImg = item.kind === "file" && item.mime?.startsWith("image/");
    return (
      <div key={item.id} className={`vault-item ${KIND_CARD[item.kind]}`}>
        <div className="vault-item-head">
          <span className="vault-item-iconwrap">
            <Icon size={15} className={KIND_CLASS[item.kind]} />
          </span>
          <span className="vault-item-kind">{item.kind}</span>
        </div>

        {item.kind === "folder" ? (
          <button className="vault-item-title vault-item-title-btn" onClick={() => setParent(item.id)}>
            {item.title}
          </button>
        ) : (
          <span className="vault-item-title">{decodeTitle(item.title)}</span>
        )}

        {isImg && thumbs[item.id] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbs[item.id]} alt={decodeTitle(item.title)} className="vault-thumb" />
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
          <span className="vault-item-sub" style={{ color: "var(--v-muted)", letterSpacing: "0.15em" }}>
            ••••••••••
          </span>
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
              {isImg && (
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
  }

  const empty = folders.length === 0 && things.length === 0;

  return (
    <div className="vault-scope">
      <div className="vault-shell">
        {/* top bar */}
        <div className="vault-topbar">
          <div className="vault-brand">
            <span className="vault-logo"><Database size={17} strokeWidth={2.3} /></span>
            <span className="vault-title">
              Doc Anywhere
              <span className="vault-sub">Personal Vault</span>
            </span>
          </div>
          <span className="vault-chip"><b>{items.length}</b> items</span>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <button className="vault-btn vault-btn-primary" onClick={() => setMenuOpen((m) => !m)} disabled={busy}>
                <Plus size={15} /> {busy ? "Uploading…" : "New"}
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
            <Link href="/" className="vault-btn vault-btn-icon" title="Back to dashboard">
              <LayoutDashboard size={15} />
            </Link>
          </div>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={onUploadFiles} />
        </div>

        {/* breadcrumbs */}
        <div className="vault-crumbs">
          <button onClick={() => setParent(null)} className={parent ? "" : "vault-crumb-cur"}>~/doc-anywhere</button>
          {crumbs.map((c, i) => (
            <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ChevronRight size={12} />
              <button onClick={() => setParent(c.id)} className={i === crumbs.length - 1 ? "vault-crumb-cur" : ""}>
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
              <span className="vault-empty-ring"><Database size={22} /></span>
              This space is empty — hit <b style={{ color: "var(--v-ink-soft)" }}>New</b> to add a link, note, password or file.
            </div>
          )}
        </div>
      </div>

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
