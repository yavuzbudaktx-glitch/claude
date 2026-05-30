# Documents Sync Agent (desktop/laptop)

Watches a local folder and keeps it in two-way sync with the Documents Anywhere
web app. Pulls remote changes and pushes local ones using a per-device token.

## Setup

1. In the web app, open **Devices → Add**, name the device, and copy the token
   shown once.
2. Install deps and configure:

```bash
cd agent
npm install
export DOCSYNC_SERVER="https://your-app.example.com"
export DOCSYNC_TOKEN="<paste device token>"
export DOCSYNC_DIR="~/Documents/Synced"
npm run dev          # or: npm run build && npm start
```

## How it works

- **Pull**: `GET /api/agent/changes?since=<cursor>` returns document rows with a
  higher `rev` than the device cursor. New/changed files are downloaded and
  written atomically (temp + rename); tombstones delete the local file.
- **Push**: the folder is scanned; files whose SHA-256 differs from the last
  synced hash are uploaded with their `base_version` for conflict detection.
  Files that vanished are tombstoned on the server.
- **Echo suppression**: after writing a pulled file, local state is updated to
  the downloaded hash, so the follow-up push sees no change and won't re-upload.
- **Triggers**: a sync runs on startup, on debounced file-watcher events, on a
  periodic interval (`DOCSYNC_INTERVAL`, default 30s), and on wake-from-sleep
  (detected via clock drift between interval ticks).

Local state lives in `.docsync.sqlite` inside the synced folder.

## Env vars

| Var | Required | Description |
| --- | --- | --- |
| `DOCSYNC_SERVER` | yes | Base URL of the web app |
| `DOCSYNC_TOKEN` | yes | Device bearer token |
| `DOCSYNC_DIR` | yes | Local folder to sync |
| `DOCSYNC_STATE` | no | Path to state DB (default: `<dir>/.docsync.sqlite`) |
| `DOCSYNC_INTERVAL` | no | Periodic sync interval, seconds (default 30) |

## Limitations (MVP)

- Whole-file uploads in one request — large multi-GB files need chunked/
  resumable uploads (planned). Conflicts produce a "conflicted copy" sibling
  rather than merging.
