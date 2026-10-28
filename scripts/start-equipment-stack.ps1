# Start equipment portal dependencies (Docker PG + Ollama check).
# Does NOT leave server.js in background - open a second terminal: npm start
# Usage: .\scripts\start-equipment-stack.ps1 [-StartServer] [-Smoke]
param(
  [switch]$StartServer,
  [switch]$Smoke
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

Push-Location $Root
try {
  Write-Host "==> Docker Postgres (equipment-rag-postgres)"
  docker compose up -d
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose up failed"
  }

  $healthy = $false
  for ($i = 0; $i -lt 24; $i++) {
    $status = docker inspect -f "{{.State.Health.Status}}" equipment-rag-postgres 2>$null
    if ($status -eq "healthy") {
      $healthy = $true
      break
    }
    Start-Sleep -Seconds 2
  }
  if (-not $healthy) {
    Write-Warning "Postgres container not healthy yet - check: docker ps"
  } else {
    Write-Host "Postgres: healthy"
  }

  Write-Host "==> Ollama embed API (11434)"
  try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 5
    Write-Host "Ollama: reachable"
  } catch {
    Write-Warning "Ollama not reachable on :11434 - start Ollama; ollama pull bge-m3; ollama pull qwen2.5:32b-instruct"
  }

  if (Test-Path ".env") {
    $honest = Select-String -Path ".env" -Pattern "RAG_HONEST_EQUIPMENT\s*=\s*sdb1560m" -Quiet
    if ($honest) {
      Write-Host "Honest pilot: RAG_HONEST_EQUIPMENT=sdb1560m (.env)"
    } else {
      Write-Warning "Set RAG_HONEST_EQUIPMENT=sdb1560m in .env for SDB1560M honest pilot"
    }
  } else {
    Write-Warning "No .env - copy .env.example to .env first"
  }

  $on3000 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($on3000) {
    Write-Warning "Port 3000 already in use. Run: npm run stack:stop"
  } elseif ($StartServer) {
    Write-Host "Starting server.js in this window (Ctrl+C to stop)..."
    if (-not $env:RAG_HONEST_EQUIPMENT) {
      $env:RAG_HONEST_EQUIPMENT = "sdb1560m"
    }
    node server.js
  } else {
    Write-Host ""
    Write-Host "Next (second terminal, from repo root):"
    Write-Host '  $env:RAG_HONEST_EQUIPMENT="sdb1560m"; npm start'
    Write-Host "Portal: http://127.0.0.1:3000/"
  }

  if ($Smoke -and -not $StartServer) {
    Write-Warning 'Use -StartServer in another flow, or run npm run test:sdb1560m:honest-smoke:ci after npm start'
  }
} finally {
  Pop-Location
}
