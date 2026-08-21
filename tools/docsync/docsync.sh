#!/usr/bin/env bash
#
# docsync -- keep a local folder and a OneDrive folder in two-way sync (macOS/Linux).
#
# The actual syncing is done by "rclone bisync", which remembers the state of the
# last run and can therefore tell "deleted here" apart from "new over there".
# This script is the safety rails around it: config, preflight checks, locking,
# a trash folder, logging and log rotation.
#
# Usage: ./docsync.sh [--dry-run] [--resync] [--verbose] [--config PATH]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/docsync.conf"
MIN_RCLONE_VERSION="1.66"
LOCK_STALE_MINUTES=60

DRY_RUN=0
FORCE_RESYNC=0
VERBOSE=0

usage() {
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Options:
  --dry-run        Report what would change without touching a single file.
  --resync         Rebuild the baseline from scratch (union merge, newest wins,
                   nothing is ever deleted). Use after moving folders around.
  --verbose        Verbose rclone output.
  --config PATH    Use a different config file.
  -h, --help       This text.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --resync)  FORCE_RESYNC=1 ;;
    --verbose|-v) VERBOSE=1 ;;
    --config)  CONFIG_FILE="${2:-}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "docsync: unknown option '$1' (try --help)" >&2; exit 2 ;;
  esac
  shift
done

# --- config ----------------------------------------------------------------

if [ ! -f "$CONFIG_FILE" ]; then
  cat >&2 <<EOF
docsync: no config found at $CONFIG_FILE

Create one first:
    cp "$SCRIPT_DIR/docsync.conf.example" "$SCRIPT_DIR/docsync.conf"
then edit it so LOCAL_DIR and HUB_DIR point at the right folders.
EOF
  exit 2
fi

# Defaults, overridden by whatever the config sets.
MAX_DELETE_PERCENT=25
TRASH_DIR=~/.docsync/trash
TRASH_KEEP_DAYS=30
STATE_DIR=~/.docsync/state
LOG_DIR=~/.docsync/logs
LOG_KEEP_DAYS=14
MODIFY_WINDOW=1ns
RCLONE_BIN=rclone

# shellcheck disable=SC1090
source "$CONFIG_FILE"

# "~/x" survives quoting in the config file, so expand it by hand.
expand_home() {
  case "$1" in
    "~") printf '%s' "$HOME" ;;
    "~/"*) printf '%s' "$HOME/${1#\~/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

LOCAL_DIR="$(expand_home "${LOCAL_DIR:-}")"
HUB_DIR="$(expand_home "${HUB_DIR:-}")"
TRASH_DIR="$(expand_home "$TRASH_DIR")"
STATE_DIR="$(expand_home "$STATE_DIR")"
LOG_DIR="$(expand_home "$LOG_DIR")"

mkdir -p "$STATE_DIR" "$LOG_DIR" "$TRASH_DIR"

LOG_FILE="$LOG_DIR/docsync-$(date +%Y-%m-%d).log"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }
die() { log "ERROR: $*"; exit 1; }

# --- preflight -------------------------------------------------------------

command -v "$RCLONE_BIN" >/dev/null 2>&1 || die "rclone not found (RCLONE_BIN=$RCLONE_BIN). Install it with: brew install rclone"

RCLONE_VERSION="$("$RCLONE_BIN" version 2>/dev/null | head -1 | sed 's/^rclone v//')"
version_lt() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ] && [ "$1" != "$2" ]; }
if version_lt "$RCLONE_VERSION" "$MIN_RCLONE_VERSION"; then
  die "rclone $RCLONE_VERSION is too old; need $MIN_RCLONE_VERSION or newer for conflict resolution. Upgrade with: brew upgrade rclone"
fi

[ -n "$LOCAL_DIR" ] && [ -n "$HUB_DIR" ] || die "LOCAL_DIR and HUB_DIR must both be set in $CONFIG_FILE"
[ -d "$LOCAL_DIR" ] || die "LOCAL_DIR does not exist: $LOCAL_DIR"
[ -d "$HUB_DIR" ] || die "HUB_DIR does not exist: $HUB_DIR (is OneDrive installed and signed in?)"

LOCAL_REAL="$(cd "$LOCAL_DIR" && pwd -P)"
HUB_REAL="$(cd "$HUB_DIR" && pwd -P)"

if [ "$LOCAL_REAL" = "$HUB_REAL" ]; then
  die "LOCAL_DIR and HUB_DIR are the same folder ($LOCAL_REAL). Nothing to sync -- OneDrive is already managing this folder directly, so you don't need docsync on this machine."
fi
case "$HUB_REAL/" in "$LOCAL_REAL"/*) die "HUB_DIR ($HUB_REAL) is inside LOCAL_DIR ($LOCAL_REAL). They must not overlap." ;; esac
case "$LOCAL_REAL/" in "$HUB_REAL"/*) die "LOCAL_DIR ($LOCAL_REAL) is inside HUB_DIR ($HUB_REAL). They must not overlap." ;; esac

TRASH_REAL="$(cd "$TRASH_DIR" && pwd -P)"
case "$TRASH_REAL/" in
  "$LOCAL_REAL"/*|"$HUB_REAL"/*) die "TRASH_DIR ($TRASH_REAL) must live outside both synced folders." ;;
esac

is_empty_dir() { [ -z "$(ls -A "$1" 2>/dev/null)" ]; }

# bisync keeps one .lst listing per side; their absence means we have no baseline.
HAVE_BASELINE=0
if ls "$STATE_DIR"/*.lst >/dev/null 2>&1; then HAVE_BASELINE=1; fi

# An empty folder next to a full one is almost always a mount problem, not a
# real mass deletion. Refuse before bisync gets a chance to propagate it.
if [ "$HAVE_BASELINE" -eq 1 ] && [ "$FORCE_RESYNC" -eq 0 ]; then
  if is_empty_dir "$HUB_DIR" && ! is_empty_dir "$LOCAL_DIR"; then
    die "HUB_DIR ($HUB_DIR) is empty but LOCAL_DIR is not. OneDrive is probably not mounted or still starting up. Refusing to sync."
  fi
  if is_empty_dir "$LOCAL_DIR" && ! is_empty_dir "$HUB_DIR"; then
    die "LOCAL_DIR ($LOCAL_DIR) is empty but HUB_DIR is not. Refusing to sync -- if you really emptied it, run with --resync."
  fi
fi

# --- single instance -------------------------------------------------------

LOCK_DIR="$STATE_DIR/docsync.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +$LOCK_STALE_MINUTES 2>/dev/null)" ]; then
    log "clearing stale lock (older than ${LOCK_STALE_MINUTES}m)"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR" 2>/dev/null || die "could not acquire lock at $LOCK_DIR"
  else
    log "another docsync run is in progress ($LOCK_DIR); exiting"
    exit 0
  fi
fi
echo "$$" > "$LOCK_DIR/pid"
cleanup() { rm -rf "$LOCK_DIR"; }
trap cleanup EXIT INT TERM

# --- build the rclone command ---------------------------------------------

STAMP="$(date +%Y-%m-%d)"
ARGS=(
  bisync "$LOCAL_DIR" "$HUB_DIR"
  --conflict-resolve newer
  --conflict-loser num
  --conflict-suffix conflict
  --suffix-keep-extension
  --max-delete "$MAX_DELETE_PERCENT"
  --backup-dir1 "$TRASH_DIR/local/$STAMP"
  --backup-dir2 "$TRASH_DIR/hub/$STAMP"
  --create-empty-src-dirs
  --resilient
  --recover
  --modify-window "$MODIFY_WINDOW"
  --workdir "$STATE_DIR"
  --log-file "$LOG_FILE"
  --log-level INFO
)

RESYNC=0
if [ "$FORCE_RESYNC" -eq 1 ]; then
  RESYNC=1
  log "--resync requested: rebuilding the baseline."
elif [ "$HAVE_BASELINE" -eq 0 ]; then
  RESYNC=1
  log "No previous sync state found -- this is the first run."
  log "Doing a baseline merge: every file on either side ends up on both sides,"
  log "the newer copy wins where names collide, and nothing is deleted."
fi

if [ "$RESYNC" -eq 1 ]; then
  ARGS+=(--resync --resync-mode newer)
fi
[ "$DRY_RUN" -eq 1 ] && ARGS+=(--dry-run)
[ "$VERBOSE" -eq 1 ] && ARGS+=(--verbose)

log "syncing: $LOCAL_DIR  <->  $HUB_DIR"
[ "$DRY_RUN" -eq 1 ] && log "(dry run -- nothing will be changed)"

# --- run -------------------------------------------------------------------

LOG_OFFSET=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)

set +e
"$RCLONE_BIN" "${ARGS[@]}"
STATUS=$?
set -e

# Only this run's lines -- the log file accumulates all day.
RUN_LOG="$(tail -c "+$((LOG_OFFSET + 1))" "$LOG_FILE" 2>/dev/null || true)"

if [ "$STATUS" -ne 0 ]; then
  case "$RUN_LOG" in
    *"too many deletes"*)
      log ""
      log "STOPPED BY THE SAFETY CHECK: more than ${MAX_DELETE_PERCENT}% of the files on one side"
      log "looked deleted, so NOTHING was changed on either side."
      log ""
      log "Usually this means OneDrive had not finished downloading the hub folder yet."
      log "Wait for OneDrive to settle (its icon stops spinning) and run again."
      log "If you really did delete that many files on purpose:"
      log "    $0 --resync    # accept the current state, deleting nothing"
      ;;
    *"all files were changed"*|*"all files were deleted"*|*"Safety abort"*)
      log ""
      log "STOPPED BY THE SAFETY CHECK: every file on one side looked changed or deleted,"
      log "so NOTHING was changed on either side."
      log ""
      log "Check that both folders look right, then run again. To accept the current"
      log "state as the new baseline (deleting nothing):"
      log "    $0 --resync"
      ;;
    *)
      log "rclone exited with status $STATUS -- see $LOG_FILE"
      ;;
  esac
else
  if [ "$RESYNC" -eq 1 ] && [ "$DRY_RUN" -eq 0 ]; then
    log "baseline established; from now on additions, edits and deletions propagate both ways."
  fi
  log "done."
fi

# --- housekeeping ----------------------------------------------------------

find "$TRASH_DIR" -mindepth 2 -maxdepth 2 -type d -mtime "+$TRASH_KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true
find "$LOG_DIR" -maxdepth 1 -name 'docsync-*.log' -mtime "+$LOG_KEEP_DAYS" -delete 2>/dev/null || true

exit "$STATUS"
