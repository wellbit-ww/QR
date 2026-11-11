# Task 14 — Post-Fix Verification and Authenticated HTTP Baseline

**Date:** 2026-10-29  
**Git HEAD (before and after):** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Branch:** `backup/sova-portal` (dirty + untracked files preserved; no commit, no destructive git ops)

**Confirmation:** No changes to production RAG (beyond pre-existing dirty tree), prompts, chat-gate, eval suite, `.env`, database, index, ingest, provisioning, or frozen Task 9 artifacts. No credentials printed or written to this report.

---

## 1. Frozen Task 9 baseline (immutable reference)

| Field | Value |
|--------|--------|
| Path | `logs/baseline-task9/http-run-20261029-r2/` |
| `capturedAt` | `2026-10-29T07:08:13.062Z` |
| `evalRunnerLibVersion` | `1.2-task6` |
| `authMode` | `eval_login` |
| Suite SHA-256 | `5bab36e3114852d3154fec6182b53352e0700650e396e4a439d8e25a40afe695` |
| Summary | pass **4**, fail **2**, blocked **0**, infra **0** |

### Per-case outcomes (Task 9)

| case_id | overall | factual | retrieval (if scored) | answerPreview (abbrev.) |
|---------|---------|---------|-------------------------|-------------------------|
| `num.mass.verified` | **fail** | fail | fail (no PDF in sources) | Scope refusal boilerplate (no 260 kg) |
| `num.dry-power-base.verified` | **fail** | fail (`missing_or_negated`) | not_evaluable | «… не более **40 Вт**» |
| `mode.regen-shutdown.verified` | pass | pass | not_evaluable | Запрещается выключать … регенерации |
| `maint.desicc-interval.verified` | pass | pass | not_evaluable | … **36 месяцев** |
| `alarm.beep-door.verified` | pass | pass | not_evaluable | … звуковой сигнал … двери … |
| `para.mass-colloquial.verified` | pass | pass | not_evaluable | … **260 кг** … |

This directory was **not** rescored or modified in Task 14.

---

## 2. Eval suite and runner (current)

| Item | Value |
|------|--------|
| Suite path | `docs/reports/sdb1560m-eval-suite-draft-v1.json` |
| Suite SHA-256 (recomputed) | `5bab36e3114852d3154fec6182b53352e0700650e396e4a439d8e25a40afe695` (unchanged) |
| `EVAL_RUNNER_LIB_VERSION` | **`1.3-task13`** (Task 13) |

---

## 3. Task 12 verification — chat gate

### 3.1 Full profile suite

```text
node scripts/test-sdb1560m-profile.js
```

| Result | Exit code |
|--------|-----------|
| **FAIL** (unrelated) | **1** |

**Failure location:** line **143** — deterministic answer for humidity-after-loading case no longer matches legacy regex `/RH%п \+ 1 RH%/u`. Answer text is about door/ventilation/60 min (no RH%+1 phrase). **Not caused by Task 12 gate changes** (gate regressions are later in the file). **Not fixed in Task 14** per scope.

### 3.2 Focused gate regression (scoped chat)

Isolated assertions with `{ equipmentChatScoped: true }`:

| Query | Expected | Result |
|-------|----------|--------|
| `Какой вес шкафа SDB1560M?` | IN_SCOPE | OK |
| `Какой вес?` | IN_SCOPE | OK |
| `Тяжёлый? вдвоём поднимем?` | IN_SCOPE | OK |
| `Какие габариты шкафа SDB1560M?` | IN_SCOPE | OK |
| `Напиши программу на Python` | OFF_TOPIC | OK |
| `Как приготовить борщ?` | OFF_TOPIC | OK |
| `Где купить Wattsan sdb1560 для лазерной резки?` | OFF_TOPIC | OK |
| `Сколько стоит токарный станок 1560?` | OFF_TOPIC | OK |

**Exit code:** **0** (`task12 focused gate regression: OK`)

---

## 4. Task 13 verification — numeric-cap checker

| Command | Exit code |
|---------|-----------|
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **0** |

### Spot checks (`evaluateRequiredFact`, `{ claimPattern: "40", unit: "W" }`)

| Case | Status | Expected |
|------|--------|----------|
| Task 9 baseline answer («… не более 40 Вт») | **pass** | pass |
| `не более 50 Вт` | **fail** | fail |
| `не более 30 Вт` | **fail** | fail |
| `не 40 Вт` | **fail** | fail |
| `код 40` without W unit (8 Вт elsewhere) | **fail** | fail |

Library version confirmed: **`1.3-task13`**.

---

## 5. Authenticated HTTP baseline — **NOT EXECUTED**

### Prerequisites checked (agent shell)

| Check | Result |
|-------|--------|
| `EVAL_LOGIN` set | **No** |
| `EVAL_PASSWORD` set | **No** |
| `EVAL_BASE_URL` | `http://127.0.0.1:3000` (default in shell) |
| Portal GET `/` | **HTTP 200** (server reachable; auth not verified) |

**Blocker:** Task 14 requires `EVAL_LOGIN` and `EVAL_PASSWORD` in the **same process environment** as the runner. The agent shell does not have them. Per task rules: **no** reading `.env`, cookies, or provisioning to obtain credentials.

**Planned output path (not created):** `logs/baseline-task14/http-run-20261029/`

### Operator action to complete baseline

1. Keep portal running (`npm start` or equivalent) on `http://127.0.0.1:3000`.
2. In a **separate** PowerShell session (credentials must be set **before** `node`):

```powershell
cd C:\Users\SOVAI\Documents\Work\QR
$env:EVAL_BASE_URL = "http://127.0.0.1:3000"
$env:EVAL_LOGIN = Read-Host "Portal login"
$sec = Read-Host "Portal password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $env:EVAL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --out=logs/baseline-task14/http-run-20261029
```

3. If that directory already exists, use a unique suffix (e.g. `http-run-20261029-r2`).
4. Confirm manifest: `authMode: eval_login`, six executed cases, zero `infrastructure_error` (unless documented).
5. Append comparison results to this report or a follow-up task (Task 14 agent run stops at blocker).

**Do not overwrite** `logs/baseline-task9/http-run-20261029-r2/`.

---

## 6. Task 9 vs Task 14 comparison

**Task 14 HTTP artifacts:** none — comparison on new runner outcomes is **deferred**.

### Expected deltas (hypothesis for operator review after HTTP run)

| case_id | Task 9 overall | Expected Task 14 change | Rationale |
|---------|----------------|-------------------------|-----------|
| `num.mass.verified` | fail | **Likely pass** if gate fix deployed and RAG returns 260 kg | Task 12 removes pre-RAG refusal; **manual review** still required for semantic correctness |
| `num.dry-power-base.verified` | fail | **Likely pass** on factual layer if answer unchanged | Task 13 checker accepts «не более 40 Вт»; **not** proof RAG improved |
| `mode.regen-shutdown.verified` | pass | likely pass | No targeted change |
| `maint.desicc-interval.verified` | pass | likely pass | No targeted change |
| `alarm.beep-door.verified` | pass | likely pass | No targeted change |
| `para.mass-colloquial.verified` | pass | likely pass | Already passed Task 9 |

Full case-by-case table (original vs new previews, layers, sources) **requires** completed HTTP run under `logs/baseline-task14/`.

---

## 7. Classification guide (for post-run analysis)

| Type | When to use |
|------|-------------|
| Production behavior failure | User-visible wrong/refusal answer with gate/RAG path engaged |
| Checker false +/- | Runner layer contradicts acceptable manual wording (Task 9 dry-power was checker FN, fixed in 13) |
| Retrieval / grounding | Source/chunk evidence in report; do not infer grounding from `sourceDocs` names alone |
| Infrastructure | `infrastructure_error`, login failed, fetch failed |
| Insufficient evidence | No chunk text / trace in artifact |

Runner **`pass` ≠ semantic correctness** — manual review on numeric and safety cases remains required.

---

## 8. Systems and files not modified by Task 14

- `logs/baseline-task9/http-run-20261029-r2/` (immutable)
- Eval suite JSON
- `.env` / database / vector index
- No ingest, provisioning, or production RAG optimization
- No new files under `logs/baseline-task14/` (HTTP not run)

---

## 9. Task 14 completion status

| Criterion | Status |
|-----------|--------|
| Task 12 regression recorded | **Yes** (focused pass; full profile fail documented separately) |
| Task 13 checker recorded | **Yes** |
| Task 9 baseline unchanged | **Yes** |
| New six-case HTTP baseline | **NOT EXECUTED** — missing `EVAL_LOGIN` / `EVAL_PASSWORD` in agent environment |
| No RAG optimization | **Yes** |

**Task 14 is partially complete:** local verification done; authenticated baseline awaits operator credentials in a dedicated shell.
