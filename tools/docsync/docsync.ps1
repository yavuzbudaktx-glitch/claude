<#
.SYNOPSIS
  docsync -- keep a local folder and a OneDrive folder in two-way sync (Windows).

.DESCRIPTION
  The actual syncing is done by "rclone bisync", which remembers the state of
  the last run and can therefore tell "deleted here" apart from "new over
  there". This script is the safety rails around it: config, preflight checks,
  locking, a trash folder, logging and log rotation.

  This is the exact counterpart of docsync.sh on the Mac; both sides read the
  same style of config file and behave the same way.

.EXAMPLE
  .\docsync.ps1
  .\docsync.ps1 -DryRun
  .\docsync.ps1 -Resync
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Resync,
    [switch]$VerboseSync,
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'

$ScriptDir        = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'docsync.conf' }
$MinRcloneVersion = [version]'1.66'
$LockStaleMinutes = 60

# --- config ----------------------------------------------------------------

if (-not (Test-Path $ConfigPath)) {
    Write-Host "docsync: no config found at $ConfigPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Create one first:"
    Write-Host "    Copy-Item `"$ScriptDir\docsync.conf.example`" `"$ScriptDir\docsync.conf`""
    Write-Host "then edit it so LOCAL_DIR and HUB_DIR point at the right folders."
    exit 2
}

function Expand-HomePath([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return $p }
    $p = $p.Trim().Trim('"').Trim("'")
    if ($p -eq '~')        { return $HOME }
    if ($p.StartsWith('~/') -or $p.StartsWith('~\')) { return (Join-Path $HOME $p.Substring(2)) }
    return $p
}

# Defaults, overridden by whatever the config sets.
$cfg = @{
    MAX_DELETE_PERCENT = '25'
    TRASH_DIR          = '~/.docsync/trash'
    TRASH_KEEP_DAYS    = '30'
    STATE_DIR          = '~/.docsync/state'
    LOG_DIR            = '~/.docsync/logs'
    LOG_KEEP_DAYS      = '14'
    MODIFY_WINDOW      = '1ns'
    RCLONE_BIN         = 'rclone'
}

foreach ($line in Get-Content $ConfigPath) {
    $t = $line.Trim()
    if ($t -eq '' -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -lt 1) { continue }
    $cfg[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
}

$LocalDir = Expand-HomePath $cfg['LOCAL_DIR']
$HubDir   = Expand-HomePath $cfg['HUB_DIR']
$TrashDir = Expand-HomePath $cfg['TRASH_DIR']
$StateDir = Expand-HomePath $cfg['STATE_DIR']
$LogDir   = Expand-HomePath $cfg['LOG_DIR']
$RcloneBin = $cfg['RCLONE_BIN']
$MaxDeletePercent = $cfg['MAX_DELETE_PERCENT']
$ModifyWindow     = $cfg['MODIFY_WINDOW']

foreach ($d in @($StateDir, $LogDir, $TrashDir)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

$LogFile = Join-Path $LogDir ("docsync-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

function Write-Log([string]$msg) {
    $stamped = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $stamped
    Add-Content -Path $LogFile -Value $stamped
}
function Stop-WithError([string]$msg) {
    Write-Log "ERROR: $msg"
    exit 1
}

# --- preflight -------------------------------------------------------------

$rclone = Get-Command $RcloneBin -ErrorAction SilentlyContinue
if (-not $rclone) {
    Stop-WithError "rclone not found (RCLONE_BIN=$RcloneBin). Install it with: winget install Rclone.Rclone"
}

$versionLine = (& $RcloneBin version 2>$null | Select-Object -First 1)
if ($versionLine -match 'v(\d+\.\d+(\.\d+)?)') {
    $have = [version]$Matches[1]
    if ($have -lt $MinRcloneVersion) {
        Stop-WithError "rclone $have is too old; need $MinRcloneVersion or newer for conflict resolution. Upgrade with: winget upgrade Rclone.Rclone"
    }
}

if (-not $LocalDir -or -not $HubDir) { Stop-WithError "LOCAL_DIR and HUB_DIR must both be set in $ConfigPath" }
if (-not (Test-Path $LocalDir -PathType Container)) { Stop-WithError "LOCAL_DIR does not exist: $LocalDir" }
if (-not (Test-Path $HubDir   -PathType Container)) { Stop-WithError "HUB_DIR does not exist: $HubDir (is OneDrive installed and signed in?)" }

$sep = [System.IO.Path]::DirectorySeparatorChar
function Get-RealPath([string]$p) { return (Resolve-Path $p).ProviderPath.TrimEnd('\', '/') }
function Test-IsInside([string]$child, [string]$parent) {
    return $child.StartsWith("$parent$sep", [StringComparison]::OrdinalIgnoreCase)
}

$LocalReal = Get-RealPath $LocalDir
$HubReal   = Get-RealPath $HubDir
$TrashReal = Get-RealPath $TrashDir

if ($LocalReal -eq $HubReal) {
    Stop-WithError ("LOCAL_DIR and HUB_DIR are the same folder ($LocalReal). Nothing to sync -- " +
        "OneDrive is already backing up this folder directly (Settings -> Sync and backup -> Manage backup), " +
        "which means this PC needs no docsync at all. Your documents already reach the Mac through OneDrive.")
}
if (Test-IsInside $HubReal $LocalReal) {
    Stop-WithError "HUB_DIR ($HubReal) is inside LOCAL_DIR ($LocalReal). They must not overlap."
}
if (Test-IsInside $LocalReal $HubReal) {
    Stop-WithError "LOCAL_DIR ($LocalReal) is inside HUB_DIR ($HubReal). They must not overlap."
}
if ((Test-IsInside $TrashReal $LocalReal) -or (Test-IsInside $TrashReal $HubReal)) {
    Stop-WithError "TRASH_DIR ($TrashReal) must live outside both synced folders."
}

function Test-EmptyDir([string]$p) {
    return (@(Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue).Count -eq 0)
}

# bisync keeps one .lst listing per side; their absence means we have no baseline.
$HaveBaseline = (@(Get-ChildItem -LiteralPath $StateDir -Filter '*.lst' -ErrorAction SilentlyContinue).Count -gt 0)

# An empty folder next to a full one is almost always a mount problem, not a
# real mass deletion. Refuse before bisync gets a chance to propagate it.
if ($HaveBaseline -and -not $Resync) {
    if ((Test-EmptyDir $HubDir) -and -not (Test-EmptyDir $LocalDir)) {
        Stop-WithError "HUB_DIR ($HubDir) is empty but LOCAL_DIR is not. OneDrive is probably still starting up or not signed in. Refusing to sync."
    }
    if ((Test-EmptyDir $LocalDir) -and -not (Test-EmptyDir $HubDir)) {
        Stop-WithError "LOCAL_DIR ($LocalDir) is empty but HUB_DIR is not. Refusing to sync -- if you really emptied it, run with -Resync."
    }
}

# --- single instance -------------------------------------------------------

$LockDir = Join-Path $StateDir 'docsync.lock'
$gotLock = $false
try {
    New-Item -ItemType Directory -Path $LockDir -ErrorAction Stop | Out-Null
    $gotLock = $true
} catch {
    $age = (Get-Date) - (Get-Item $LockDir).LastWriteTime
    if ($age.TotalMinutes -gt $LockStaleMinutes) {
        Write-Log "clearing stale lock (older than $LockStaleMinutes minutes)"
        Remove-Item -Recurse -Force $LockDir
        New-Item -ItemType Directory -Path $LockDir -ErrorAction Stop | Out-Null
        $gotLock = $true
    } else {
        Write-Log "another docsync run is in progress ($LockDir); exiting"
        exit 0
    }
}

try {
    Set-Content -Path (Join-Path $LockDir 'pid') -Value $PID

    # --- build the rclone command -----------------------------------------

    $stamp = Get-Date -Format 'yyyy-MM-dd'
    $rcArgs = @(
        'bisync', $LocalReal, $HubReal,
        '--conflict-resolve', 'newer',
        '--conflict-loser', 'num',
        '--conflict-suffix', 'conflict',
        '--suffix-keep-extension',
        '--max-delete', $MaxDeletePercent,
        '--backup-dir1', (Join-Path (Join-Path $TrashReal 'local') $stamp),
        '--backup-dir2', (Join-Path (Join-Path $TrashReal 'hub') $stamp),
        '--create-empty-src-dirs',
        '--resilient',
        '--recover',
        '--modify-window', $ModifyWindow,
        '--workdir', $StateDir,
        '--log-file', $LogFile,
        '--log-level', 'INFO'
    )

    $doResync = $false
    if ($Resync) {
        $doResync = $true
        Write-Log "-Resync requested: rebuilding the baseline."
    } elseif (-not $HaveBaseline) {
        $doResync = $true
        Write-Log "No previous sync state found -- this is the first run."
        Write-Log "Doing a baseline merge: every file on either side ends up on both sides,"
        Write-Log "the newer copy wins where names collide, and nothing is deleted."
    }

    if ($doResync)   { $rcArgs += @('--resync', '--resync-mode', 'newer') }
    if ($DryRun)     { $rcArgs += '--dry-run' }
    if ($VerboseSync){ $rcArgs += '--verbose' }

    Write-Log "syncing: $LocalReal  <->  $HubReal"
    if ($DryRun) { Write-Log "(dry run -- nothing will be changed)" }

    # --- run ---------------------------------------------------------------

    $logLinesBefore = 0
    if (Test-Path $LogFile) { $logLinesBefore = @(Get-Content $LogFile).Count }

    & $RcloneBin @rcArgs
    $status = $LASTEXITCODE

    # Only this run's lines -- the log file accumulates all day.
    $runLog = ''
    if (Test-Path $LogFile) {
        $runLog = (Get-Content $LogFile | Select-Object -Skip $logLinesBefore) -join "`n"
    }

    if ($status -ne 0) {
        if ($runLog -match 'too many deletes') {
            Write-Log ""
            Write-Log "STOPPED BY THE SAFETY CHECK: more than $MaxDeletePercent% of the files on one side"
            Write-Log "looked deleted, so NOTHING was changed on either side."
            Write-Log ""
            Write-Log "Usually this means OneDrive had not finished downloading the hub folder yet."
            Write-Log "Wait for OneDrive to settle (its cloud icon stops spinning) and run again."
            Write-Log "If you really did delete that many files on purpose:"
            Write-Log "    .\docsync.ps1 -Resync    # accept the current state, deleting nothing"
        } elseif ($runLog -match 'all files were changed|all files were deleted|Safety abort') {
            Write-Log ""
            Write-Log "STOPPED BY THE SAFETY CHECK: every file on one side looked changed or deleted,"
            Write-Log "so NOTHING was changed on either side."
            Write-Log ""
            Write-Log "Check that both folders look right, then run again. To accept the current"
            Write-Log "state as the new baseline (deleting nothing):"
            Write-Log "    .\docsync.ps1 -Resync"
        } else {
            Write-Log "rclone exited with status $status -- see $LogFile"
        }
    } else {
        if ($doResync -and -not $DryRun) {
            Write-Log "baseline established; from now on additions, edits and deletions propagate both ways."
        }
        Write-Log "done."
    }
}
finally {
    if ($gotLock) { Remove-Item -Recurse -Force $LockDir -ErrorAction SilentlyContinue }
}

# --- housekeeping ----------------------------------------------------------

$trashCutoff = (Get-Date).AddDays(-[int]$cfg['TRASH_KEEP_DAYS'])
Get-ChildItem -LiteralPath $TrashDir -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue } |
    Where-Object { $_.LastWriteTime -lt $trashCutoff } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

$logCutoff = (Get-Date).AddDays(-[int]$cfg['LOG_KEEP_DAYS'])
Get-ChildItem -LiteralPath $LogDir -Filter 'docsync-*.log' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $logCutoff } |
    Remove-Item -Force -ErrorAction SilentlyContinue

exit $status
