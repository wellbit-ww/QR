# Keep the SOVTEST portal alive on :3000.
# Usage:
#   .\scripts\ensure-portal-running.ps1
#   .\scripts\ensure-portal-running.ps1 -ForceRestart
param(
  [string]$Root = "",
  [int]$Port = 3000,
  [switch]$ForceRestart,
  [int]$ReadyTimeoutSec = 45
)

$ErrorActionPreference = "Stop"

if (-not $Root) {
  $Root = Resolve-Path (Join-Path $PSScriptRoot "..")
}
$RootWin = ($Root -replace "/", "\").TrimEnd("\")
$logsDir = Join-Path $RootWin "logs"
$keepLog = Join-Path $logsDir "portal-keepalive.log"
$stdoutLog = Join-Path $logsDir "portal-stdout.log"
$stderrLog = Join-Path $logsDir "portal-stderr.log"
$nodeExe = Join-Path ${env:ProgramFiles} "nodejs\node.exe"
$startScript = Join-Path $RootWin "scripts\start-portal.js"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Write-KeepLog([string]$Message) {
  $line = (Get-Date -Format "s") + " " + $Message
  Add-Content -Path $keepLog -Value $line -Encoding UTF8
  Write-Host $line
}

function Test-PortListening {
  $hits = @(netstat -ano | Select-String "LISTENING" | Select-String (":$Port\s"))
  return $hits.Count -gt 0
}

function Test-PortalHealthy {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 3
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Get-PortPids {
  $pids = New-Object "System.Collections.Generic.HashSet[int]"
  $listen = @(netstat -ano | Select-String "LISTENING" | Select-String (":$Port\s"))
  foreach ($line in $listen) {
    $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
    if ($parts.Length -ge 5) {
      $procId = 0
      if ([int]::TryParse($parts[-1], [ref]$procId) -and $procId -gt 0) {
        [void]$pids.Add($procId)
      }
    }
  }
  foreach ($procId in @($pids)) {
    try {
      $proc = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $procId) -ErrorAction SilentlyContinue
      if ($proc -and $proc.ParentProcessId) {
        [void]$pids.Add([int]$proc.ParentProcessId)
      }
    } catch {}
  }
  return @($pids)
}

function Stop-PortalProcesses {
  foreach ($procId in (Get-PortPids)) {
    Write-KeepLog ("Stopping :$Port-related PID " + $procId)
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }

  $markers = @(
    ($RootWin + "\"),
    "Documents\Work\QR\",
    "Documents/Work/QR/",
    "scripts\start-portal.js",
    "scripts/start-portal.js"
  )
  $nodes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue)
  foreach ($proc in $nodes) {
    $cmd = [string]$proc.CommandLine
    if (-not $cmd) { continue }
    $hit = $false
    foreach ($m in $markers) {
      if ($cmd.IndexOf($m, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $hit = $true
        break
      }
    }
    if (-not $hit) { continue }
    Write-KeepLog ("Stopping QR node PID " + $proc.ProcessId)
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

function Start-PortalProcess {
  if (-not (Test-Path $nodeExe)) {
    throw "node.exe not found: $nodeExe"
  }
  if (-not (Test-Path $startScript)) {
    throw "start script not found: $startScript"
  }

  # Rotate oversized logs so Start-Process redirects stay usable.
  foreach ($path in @($stdoutLog, $stderrLog)) {
    if ((Test-Path $path) -and ((Get-Item $path).Length -gt 5MB)) {
      Move-Item -Path $path -Destination ($path + ".old") -Force -ErrorAction SilentlyContinue
    }
  }

  Write-KeepLog "Starting node scripts/start-portal.js"
  $p = Start-Process `
    -FilePath $nodeExe `
    -ArgumentList "`"$startScript`"" `
    -WorkingDirectory $RootWin `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru
  Write-KeepLog ("Started node PID " + $p.Id)
  return $p
}

function Wait-PortalReady([int]$TimeoutSec) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortalHealthy) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

if (-not (Test-Path $RootWin)) {
  throw "Portal root not found: $RootWin"
}

if ($ForceRestart) {
  Write-KeepLog "ForceRestart requested"
  Stop-PortalProcesses
}

if ((-not $ForceRestart) -and (Test-PortalHealthy)) {
  Write-KeepLog "Portal already healthy on :$Port"
  exit 0
}

if ((-not $ForceRestart) -and (Test-PortListening)) {
  Write-KeepLog "Port :$Port is listening but /login is not healthy yet — waiting"
  if (Wait-PortalReady -TimeoutSec 20) {
    Write-KeepLog "Portal became healthy while waiting"
    exit 0
  }
  Write-KeepLog "Unhealthy listener on :$Port — restarting"
  Stop-PortalProcesses
}

Start-PortalProcess | Out-Null

if (-not (Wait-PortalReady -TimeoutSec $ReadyTimeoutSec)) {
  Write-KeepLog "ERROR: portal did not become ready on :$Port within ${ReadyTimeoutSec}s"
  if (Test-Path $stderrLog) {
    Get-Content $stderrLog -Tail 40 -ErrorAction SilentlyContinue | ForEach-Object {
      Write-KeepLog ("stderr: " + $_)
    }
  }
  exit 1
}

Write-KeepLog "Portal ready on :$Port"
exit 0
