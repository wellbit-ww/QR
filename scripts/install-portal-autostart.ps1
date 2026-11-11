# Install Windows Scheduled Task that keeps the portal running.
# Runs at startup, at user logon, and every 2 minutes if :3000 is down.
# Usage (on the portal server):
#   .\scripts\install-portal-autostart.ps1
#   .\scripts\install-portal-autostart.ps1 -Uninstall
param(
  [string]$Root = "",
  [string]$TaskName = "SovaPortal",
  [int]$IntervalMinutes = 2,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

if (-not $Root) {
  $Root = Resolve-Path (Join-Path $PSScriptRoot "..")
}
$RootWin = ($Root -replace "/", "\").TrimEnd("\")
$ensureScript = Join-Path $RootWin "scripts\ensure-portal-running.ps1"

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed scheduled task: $TaskName"
  exit 0
}

if (-not (Test-Path $ensureScript)) {
  throw "Missing ensure script: $ensureScript"
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$ensureScript`" -Root `"$RootWin`""
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $arg `
  -WorkingDirectory $RootWin

$triggerStartup = New-ScheduledTaskTrigger -AtStartup
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Repeating keep-alive every N minutes for ~10 years (effectively indefinite).
$triggerRepeat = New-ScheduledTaskTrigger `
  -Once `
  -At ((Get-Date).AddMinutes(1)) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger @($triggerStartup, $triggerLogon, $triggerRepeat) `
  -Settings $settings `
  -Principal $principal `
  -Description "SOVTEST portal keep-alive: starts npm/node portal if :3000 is down" `
  -Force | Out-Null

Write-Host "Installed scheduled task: $TaskName"
Write-Host "  ensure: $ensureScript"
Write-Host "  interval: every $IntervalMinutes min + startup + logon"

# Kick once immediately so the portal is up after install.
& $ensureScript -Root $RootWin
$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host ("Task state=" + $task.State + " lastResult=" + $info.LastTaskResult)
