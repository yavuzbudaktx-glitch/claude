import os from "node:os";
import path from "node:path";

// All configuration comes from environment variables so the agent can run as a
// daemon/service without an interactive config file.
//   DOCSYNC_SERVER  base URL of the web app, e.g. https://your-app.vercel.app
//   DOCSYNC_TOKEN   the device bearer token (shown once when adding the device)
//   DOCSYNC_DIR     local folder to keep in sync
//   DOCSYNC_STATE   path to the local SQLite state DB (defaults under DOCSYNC_DIR)
//   DOCSYNC_INTERVAL  debounced/periodic sync interval in seconds (default 30)
export interface Config {
  server: string;
  token: string;
  dir: string;
  statePath: string;
  intervalMs: number;
}

export function loadConfig(): Config {
  const server = process.env.DOCSYNC_SERVER;
  const token = process.env.DOCSYNC_TOKEN;
  const dir = process.env.DOCSYNC_DIR;
  if (!server || !token || !dir) {
    throw new Error("Set DOCSYNC_SERVER, DOCSYNC_TOKEN and DOCSYNC_DIR.");
  }
  const resolvedDir = path.resolve(dir.replace(/^~/, os.homedir()));
  return {
    server: server.replace(/\/$/, ""),
    token,
    dir: resolvedDir,
    statePath: process.env.DOCSYNC_STATE || path.join(resolvedDir, ".docsync.sqlite"),
    intervalMs: (Number(process.env.DOCSYNC_INTERVAL) || 30) * 1000,
  };
}
