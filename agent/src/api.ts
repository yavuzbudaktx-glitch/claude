import type { Config } from "./config.js";

export interface RemoteChange {
  id: string;
  path: string;
  content_hash: string | null;
  size: number;
  mime: string | null;
  version: number;
  deleted: boolean;
  rev: number;
}

// Thin HTTP client for the /api/agent/* endpoints. Always sends the device
// bearer token.
export class Api {
  constructor(private cfg: Config) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { authorization: `Bearer ${this.cfg.token}`, ...extra };
  }

  async changes(since: number): Promise<{ changes: RemoteChange[]; cursor: number }> {
    const res = await fetch(`${this.cfg.server}/api/agent/changes?since=${since}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`changes failed: ${res.status}`);
    return res.json();
  }

  async download(id: string): Promise<Buffer> {
    const res = await fetch(`${this.cfg.server}/api/agent/download?id=${id}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`download url failed: ${res.status}`);
    const { url } = (await res.json()) as { url: string };
    const blob = await fetch(url);
    if (!blob.ok) throw new Error(`blob fetch failed: ${blob.status}`);
    return Buffer.from(await blob.arrayBuffer());
  }

  async upload(opts: {
    path: string;
    hash: string;
    mime: string;
    baseVersion: number;
    body: Buffer;
  }): Promise<{ status: string; id: string; path: string; version: number; rev: number }> {
    const res = await fetch(`${this.cfg.server}/api/agent/upload`, {
      method: "POST",
      headers: this.headers({
        "x-path": opts.path,
        "x-content-hash": opts.hash,
        "x-mime": opts.mime,
        "x-base-version": String(opts.baseVersion),
        "content-type": "application/octet-stream",
      }),
      body: new Uint8Array(opts.body),
    });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    return res.json();
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(`${this.cfg.server}/api/agent/delete`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  }

  async setCursor(cursor: number): Promise<void> {
    await fetch(`${this.cfg.server}/api/agent/cursor`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ cursor }),
    });
  }
}
