# docsync — keep Windows and Mac documents in step

Two-way sync between your `Documents` folder and OneDrive, on both machines.
Add a file on the Mac, it shows up on the PC. Delete it on the PC, it goes away
on the Mac. Neither machine has to be awake when the other one is.

It installs itself as a background job, so there is nothing to remember.

---

## How it works

```
  Mac  ~/Documents  <──sync──>  ~/OneDrive/Documents  ─┐
                                                       ├─► OneDrive cloud
  Win  C:\Users\you\Documents <──sync──> OneDrive\Documents ─┘
```

Each machine only ever syncs with **its own local OneDrive folder**. OneDrive
carries that folder up to the cloud whenever that machine is on, and pulls down
whatever the other machine left there. That is why the two computers never need
to be on at the same time.

The syncing itself is done by [rclone](https://rclone.org)'s `bisync`, which
remembers what the folders looked like after the last run. That memory is what
lets it tell "this file was deleted here" apart from "this file is new over
there" — the one thing a naive copy-both-ways script always gets wrong.

---

## Before you start: you may not need this on Windows

Windows OneDrive can back up the Documents folder by itself:

> OneDrive icon in the taskbar → gear → **Settings** → **Sync and backup** →
> **Manage backup** → turn on **Documents**

If that is already on, `C:\Users\you\Documents` **is** your OneDrive Documents
folder — same folder, just redirected. Windows is then already syncing in real
time and **needs no script at all**. In that case set up the **Mac side only**
and you are done. `install-windows.ps1` checks for this and tells you.

---

## Setup

### Both machines first: install rclone

**Mac** (needs [Homebrew](https://brew.sh)):

```bash
brew install rclone
```

**Windows** (PowerShell):

```powershell
winget install Rclone.Rclone
```

You do **not** need to run `rclone config` or connect rclone to any account —
it only ever touches local folders here.

Make sure the OneDrive app itself is installed and signed in on both machines,
and that a `Documents` folder exists inside your OneDrive folder.

### Turn off Files On-Demand for the hub folder

OneDrive likes to leave files in the cloud as placeholders, which docsync would
see as empty. Right-click your **OneDrive → Documents** folder and choose
**"Always keep on this device."** Do this on both machines.

### Mac

```bash
cd tools/docsync
cp docsync.conf.example docsync.conf
```

Edit `docsync.conf` so the two paths are right (the defaults are already the
Mac ones):

```ini
LOCAL_DIR=~/Documents
HUB_DIR=~/OneDrive/Documents
```

Then look before you leap, and install:

```bash
./docsync.sh --dry-run     # says what it would do, changes nothing
./install-mac.sh           # runs at login + every 15 minutes from now on
```

**One extra step macOS makes you do:** background jobs are not allowed to read
`~/Documents` until you say so. Open **System Settings → Privacy & Security →
Full Disk Access** and add the rclone binary (`which rclone` tells you where it
is, usually `/opt/homebrew/bin/rclone`). Skip this and the logs fill up with
"operation not permitted".

### Windows

Skip this entirely if OneDrive already backs up your Documents folder (above).

```powershell
cd tools\docsync
Copy-Item docsync.conf.example docsync.conf
```

Edit `docsync.conf` — comment out the Mac lines, uncomment and fix the Windows
ones with your actual username:

```ini
LOCAL_DIR=C:/Users/YOU/Documents
HUB_DIR=C:/Users/YOU/OneDrive/Documents
```

Then:

```powershell
.\docsync.ps1 -DryRun        # says what it would do, changes nothing
.\install-windows.ps1        # runs at logon + every 15 minutes from now on
```

No administrator rights needed; the task runs as you, only while you are
logged in.

---

## Day to day

You do not have to do anything. If you want to force a sync right now:

```bash
./docsync.sh          # Mac
.\docsync.ps1         # Windows
```

Useful flags (same on both, `--flag` on Mac, `-Flag` on Windows):

| | |
|---|---|
| `--dry-run` / `-DryRun` | Report what would change, touch nothing. |
| `--resync` / `-Resync` | Rebuild the baseline: union of both sides, newest wins, **nothing is deleted**. Use it after moving folders or after a safety abort. |
| `--verbose` / `-VerboseSync` | Full rclone chatter. |

Check on the background job:

```bash
./install-mac.sh --status        # Mac
.\install-windows.ps1 -Status    # Windows
```

Logs live in `~/.docsync/logs/` (Mac) or `%USERPROFILE%\.docsync\logs\`
(Windows), one file per day, kept for two weeks.

---

## What happens when things collide

**The first run** merges: every file on either side ends up on both sides, and
where the same filename exists on both, the newer copy wins. Nothing is deleted.

**You edited the same file on both machines.** The newer version keeps the real
filename; the older one is kept next to it as `report.conflict1.docx`. Nothing
is thrown away — open both, keep what you want, delete the other.

If the two edits have identical timestamps, docsync cannot tell which is newer,
so it keeps **both** as `report.conflict1.docx` and `report.conflict2.docx`.
Rename whichever one you want back to `report.docx`.

**You deleted something.** It disappears on the other machine too — that is what
you asked for — but a copy is kept in `~/.docsync/trash/` for 30 days first.
Deleted the wrong thing? Copy it back out of there.

**Everything looks deleted.** If more than 25% of your files vanish from one
side between runs, docsync **stops and changes nothing**, because the usual
cause is OneDrive not having finished downloading rather than you deleting a
thousand files. Let OneDrive settle and run it again. If it really was you,
`--resync` accepts the current state without deleting anything.

You can raise that threshold with `MAX_DELETE_PERCENT` in `docsync.conf` if you
routinely bin large batches between runs.

---

## Things worth knowing

- **Don't point this at a folder iCloud is also managing.** If you use
  "Desktop & Documents Folders" in iCloud Drive on the Mac, turn it off first.
  Two sync engines on one folder will fight.
- **Filenames.** macOS allows characters OneDrive rejects (`: * ? " < > |` and
  trailing spaces). Such files sync fine between your local folder and the hub
  folder, but the OneDrive app will flag them and refuse to upload — check the
  OneDrive activity centre if a file never reaches the other machine.
- **Symlinks and aliases** are skipped, not followed.
- **Big files** move at whatever speed OneDrive uploads them; docsync only
  copies between two local folders, so it is fast — the wait is OneDrive's.
- Every deletion and overwrite is recoverable from `~/.docsync/trash/` for 30
  days, and OneDrive keeps its own version history on top of that.

---

## Undo it all

```bash
./install-mac.sh --uninstall        # Mac
.\install-windows.ps1 -Uninstall    # Windows
```

That removes the background job. Your documents are untouched, and both folders
keep whatever they currently have. Delete `~/.docsync/` to remove the state,
logs and trash as well.

---

## First-run checklist

Worth walking through once on each machine, on scratch folders, before you point
it at real documents. Make two test folders, point `docsync.conf` at them, then:

1. Put a different file in each folder → run → both files are in both folders.
2. Add a file on one side → run → it appears on the other.
3. Edit a file on one side → run → the change appears on the other.
4. Delete a file on one side → run → it goes away on the other, and a copy is in
   `~/.docsync/trash/`.
5. Empty one folder completely → run → it **refuses** and changes nothing.
6. Run it twice at once → the second run exits saying one is already in progress.

Then repoint `docsync.conf` at your real `Documents`, run `--dry-run` once, read
what it says, and run it for real.
