#!/usr/bin/env bash
#
# Install docsync as a background job on macOS, so you never have to remember
# to run it. Uses launchd: the job runs when you log in and every 15 minutes
# after that, whether or not a Terminal window is open.
#
# Usage:
#   ./install-mac.sh              install (or reinstall) the job
#   ./install-mac.sh --interval 600   run every 10 minutes instead of 15
#   ./install-mac.sh --uninstall  remove the job (the scripts stay put)
#   ./install-mac.sh --status     is it installed, and when did it last run?
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.docsync.agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
INTERVAL=900
ACTION=install

while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) ACTION=uninstall ;;
    --status)    ACTION=status ;;
    --interval)  INTERVAL="${2:-900}"; shift ;;
    -h|--help)   sed -n '3,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "install-mac: unknown option '$1'" >&2; exit 2 ;;
  esac
  shift
done

unload_job() {
  if launchctl bootout "gui/$UID/$LABEL" 2>/dev/null; then return 0; fi
  launchctl unload "$PLIST" 2>/dev/null || true   # pre-Catalina fallback
}

case "$ACTION" in
  status)
    if [ -f "$PLIST" ] && launchctl list 2>/dev/null | grep -q "$LABEL"; then
      echo "docsync is installed and loaded."
      launchctl list | grep "$LABEL" | awk '{print "  last exit status: " $2}'
      echo "  plist: $PLIST"
      LOG_DIR="$(grep -E '^LOG_DIR=' "$SCRIPT_DIR/docsync.conf" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
      LOG_DIR="${LOG_DIR:-$HOME/.docsync/logs}"
      LOG_DIR="${LOG_DIR/#\~/$HOME}"
      LATEST="$(ls -t "$LOG_DIR"/docsync-*.log 2>/dev/null | head -1 || true)"
      [ -n "$LATEST" ] && echo "  most recent run: $(tail -1 "$LATEST")"
    else
      echo "docsync is not installed. Run ./install-mac.sh to set it up."
    fi
    exit 0
    ;;
  uninstall)
    unload_job
    rm -f "$PLIST"
    echo "docsync background job removed."
    echo "Your files and the scripts are untouched; run ./docsync.sh by hand any time."
    exit 0
    ;;
esac

# --- install ---------------------------------------------------------------

if [ ! -f "$SCRIPT_DIR/docsync.conf" ]; then
  echo "No docsync.conf yet. Create it first:" >&2
  echo "    cp \"$SCRIPT_DIR/docsync.conf.example\" \"$SCRIPT_DIR/docsync.conf\"" >&2
  echo "then edit LOCAL_DIR and HUB_DIR before installing." >&2
  exit 2
fi

chmod +x "$SCRIPT_DIR/docsync.sh"

# Fail early rather than installing a job that will silently error every 15 min.
echo "Checking the configuration with a dry run..."
if ! "$SCRIPT_DIR/docsync.sh" --dry-run >/dev/null 2>&1; then
  echo "" >&2
  echo "The dry run failed, so the background job was NOT installed." >&2
  echo "Run this and fix what it reports, then try again:" >&2
  echo "    $SCRIPT_DIR/docsync.sh --dry-run" >&2
  exit 1
fi

LOG_DIR="$(grep -E '^LOG_DIR=' "$SCRIPT_DIR/docsync.conf" | cut -d= -f2- | tr -d '"' || true)"
LOG_DIR="${LOG_DIR:-$HOME/.docsync/logs}"
LOG_DIR="${LOG_DIR/#\~/$HOME}"
mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

unload_job

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$SCRIPT_DIR/docsync.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>$INTERVAL</integer>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/launchd.err.log</string>
    <key>ProcessType</key>
    <string>Background</string>
    <key>LowPriorityIO</key>
    <true/>
</dict>
</plist>
PLIST_EOF

if ! launchctl bootstrap "gui/$UID" "$PLIST" 2>/dev/null; then
  launchctl load "$PLIST"   # pre-Catalina fallback
fi

cat <<EOF

docsync is installed.

  runs        : at login, then every $((INTERVAL / 60)) minutes
  logs        : $LOG_DIR
  check it    : ./install-mac.sh --status
  run it now  : ./docsync.sh
  remove it   : ./install-mac.sh --uninstall

One more thing, and it is easy to miss: macOS blocks background jobs from
reading ~/Documents until you allow it. Open

  System Settings -> Privacy & Security -> Full Disk Access

and add the rclone binary ($(command -v rclone 2>/dev/null || echo 'run: which rclone')).
If the logs start filling with "operation not permitted", this is why.
EOF
