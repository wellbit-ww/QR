# One-time SSH key setup for deploy-to-server.ps1 (LAN Windows OpenSSH).
# Usage: npm run deploy:ssh-setup
#
# Password prompt = Windows login password for SOVAI on 192.168.7.170 (once).
# Admin accounts on Windows OpenSSH read keys from:
#   C:\ProgramData\ssh\administrators_authorized_keys
# not only from %USERPROFILE%\.ssh\authorized_keys
param(
  [string]$SshTarget = "SOVAI@192.168.7.170"
)

$ErrorActionPreference = "Stop"
$sshDir = Join-Path $env:USERPROFILE ".ssh"
$keyPath = Join-Path $sshDir "id_ed25519"
$pubPath = "$keyPath.pub"

if (-not (Test-Path $sshDir)) {
  New-Item -ItemType Directory -Path $sshDir | Out-Null
}

if (-not (Test-Path $pubPath)) {
  Write-Host "==> Generating ed25519 key: $keyPath"
  ssh-keygen -t ed25519 -f $keyPath -N '""' -C "deploy-$env:COMPUTERNAME"
  if ($LASTEXITCODE -ne 0) {
    throw "ssh-keygen failed"
  }
} else {
  Write-Host "==> Using existing key: $pubPath"
}

$pub = (Get-Content -Raw $pubPath).Trim()
if (-not $pub) {
  throw "Public key is empty: $pubPath"
}

Write-Host "==> Installing public key on $SshTarget"
Write-Host "    Enter the Windows password for user SOVAI (same as login on that PC)."
$remote = @"
`$ErrorActionPreference = 'Stop'

function Ensure-KeyInFile([string]`$path, [string]`$key) {
  `$dir = Split-Path `$path -Parent
  if (-not (Test-Path `$dir)) {
    New-Item -ItemType Directory -Path `$dir -Force | Out-Null
  }
  if (-not (Test-Path `$path)) {
    New-Item -ItemType File -Path `$path -Force | Out-Null
  }
  `$lines = @(Get-Content `$path -ErrorAction SilentlyContinue | ForEach-Object { `$_.TrimEnd() })
  if (`$lines -contains `$key) {
    Write-Host ("Key already in " + `$path)
  } else {
    Add-Content -Path `$path -Value `$key
    Write-Host ("Key added to " + `$path)
  }
}

function Restrict-UserAuthorizedKeys([string]`$path) {
  # OpenSSH rejects user authorized_keys if ACL is too open.
  icacls `$path /inheritance:r | Out-Null
  icacls `$path /grant:r ("`$env:USERNAME" + ":(R)") | Out-Null
  icacls `$path /grant:r "SYSTEM:(F)" | Out-Null
}

function Restrict-AdministratorsAuthorizedKeys([string]`$path) {
  # Required ACL for C:\ProgramData\ssh\administrators_authorized_keys
  icacls `$path /inheritance:r | Out-Null
  icacls `$path /grant:r "Administrators:F" | Out-Null
  icacls `$path /grant:r "SYSTEM:F" | Out-Null
}

`$key = @'
$pub
'@.Trim()

`$userAuth = Join-Path `$env:USERPROFILE '.ssh\authorized_keys'
Ensure-KeyInFile `$userAuth `$key
Restrict-UserAuthorizedKeys `$userAuth

`$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
`$adminAuth = 'C:\ProgramData\ssh\administrators_authorized_keys'
if (`$isAdmin -or (Test-Path 'C:\ProgramData\ssh')) {
  try {
    Ensure-KeyInFile `$adminAuth `$key
    Restrict-AdministratorsAuthorizedKeys `$adminAuth
  } catch {
    Write-Host 'WARNING: could not update administrators_authorized_keys (need admin rights).'
    Write-Host `$_.Exception.Message
  }
}

Write-Host ("IsAdministrator=" + `$isAdmin)
Write-Host 'Key install finished.'
"@

$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remote))
ssh -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no -o ConnectTimeout=20 $SshTarget "powershell -NoProfile -EncodedCommand $encoded"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to install key on server (exit $LASTEXITCODE)"
}

Write-Host "==> Testing key login (BatchMode)"
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i $keyPath -o ConnectTimeout=12 $SshTarget "echo SSH_OK"
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Key login still failing. On the SERVER (192.168.7.170) as Administrator run:"
  Write-Host "  1) Open C:\ProgramData\ssh\sshd_config"
  Write-Host "  2) Ensure these are NOT commented:"
  Write-Host "       PubkeyAuthentication yes"
  Write-Host "       AuthorizedKeysFile .ssh/authorized_keys"
  Write-Host "  3) For Administrators group, default Match block uses administrators_authorized_keys"
  Write-Host "  4) Restart-Service sshd"
  throw "Key login still failing after install."
}

Write-Host ""
Write-Host "SSH ready. Next: npm run deploy:server"
