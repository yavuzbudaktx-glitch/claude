"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Card } from "@/components/Card";
import { HardDrive, Plus, Trash2, Copy, ArrowLeft } from "lucide-react";

type Device = {
  id: string;
  name: string;
  platform: string | null;
  sync_cursor: number;
  last_seen_at: string | null;
  revoked: boolean;
  created_at: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function DeviceManager() {
  const { data, mutate } = useSWR<{ devices: Device[] }>("/api/devices", fetcher);
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addDevice() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      }).then((r) => r.json());
      if (res.token) setNewToken(res.token);
      setName("");
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this device? Its agent will stop syncing.")) return;
    await fetch(`/api/devices?id=${id}`, { method: "DELETE" });
    await mutate();
  }

  const devices = data?.devices ?? [];

  return (
    <Card
      title="Sync devices"
      meta={`${devices.filter((d) => !d.revoked).length} active`}
      action={
        <Link href="/files" className="label hover:text-ink flex items-center gap-1">
          <ArrowLeft size={13} /> Files
        </Link>
      }
    >
      {newToken && (
        <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
          <div className="font-semibold text-ink mb-1">Device token — copy it now</div>
          <p className="text-muted text-[13px] mb-2">
            This is shown only once. Paste it into the agent&rsquo;s config as
            its bearer token. We store only a hash.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-black/10 dark:bg-white/10 px-2 py-1.5 text-[12px]">
              {newToken}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(newToken)}
              className="text-muted hover:text-ink"
            >
              <Copy size={15} />
            </button>
          </div>
          <button onClick={() => setNewToken(null)} className="label mt-2 hover:text-ink">
            Done
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 mb-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addDevice()}
          placeholder="New device name (e.g. MacBook)"
          className="flex-1 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-sm outline-none"
        />
        <button
          onClick={addDevice}
          disabled={busy || !name.trim()}
          className="flex items-center gap-1 text-[13px] font-semibold text-ink hover:opacity-70 disabled:opacity-40"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-2.5">
            <HardDrive size={16} className={d.revoked ? "text-muted/40" : "text-muted"} />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${d.revoked ? "text-muted line-through" : "text-ink"}`}>
                {d.name}
              </div>
              <div className="label">
                {d.last_seen_at ? `Last seen ${new Date(d.last_seen_at).toLocaleString()}` : "Never synced"}
                {" · "}rev {d.sync_cursor}
              </div>
            </div>
            {!d.revoked && (
              <button onClick={() => revoke(d.id)} className="text-muted hover:text-red-500">
                <Trash2 size={15} />
              </button>
            )}
          </li>
        ))}
        {devices.length === 0 && (
          <li className="py-8 text-center text-sm text-muted">
            No devices yet. Add one, then configure the sync agent with its token.
          </li>
        )}
      </ul>
    </Card>
  );
}
