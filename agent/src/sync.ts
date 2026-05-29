import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Config } from "./config.js";
import { Api } from "./api.js";
import { State } from "./state.js";

const MIME: Record<string, string> = {
  ".txt": "text/plain", ".md": "text/markdown", ".pdf": "application/pdf",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".json": "application/json", ".csv": "text/csv", ".html": "text/html",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function mimeFor(p: string): string {
  return MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
}

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// Skip the local state DB and common junk so we never sync our own bookkeeping.
function ignored(rel: string): boolean {
  return (
    rel.startsWith(".docsync") ||
    rel.split("/").some((seg) => seg === ".git" || seg === "node_modules" || seg === ".DS_Store")
  );
}

export class Syncer {
  private api: Api;
  private running = false;
  private rerun = false;

  constructor(private cfg: Config, private state: State) {
    this.api = new Api(cfg);
  }

  // Coalesce overlapping triggers: if a sync is requested while one runs, we
  // run exactly once more afterwards.
  async trigger(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.rerun = false;
        await this.pull();
        await this.push();
      } while (this.rerun);
    } catch (e) {
      console.error("[sync] error:", e instanceof Error ? e.message : e);
    } finally {
      this.running = false;
    }
  }

  private abs(rel: string): string {
    return path.join(this.cfg.dir, rel);
  }

  // Apply remote changes newer than our cursor to the local disk.
  private async pull(): Promise<void> {
    let cursor = this.state.getCursor();
    const { changes } = await this.api.changes(cursor);
    for (const c of changes) {
      const absPath = this.abs(c.path);
      if (c.deleted) {
        await fsp.rm(absPath, { force: true });
        this.state.remove(c.path);
      } else {
        const local = this.state.get(c.path);
        if (!local || local.hash !== c.content_hash) {
          const buf = await this.api.download(c.id);
          await this.atomicWrite(absPath, buf);
          const stat = await fsp.stat(absPath);
          this.state.put({
            path: c.path,
            hash: hashBuffer(buf),
            mtime: stat.mtimeMs,
            size: buf.length,
            version: c.version,
            doc_id: c.id,
          });
        } else {
          // Same content already on disk — just record the server version.
          this.state.put({ ...local, version: c.version, doc_id: c.id });
        }
      }
      cursor = Math.max(cursor, c.rev);
    }
    if (cursor !== this.state.getCursor()) {
      this.state.setCursor(cursor);
      await this.api.setCursor(cursor);
    }
  }

  // Push local additions/changes/deletions to the server.
  private async push(): Promise<void> {
    const onDisk = await this.walk(this.cfg.dir, "");
    const seen = new Set<string>();

    for (const rel of onDisk) {
      seen.add(rel);
      const absPath = this.abs(rel);
      const stat = await fsp.stat(absPath);
      const prev = this.state.get(rel);
      // mtime+size as a cheap pre-filter; hash is the authority.
      if (prev && prev.mtime === stat.mtimeMs && prev.size === stat.size) continue;

      const buf = await fsp.readFile(absPath);
      const hash = hashBuffer(buf);
      if (prev && prev.hash === hash) {
        this.state.put({ ...prev, mtime: stat.mtimeMs, size: stat.size });
        continue;
      }

      const res = await this.api.upload({
        path: rel,
        hash,
        mime: mimeFor(rel),
        baseVersion: prev?.version ?? 0,
        body: buf,
      });
      // On conflict the server stored a renamed copy; keep our own row tracking
      // by re-reading the canonical version it returned for our path.
      this.state.put({
        path: rel,
        hash,
        mtime: stat.mtimeMs,
        size: stat.size,
        version: res.path === rel ? res.version : (prev?.version ?? res.version),
        doc_id: res.path === rel ? res.id : (prev?.doc_id ?? res.id),
      });
    }

    // Files we tracked but that vanished from disk → tombstone remotely.
    for (const f of this.state.all()) {
      if (!seen.has(f.path)) {
        await this.api.delete(f.path);
        this.state.remove(f.path);
      }
    }
  }

  private async walk(root: string, rel: string): Promise<string[]> {
    const out: string[] = [];
    const entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true });
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (ignored(childRel)) continue;
      if (e.isDirectory()) out.push(...(await this.walk(root, childRel)));
      else if (e.isFile()) out.push(childRel);
    }
    return out;
  }

  // Write via temp file + rename so readers never see a partial file and the
  // watcher sees a single atomic event.
  private async atomicWrite(absPath: string, buf: Buffer): Promise<void> {
    await fsp.mkdir(path.dirname(absPath), { recursive: true });
    const tmp = `${absPath}.docsync.tmp`;
    await fsp.writeFile(tmp, buf);
    await fsp.rename(tmp, absPath);
  }
}
