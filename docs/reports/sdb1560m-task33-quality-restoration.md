# Task 33 — SDB1560NM quality restoration and dry-power grounding fix

**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (dirty; no commit)  
**Pre-task snapshot:** `logs/baseline-task33/pre-task33-status.txt`  
**Post-task snapshot:** `logs/baseline-task33/post-task33-status.txt`  
**Eval runner:** `EVAL_RUNNER_LIB_VERSION` → **1.7-task33**

## Executive summary

Task 33 fixes the **proven** Task 32 dry-power **grounding** false failures (model-group `1106/1560` vs **40 Вт** on one golden table line) and restores **must_abstain** routing for **firmware version** queries via existing unsupported-spec gate (evaluator patterns unchanged).

**Operator HTTP (authoritative):**

| Suite | Path | Overall | Key metrics |
|-------|------|---------|-------------|
| Task 27 verified (32) | `logs/baseline-task33/task27-regression-http-v10/` | **32/32 pass** | Factual **32/32**; leakage **0/7**; regression **100%** |
| Task 28 generalization (110) | `logs/baseline-task33/task28-generalization-http-v9/` | **55 pass / 51 fail / 4 N/E** | Factual **46/89**; leakage **0/20**; **must_abstain 9/17**; **infra 0** |

**Vs prior baselines:** Task 27 restored from Task 32 **30/32**; Task 28 **55/110** exceeds Task 30 **54/110** and Task 32 **51/110**. Task 31 grounding regressions on verified suite are cleared.

```powershell
$env:EVAL_DELAY_MS = "8000"
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --dataset=docs/reports/sdb1560m-eval-suite-expanded-v2.json --out=logs/baseline-task33/task27-regression-http-v10

node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=all --dataset=scripts/eval/sdb1560m-generalization-v1.json --out=logs/baseline-task33/task28-generalization-http-v9
```

Artifacts: `report.json`, `SUMMARY.md`, `eval-rag-diagnostics.jsonl` in each out dir.

**Note:** Agent-only run `logs/baseline-task33/task27-regression-http-v1/` remains **32 × infrastructure_error** (no creds); not used for scoring.

---

## Stage 0 — Snapshot

Task 30/31/32 artifacts present under `logs/baseline-task30/`, `logs/baseline-task31/`, `logs/baseline-task32/`. Dirty tree preserved; no reset/clean/stash.

---

## Stage 1 — Dry-power grounding (2 Task 27 failures)

**Diagnosis:** `logs/baseline-task33/dry-power-grounding-diagnosis.md`

| Question | Answer |
|----------|--------|
| Where is 40 W in the manual? | Golden / §1.1: «Мощность в режиме осушения … **не более 40 Вт**» |
| In chunks? | **Yes** — `golden-facts-sdb1560m.md` table row in Task 32 diagnostics |
| Why grounding failed? | **Evaluator:** `1106`/`1560` in «группа 1106/1560» counted as conflicting **W** numerics near «40 Вт» on the **same line** |
| RAG wrong? | **No** — factual **pass**; answer correct |

**Fix (evaluator, not evidence injection):** `isModelGroupCatalogNumeric()` in `scripts/sdb1560m-eval-runner-lib.js`.

**Cases fixed in logic:** `exp.num.pwr-dry-base-40`, `exp.para.dry-no-options`; also Task 28 `gen.num.pwr-dry`, `gen.foreign.dry-power-1560` (same grounding pattern).

---

## Stage 2 — Task 28 analysis

### Infrastructure (Task 32 v8 → Task 33 v9)

Task 32 v8 had **3 × fetch failed** (`gen.num.voltage`, `gen.num.freq`, `gen.num.rh-step`). **Task 33 v9 full run: infrastructure_error = 0** (no separate retry artifact required for DoD).

Optional selective re-run if transient errors return:

```powershell
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=all --dataset=scripts/eval/sdb1560m-generalization-v1.json --cases=gen.num.voltage,gen.num.freq,gen.num.rh-step --out=logs/baseline-task33/task28-infra-retry-v1
```

### Task 30 → Task 32 regressions (4)

| ID | Layer | Task 33 action |
|----|-------|----------------|
| `gen.num.pwr-dry` | grounding | **Fixed** (model-group) |
| `gen.foreign.dry-power-1560` | grounding | **Fixed** (model-group) |
| `gen.num.rh-step` | infrastructure | **Retry** |
| `gen.unsup.firmware-version` | abstention (LLM wording) | **RAG gate** — `прошив` in `sdb1560m-unsupported-spec.js` → `MODEL_PARAM_NOT_SPECIFIED` («…**не указан**») |

Seven Task 30→31 grounding-only cases: **6 already pass** on Task 32 v8; **2 dry** fixed in Task 33 evaluator.

---

## Stage 3 — Changes

| File | Change |
|------|--------|
| `scripts/sdb1560m-eval-runner-lib.js` | `isModelGroupCatalogNumeric`; runner **1.7-task33** |
| `src/rag/sdb1560m-unsupported-spec.js` | Firmware / прошив → unsupported spec reply |
| `scripts/run-sdb1560m-eval-v1.js` | Optional `--cases=id1,id2` for selective HTTP |
| `scripts/test-sdb1560m-task32-grounding.js` | Dry-power table row tests |
| `scripts/test-sdb1560m-task33-unsupported-firmware.js` | **New** |

**Preserved Task 32:** line-level evidence, decimal comma/dot, N2Ton, 0–99,9 range, extract provenance, 8 vs 810, leakage checks.

---

## Stage 4 — Local tests

| Script | Result |
|--------|--------|
| `scripts/test-sdb1560m-task32-grounding.js` | OK |
| `scripts/test-sdb1560m-task33-unsupported-firmware.js` | OK |
| `scripts/test-sdb1560m-eval-runner-unit.js` | OK |
| `scripts/test-sdb1560m-task31-regression.js` | OK |
| `scripts/test-sdb1560m-task30-routing-extract.js` | OK |
| `scripts/test-sdb1560m-task27-extract-routing.js` | OK |
| `scripts/test-sdb1560m-task26-alarm-rag.js` | OK |
| `scripts/test-sdb1560m-task25-rag-control.js` | OK |
| `scripts/test-sdb1560m-generalization-v1-dataset.js` | OK |

---

## Stage 5 — HTTP verification

| Run | Path | Result |
|-----|------|--------|
| Task 27 v1 (agent) | `logs/baseline-task33/task27-regression-http-v1/` | 32 × infra (non-authoritative) |
| **Task 27 v10** | `logs/baseline-task33/task27-regression-http-v10/` | **32/32 pass** |
| **Task 28 v9** | `logs/baseline-task33/task28-generalization-http-v9/` | **55/51/4 N/E**, **infra 0** |

---

## Comparison Task 30 / 31 / 32 / 33 (HTTP)

| Metric | T30 | T31 | T32 v7/v8 | **T33 HTTP** |
|--------|-----|-----|-----------|--------------|
| Task 27 pass | 31–32 | 21 | 30 | **32/32** |
| Task 28 pass | 54 | 47 | 51 | **55/110** |
| must_abstain | 9/17 | 9/17 | 8/17 | **9/17** |
| Leakage (gen) | 0* | 0 | 0 | **0/20** |
| Infra | 0 | 0 | 3 | **0** |

\*Task 30 leakage metric before `gen.disc.storage-vs-dry` dataset fix.

---

## Layer attribution (Task 33)

| Item | Type |
|------|------|
| Dry 40 W grounding | **Evaluator** fix (documented false conflict) |
| Firmware abstain | **RAG** (unsupported-spec gate; evaluator unchanged) |
| Task 32 numeric/trace fixes | **Retained** |
| Infra fetch failed | **Infrastructure** — retry only |

---

## Definition of Done

| Criterion | Status |
|-----------|--------|
| Task 27 **32/32** HTTP | **Pass** — `task27-regression-http-v10` |
| Task 28 **≥54/110** | **Pass** — **55/110** (`task28-generalization-http-v9`) |
| must_abstain **≥9/17** | **Pass** — **9/17** |
| Leakage **0** | **Pass** — **0/20** |
| infrastructure_error **0** | **Pass** |
| Task 32 fixes preserved | **Pass** (tests + no evaluator weakening) |
| No unexplained new regressions on T27 verified | **Pass** |

Task 33 **meets Definition of Done** on operator HTTP above.

---

## Remaining (generalization, out of Task 33 DoD)

- **51 fail** + **4 not_evaluable** on Task 28 — RAG/factual quality per case (`task28-generalization-http-v9/report.json` + diagnostics), not evaluator batch fixes.
- **8 must_abstain** failures still fail policy/RAG (9/17 pass restored vs Task 32).

Do not commit per project rules.
