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
    # Restart via keep-alive script shipped with the repo (also used by Scheduled Task).
    $restart = @"
`$ErrorActionPreference = 'Stop'
`$root = '$RemotePath'
`$ensure = Join-Path (`$root -replace '/', '\') 'scripts\ensure-portal-running.ps1'
if (-not (Test-Path `$ensure)) { throw "Missing `$ensure" }
& `$ensure -Root `$root -ForceRestart
Write-Host 'Portal restart OK'
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($restart))
    try {
      Invoke-Remote "powershell -NoProfile -EncodedCommand $encoded"
    } catch {
      Write-Warning "Code is deployed, but auto-restart failed: $($_.Exception.Message)"
      Write-Warning "On server run: powershell -File $RemotePath/scripts/ensure-portal-running.ps1 -ForceRestart"
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
