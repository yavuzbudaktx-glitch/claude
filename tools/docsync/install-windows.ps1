<#
.SYNOPSIS
  Install docsync as a background task on Windows, so you never have to
  remember to run it.

.DESCRIPTION
  Registers a Scheduled Task that runs when you log in and every 15 minutes
  after that. It runs as you, only while you are logged on, so no password is
  stored and nothing needs administrator rights.

.EXAMPLE
  .\install-windows.ps1
  .\install-windows.ps1 -IntervalMinutes 10
  .\install-windows.ps1 -Status
  .\install-windows.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [switch]$Status,
    [int]$IntervalMinutes = 15
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName  = 'DocSync'
$Runner    = Join-Path $ScriptDir 'docsync.ps1'
$ConfFile  = Join-Path $ScriptDir 'docsync.conf'

# --- status ----------------------------------------------------------------

if ($Status) {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
        Write-Host "docsync is installed."
        Write-Host "  state         : $($task.State)"
        Write-Host "  last run      : $($info.LastRunTime)"
        Write-Host "  last result   : $($info.LastTaskResult)  (0 means success)"
        Write-Host "  next run      : $($info.NextRunTime)"
    } else {
        Write-Host "docsync is not installed. Run .\install-windows.ps1 to set it up."
    }
    exit 0
}

# --- uninstall -------------------------------------------------------------

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "docsync background task removed."
    } else {
        Write-Host "docsync was not installed; nothing to remove."
    }
    Write-Host "Your files and the scripts are untouched; run .\docsync.ps1 by hand any time."
    exit 0
}

# --- install ---------------------------------------------------------------

if (-not (Test-Path $ConfFile)) {
    Write-Host "No docsync.conf yet. Create it first:" -ForegroundColor Red
    Write-Host "    Copy-Item `"$ScriptDir\docsync.conf.example`" `"$ScriptDir\docsync.conf`""
    Write-Host "then edit LOCAL_DIR and HUB_DIR before installing."
    exit 2
}

# If OneDrive is already backing up the Documents folder, Documents IS the
# OneDrive folder and there is nothing for docsync to do on this PC.
$myDocs = [Environment]::GetFolderPath('MyDocuments')
if ($myDocs -like '*OneDrive*') {
    Write-Host ""
    Write-Host "Heads up: your Documents folder is already redirected into OneDrive:" -ForegroundColor Yellow
    Write-Host "    $myDocs"
    Write-Host ""
    Write-Host "That means OneDrive is syncing your documents natively on this PC, in real"
    Write-Host "time, and you do NOT need docsync here. Set up the Mac side only."
    Write-Host ""
    Write-Host "(If you still want docsync on this PC for a different pair of folders,"
    Write-Host " point LOCAL_DIR and HUB_DIR at them in docsync.conf and re-run.)"
    Write-Host ""
}

# Fail early rather than installing a task that will silently error every 15 min.
Write-Host "Checking the configuration with a dry run..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Runner -DryRun | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "The dry run failed, so the background task was NOT installed." -ForegroundColor Red
    Write-Host "Run this and fix what it reports, then try again:"
    Write-Host "    .\docsync.ps1 -DryRun"
    exit 1
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`"" `
    -WorkingDirectory $ScriptDir

# Two triggers: once at logon, then on a repeating timer for the rest of the session.
$triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes))
)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Principal $principal `
    -Description 'Two-way sync between the local Documents folder and OneDrive (docsync).' | Out-Null

$logDir = ($env:USERPROFILE + '\.docsync\logs')
foreach ($line in Get-Content $ConfFile) {
    if ($line.Trim().StartsWith('LOG_DIR=')) {
        $logDir = $line.Trim().Substring(8).Trim('"').Trim("'").Replace('~', $env:USERPROFILE)
    }
}

Write-Host ""
Write-Host "docsync is installed."
Write-Host ""
Write-Host "  runs        : at logon, then every $IntervalMinutes minutes"
Write-Host "  logs        : $logDir"
Write-Host "  check it    : .\install-windows.ps1 -Status"
Write-Host "  run it now  : .\docsync.ps1"
Write-Host "  remove it   : .\install-windows.ps1 -Uninstall"
Write-Host ""
