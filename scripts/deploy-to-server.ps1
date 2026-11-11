# Deploy current branch to the LAN Windows portal server.
# Uses git bundle + scp (Windows OpenSSH breaks direct git-push paths).
# Usage:
#   npm run deploy:server
#   .\scripts\deploy-to-server.ps1 -SkipGithub -SkipRestart
param(
  # Real running portal lives here (NOT sova_rag_system).
  [string]$SshTarget = "SOVAI@192.168.7.170",
  [string]$RemotePath = "C:/Users/SOVAI/Documents/Work/QR",
  [string]$RemoteHomeRelative = "Documents/Work/QR",
  [string]$Branch = "",
  [switch]$SkipGithub,
  [switch]$SkipPush,
  [switch]$SkipRestart
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
if ($SkipPush) { $SkipGithub = $true }

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command not found: $Name"
  }
}

function Get-SshArgs {
  $keyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
  $sshArgs = @("-o", "ConnectTimeout=12")
  if (Test-Path $keyPath) {
    $sshArgs += @("-o", "IdentitiesOnly=yes", "-i", $keyPath)
  }
  return ,$sshArgs
}

function Invoke-Remote([string]$Command) {
  Write-Host "==> ssh $SshTarget"
  Write-Host "    $Command"
  $sshArgs = Get-SshArgs
  & ssh @sshArgs $SshTarget $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Remote command failed (exit $LASTEXITCODE). If Permission denied — run: npm run deploy:ssh-setup"
  }
}

Assert-Command git
Assert-Command ssh
Assert-Command scp

Push-Location $Root
$bundle = $null
try {
  if (-not $Branch) {
    $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
  }
  if (-not $Branch -or $Branch -eq "HEAD") {
    throw "Detached HEAD — checkout a branch first (e.g. backup/sova-portal)."
  }

  $sha = (git rev-parse --short HEAD).Trim()
  Write-Host "==> Local: $Branch @ $sha"
  Write-Host "==> Target: $SshTarget : $RemotePath"

  if (-not $SkipGithub) {
    Write-Host "==> git push origin $Branch (GitHub backup)"
    git push -u origin "HEAD:refs/heads/$Branch"
    if ($LASTEXITCODE -ne 0) {
      throw "git push to GitHub failed"
    }
  } else {
    Write-Host "==> SkipGithub: not pushing to GitHub"
  }

  $bundleSafe = ($Branch -replace '[\\/:\*\?"<>\|]', '-')
  $bundle = Join-Path $env:TEMP "sova-deploy-$bundleSafe.bundle"
  Write-Host "==> git bundle create $bundle"
  git bundle create $bundle "HEAD"
  if ($LASTEXITCODE -ne 0) {
    throw "git bundle create failed"
  }

  $remoteBundle = "$RemoteHomeRelative/sova-deploy.bundle"
  Write-Host "==> scp bundle -> ${SshTarget}:$remoteBundle"
  $sshArgs = Get-SshArgs
  & scp @sshArgs $bundle "${SshTarget}:$remoteBundle"
  if ($LASTEXITCODE -ne 0) {
    throw "scp failed (exit $LASTEXITCODE)"
  }

  Invoke-Remote "git -C $RemotePath fetch sova-deploy.bundle HEAD"
  Invoke-Remote "git -C $RemotePath checkout --force -B $Branch FETCH_HEAD"
  Invoke-Remote "git -C $RemotePath reset --hard FETCH_HEAD"
  Invoke-Remote "git -C $RemotePath rev-parse --short HEAD"
  Invoke-Remote "git -C $RemotePath log -1 --oneline"
  $sshArgs = Get-SshArgs
  & ssh @sshArgs $SshTarget "cmd /c del /q C:\Users\SOVAI\Documents\Work\QR\sova-deploy.bundle" | Out-Null

  if (-not $SkipRestart) {
    # Only stop Node processes clearly belonging to this portal directory.
    $restart = @"
`$ErrorActionPreference = 'Stop'
`$root = '$RemotePath'
`$rootWin = (`$root -replace '/', '\').TrimEnd('\')
`$log = Join-Path `$rootWin 'logs\deploy-restart.log'
New-Item -ItemType Directory -Force -Path (Split-Path `$log -Parent) | Out-Null
function Log([string]`$msg) {
  `$line = (Get-Date -Format 's') + ' ' + `$msg
  Add-Content -Path `$log -Value `$line
  Write-Host `$msg
}
if (-not (Test-Path `$rootWin)) { throw "Remote path not found: `$rootWin" }

# 1) Stop whoever owns :3000 (the live portal), including parent npm tree.
`$listen = @(netstat -ano | Select-String 'LISTENING' | Select-String ':3000\s')
`$pids = New-Object 'System.Collections.Generic.HashSet[int]'
foreach (`$line in `$listen) {
  `$parts = (`$line.ToString() -split '\s+') | Where-Object { $_ }
  if (`$parts.Length -ge 5) {
    `$procId = 0
    if ([int]::TryParse(`$parts[-1], [ref]`$procId) -and `$procId -gt 0) { [void]`$pids.Add(`$procId) }
  }
}
foreach (`$procId in @(`$pids)) {
  try {
    `$proc = Get-CimInstance Win32_Process -Filter ("ProcessId = " + `$procId) -ErrorAction SilentlyContinue
    if (`$proc -and `$proc.ParentProcessId) { [void]`$pids.Add([int]`$proc.ParentProcessId) }
  } catch {}
}
foreach (`$procId in @(`$pids)) {
  Log ("Stopping :3000-related PID " + `$procId)
  Stop-Process -Id `$procId -Force -ErrorAction SilentlyContinue
}

# 2) Also stop node processes whose command line points at this QR folder.
`$markers = @(
  (`$rootWin + '\'),
  'Documents\Work\QR\',
  'Documents/Work/QR/'
)
`$nodes = @(Get-CimInstance Win32_Process -Filter 'Name = ''node.exe''' -ErrorAction SilentlyContinue)
foreach (`$proc in `$nodes) {
  `$cmd = [string]`$proc.CommandLine
  if (-not `$cmd) { continue }
  `$hit = `$false
  foreach (`$m in `$markers) {
    if (`$cmd.IndexOf(`$m, [StringComparison]::OrdinalIgnoreCase) -ge 0) { `$hit = `$true; break }
  }
  if (-not `$hit) { continue }
  Log ("Stopping QR-path node PID " + `$proc.ProcessId)
  Stop-Process -Id `$proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2
Log 'Starting npm start in portal directory'
`$stdout = Join-Path `$rootWin 'logs\deploy-stdout.log'
`$stderr = Join-Path `$rootWin 'logs\deploy-stderr.log'
`$p = Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory `$rootWin -WindowStyle Minimized -PassThru -RedirectStandardOutput `$stdout -RedirectStandardError `$stderr
Log ('Started npm PID ' + `$p.Id)

`$ok = `$false
for (`$i = 0; `$i -lt 30; `$i++) {
  Start-Sleep -Seconds 1
  try {
    `$r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/login' -UseBasicParsing -TimeoutSec 2
    if (`$r.StatusCode -ge 200 -and `$r.StatusCode -lt 500) { `$ok = `$true; break }
  } catch {}
}
if (-not `$ok) {
  Log 'WARNING: portal did not answer on :3000 within 30s — check logs\deploy-stderr.log'
  throw 'Portal restart did not become ready on :3000'
}
`$hasDesc = `$r.Content.Contains('login-portal-desc')
Log ('Portal ready on :3000; login-portal-desc=' + `$hasDesc)
Write-Host 'Portal restart OK'
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($restart))
    try {
      Invoke-Remote "powershell -NoProfile -EncodedCommand $encoded"
    } catch {
      Write-Warning "Code is deployed, but auto-restart failed: $($_.Exception.Message)"
      Write-Warning "On server run: cd $RemotePath ; npm start"
    }
  } else {
    Write-Host "==> SkipRestart: code deployed; restart portal on the server manually"
  }

  Write-Host ""
  Write-Host "Deploy done: $Branch ($sha) -> $RemotePath"
}
finally {
  if ($bundle -and (Test-Path $bundle)) {
    Remove-Item $bundle -Force -ErrorAction SilentlyContinue
  }
  Pop-Location
}
