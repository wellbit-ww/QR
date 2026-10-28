# Stop equipment portal stack (default: Node on :3000 only).
# Usage: .\scripts\stop-equipment-stack.ps1 [-All]
param(
  [switch]$All
)

$ErrorActionPreference = "SilentlyContinue"
$script:rows = @()

function Stop-PortListener {
  param([int]$Port, [string]$Label)
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    $script:rows += [pscustomobject]@{ Port = $Port; Label = $Label; Pid = "-"; Status = "skipped (free)" }
    return
  }
  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }
  foreach ($procId in $pids) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.Name } else { "?" }
    $cmd = if ($proc) { $proc.CommandLine } else { "" }
    $isPortal = ($name -eq "node.exe") -and ($cmd -match "server\.js" -or $Port -eq 3000)
    if ($isPortal -or $Port -eq 3000) {
      taskkill /PID $procId /F | Out-Null
      $script:rows += [pscustomobject]@{ Port = $Port; Label = $Label; Pid = $procId; Status = "stopped" }
    } else {
      $script:rows += [pscustomobject]@{ Port = $Port; Label = $Label; Pid = $procId; Status = "skipped (not portal node)" }
    }
  }
}

Stop-PortListener -Port 3000 -Label "equipment portal (server.js)"

if ($All) {
  Write-Host "Stopping Docker compose (postgres)..."
  Push-Location (Join-Path $PSScriptRoot "..")
  docker compose down 2>&1 | Out-Host
  Pop-Location
  Write-Host "Ollama: stop manually if needed (quit tray / ollama stop)."
}

$script:rows | Format-Table -AutoSize
$still = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($still) {
  Write-Warning "Port 3000 still in LISTEN state."
  exit 1
}
Write-Host "Port 3000 is free."
exit 0
