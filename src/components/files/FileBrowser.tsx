"use client";

import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Folder, FileText, Download, Upload, Search, HardDrive } from "lucide-react";

type Doc = {
  id: string;
  path: string;
  size: number;
  mime: string | null;
  version: number;
  updated_at: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function FileBrowser() {
  const [folder, setFolder] = useState<string>(""); // current folder prefix, e.g. "Work/"
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const listKey = "/api/files/list";
  const searchKey = query.trim() ? `/api/files/search?q=${encodeURIComponent(query.trim())}` : null;
  const { data: listData, mutate } = useSWR<{ documents: Doc[] }>(listKey, fetcher);
  const { data: searchData } = useSWR<{ documents: Doc[] }>(searchKey, fetcher);

  const docs = useMemo(
    () => (searchKey ? searchData?.documents : listData?.documents) ?? [],
    [searchKey, searchData, listData],
  );

  // Derive the immediate folders and files within the current prefix.
  const { folders, files } = useMemo(() => {
    if (searchKey) return { folders: [] as string[], files: docs };
    const folderSet = new Set<string>();
    const fileList: Doc[] = [];
    for (const d of docs) {
      if (!d.path.startsWith(folder)) continue;
      const rest = d.path.slice(folder.length);
      const slash = rest.indexOf("/");
      if (slash === -1) fileList.push(d);
      else folderSet.add(rest.slice(0, slash));
    }
    return { folders: [...folderSet].sort(), files: fileList };
  }, [docs, folder, searchKey]);

  async function download(id: string) {
    const res = await fetch(`/api/files/download?id=${id}`).then((r) => r.json());
    if (res.url) window.location.href = res.url;
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await fetch("/api/files/upload", {
        method: "POST",
        headers: {
          "x-path": folder + file.name,
          "x-mime": file.type || "application/octet-stream",
        },
        body: await file.arrayBuffer(),
      });
      await mutate();
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const crumbs = folder ? folder.replace(/\/$/, "").split("/") : [];

  return (
    <Card
      title="Documents"
      meta={`${docs.length} file${docs.length === 1 ? "" : "s"}`}
      action={
        <div className="flex items-center gap-2">
          <Link href="/devices" className="label hover:text-ink flex items-center gap-1">
            <HardDrive size={13} /> Devices
          </Link>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="flex items-center gap-1 text-[13px] font-semibold text-ink hover:opacity-70 disabled:opacity-40"
          >
            <Upload size={14} /> {busy ? "Uploading…" : "Upload"}
          </button>
          <input ref={fileInput} type="file" className="hidden" onChange={onUpload} />
        </div>
      }
    >
      <div className="relative mt-2 mb-3">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all files…"
          className="w-full pl-8 pr-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-sm outline-none"
        />
      </div>

      {!searchKey && (
        <div className="flex items-center gap-1 text-[13px] text-muted mb-2 flex-wrap">
          <button onClick={() => setFolder("")} className="hover:text-ink">Home</button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <span>/</span>
              <button
                onClick={() => setFolder(crumbs.slice(0, i + 1).join("/") + "/")}
                className="hover:text-ink"
              >
                {c}
              </button>
            </span>
          ))}
        </div>
      )}

      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {folders.map((name) => (
          <li key={name}>
            <button
              onClick={() => setFolder(folder + name + "/")}
              className="w-full flex items-center gap-3 py-2.5 text-left hover:opacity-70"
            >
              <Folder size={16} className="text-muted shrink-0" />
              <span className="text-sm font-medium text-ink">{name}</span>
            </button>
          </li>
        ))}
        {files.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-2.5">
            <FileText size={16} className="text-muted shrink-0" />
            <span className="text-sm text-ink truncate flex-1">
              {searchKey ? d.path : d.path.slice(folder.length)}
            </span>
            <span className="label shrink-0">{formatSize(d.size)}</span>
            <button onClick={() => download(d.id)} className="text-muted hover:text-ink shrink-0">
              <Download size={15} />
            </button>
          </li>
        ))}
        {folders.length === 0 && files.length === 0 && (
          <li className="py-8 text-center text-sm text-muted">
            {searchKey ? "No matches." : "No files here yet. Upload one, or run a sync agent."}
          </li>
        )}
      </ul>
    </Card>
  );
}
