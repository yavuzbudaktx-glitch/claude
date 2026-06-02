"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Plus, X, ExternalLink } from "lucide-react";
import { usePref } from "@/components/PrefsProvider";

interface Link { id: string; title: string; url: string }
const uid = () => Math.random().toString(36).slice(2, 9);

function favicon(url: string): string {
  try {
    const h = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${h}`;
  } catch {
    return "";
  }
}
function normalize(url: string): string {
  const u = url.trim();
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

// A small launchpad of your most-used links, synced across devices. Add a URL,
// click to open. Lives as a popover button in the action row.
export function Bookmarks() {
  const [links, setLinks] = usePref<Link[]>("hub.bookmarks", []);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function add() {
    const u = normalize(url);
    if (!u) return;
    let t = title.trim();
    if (!t) { try { t = new URL(u).hostname.replace(/^www\./, ""); } catch { t = u; } }
    setLinks([...links, { id: uid(), title: t, url: u }]);
    setTitle(""); setUrl("");
  }

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Bookmarks"
        title="Bookmarks"
        className={`btn-ghost ${open ? "!text-accent !border-[var(--accent)]" : ""}`}
      >
        <Bookmark className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed right-3 top-[58px] md:absolute md:right-0 md:top-[calc(100%+8px)] z-[70] w-[min(300px,calc(100vw-1.5rem))] rounded-2xl border border-[var(--glass-border)] bg-[var(--paper-2)] backdrop-blur-xl shadow-[var(--shadow-hover)] p-3 animate-fadeIn origin-top-right">
          <div className="label px-1 pb-2 flex items-center gap-1.5"><Bookmark className="h-3 w-3" /> Bookmarks</div>

          <ul className="space-y-0.5 max-h-[240px] overflow-y-auto mb-2">
            {links.map((l) => (
              <li key={l.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-[var(--rule-soft)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={favicon(l.url)} alt="" className="h-4 w-4 rounded-sm shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-[13px] text-ink-soft hover:text-accent transition truncate" title={l.url}>
                  {l.title}
                </a>
                <button onClick={() => setLinks(links.filter((x) => x.id !== l.id))} className="text-muted-2 opacity-0 group-hover:opacity-100 hover:text-accent transition shrink-0" aria-label="Remove">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {links.length === 0 && (
              <li className="text-muted-2 text-[12px] italic px-1.5 py-2">No bookmarks yet — add one below.</li>
            )}
          </ul>

          <div className="flex items-center gap-1.5 border-t rule pt-2.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name"
              className="w-[34%] rounded-lg bg-[var(--rule-soft)] px-2 py-1.5 text-[12px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2"
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              placeholder="paste a URL"
              className="flex-1 min-w-0 rounded-lg bg-[var(--rule-soft)] px-2 py-1.5 text-[12px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-muted-2"
            />
            <button onClick={add} className="btn-ghost !h-8 !w-8 shrink-0" aria-label="Add bookmark"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
