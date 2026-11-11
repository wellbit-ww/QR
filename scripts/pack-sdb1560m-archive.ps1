# Pack SDB1560M pilot slice for sharing (no node_modules, no secrets, no logs).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$stamp = Get-Date -Format "yyyy-MM-dd"
$stage = Join-Path $env:TEMP "QR-sdb1560m-$stamp"
$zipName = "QR-sdb1560m-code-$stamp.zip"
$zipPath = Join-Path $root $zipName

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

function Copy-Rel($rel) {
  $src = Join-Path $root $rel
  if (-not (Test-Path $src)) { return }
  $dest = Join-Path $stage $rel
  $parent = Split-Path $dest -Parent
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  Copy-Item -Path $src -Destination $dest -Recurse -Force
}

# Policy & reports
@(
  "docs/RAG_POLICY.md",
  "docs/RAG_DATA_TRUTH.md",
  "docs/RAG_SDB1560M_HONEST_RESTORE.md",
  "docs/RUNBOOK_EQUIPMENT_PORTAL.md",
  ".env.example"
) | ForEach-Object { Copy-Rel $_ }
Get-ChildItem (Join-Path $root "docs/reports") -Filter "sdb1560m*" -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Rel ("docs/reports/" + $_.Name)
}

# Knowledge & manual
Copy-Rel "knowledge/sdb1560m"
Copy-Rel "public/SDB1560.png"
if (Test-Path (Join-Path $root "public/manuals/SDB1560NM.pdf")) {
  Copy-Rel "public/manuals/SDB1560NM.pdf"
}

# Equipment profile
Copy-Rel "src/equipment/profiles/sdb1560m.js"

# 1560 RAG modules + honest / grounding
Get-ChildItem (Join-Path $root "src/rag") -Filter "sdb1560m*" | ForEach-Object { Copy-Rel ("src/rag/" + $_.Name) }
Copy-Rel "src/rag/synthesis/sdb1560-grounding-contract.js"
@(
  "src/rag/honest-rag-mode.js",
  "src/rag/honest-rag-post-gate.js",
  "src/rag/honest-rag-deterministic.js"
) | ForEach-Object { Copy-Rel $_ }

# Shared RAG core (1560 runs through full pipeline)
@(
  "src/rag/pipeline",
  "src/rag/router",
  "src/rag/decision",
  "src/rag/llm",
  "src/rag/guardrails",
  "src/rag/retrieval",
  "src/rag/synthesis",
  "src/rag/telemetry",
  "src/rag/symptoms",
  "src/rag/parameters",
  "src/rag/prompts",
  "src/rag/config.js",
  "src/rag/retrieval.js",
  "src/rag/embeddings.js",
  "src/rag/pg-client.js",
  "src/rag/query-intent.js",
  "src/rag/query-analysis.js",
  "src/rag/query-rewriting.js",
  "src/rag/answer-validation.js",
  "src/rag/rag-log.js",
  "src/rag/rerank.js",
  "src/rag/chunking.js",
  "src/rag/catalog-engine.js",
  "src/rag/maintenance-scope.js",
  "src/rag/troubleshooting-scope.js",
  "src/rag/safety-query-scope.js",
  "src/rag/unsupported-replacement-scope.js",
  "src/rag/portal-contact-support-answer.js",
  "src/rag/indicator-scope.js",
  "src/rag/parameter-registry.js",
  "src/rag/parameter-extraction.js",
  "src/rag/sdb-model-scope.js",
  "src/rag/equipment-serial-number-scope.js",
  "src/rag/ollama-fetch.js",
  "src/rag/honest-contextual-extract.js"
) | ForEach-Object { Copy-Rel $_ }

Copy-Rel "src/equipment/equipment-runtime.js"
Copy-Rel "src/auth"
Copy-Rel "scripts/load-env-file.js"
Copy-Rel "scripts/start-portal.js"
Copy-Rel "scripts/stop-equipment-stack.ps1"
Copy-Rel "scripts/start-equipment-stack.ps1"
Copy-Rel "scripts/ingest-knowledge.js"
Get-ChildItem (Join-Path $root "scripts") -Filter "*sdb1560m*" | ForEach-Object { Copy-Rel ("scripts/" + $_.Name) }

Get-ChildItem (Join-Path $root "data") -Filter "*sdb1560m*" -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Rel ("data/" + $_.Name)
}
Copy-Rel "data/live-user-regression-sdb1560m.json"
Copy-Rel "data/ad-hoc-probe-sdb1560m.json"

Copy-Rel "server.js"
Copy-Rel "package.json"
Copy-Rel "package-lock.json"
Copy-Rel "docker-compose.yml"
Copy-Rel "public/chat.js"
Copy-Rel "public/chat.html"
Copy-Rel "public/login.html"
Copy-Rel "public/styles.css"

$readme = @"
# Архив пилота SDB1560M (RAG PURE)

Срез репозитория для просмотра реализации **SDB1560M**: honest RAG, grounding contract, golden/PDF, тесты.

- Запуск: см. ``docs/RUNBOOK_EQUIPMENT_PORTAL.md``, ``.env.example`` (``RAG_HONEST_EQUIPMENT=sdb1560m``, ``RAG_PURE=1``).
- Тесты: ``npm run test:sdb1560m:live-regression``, ``test:sdb1560m:ad-hoc-probe``.
- Полный монорепозиторий с другими моделями (702, 1106…) в этот архив **не** входит.

Собрано: $stamp
"@
Set-Content -Path (Join-Path $stage "README-SDB1560M-ARCHIVE.md") -Value $readme -Encoding UTF8

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
tar -a -cf $zipPath -C (Split-Path $stage -Parent) (Split-Path $stage -Leaf)
Remove-Item $stage -Recurse -Force

Write-Output $zipPath
Write-Output ("SizeMB={0:N1}" -f ((Get-Item $zipPath).Length / 1MB))
