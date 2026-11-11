# Task 20 — Checker Regression Coverage and Final Verification

**Date:** 2026-10-29  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged; dirty tree preserved)

**Checker version:** `1.4-task18` (unchanged — tests only, no lib semantics change)  
**Authoritative HTTP baseline (frozen, not re-run):** `logs/baseline-task18/http-verify-20261029-r3/` — **6/6 pass**

---

## 1. Changes made

| File | Change |
|------|--------|
| `scripts/test-sdb1560m-eval-runner-unit.js` | Expanded `testB2MassModelDesignatorNotConflictingKg` with Task 20 positive/negative mass cases |

**Not changed:** RAG, pipeline, gate, eval suite, `.env`, DB, index, `sdb1560m-eval-runner-lib.js`, any `logs/baseline-task*/` artifacts.

---

## 2. Regression assertions added

All use `evaluateRequiredFact({ claimPattern: "260", unit: "kg", factId: "F-MASS" }, answer)`.

### Must pass

| Answer | Check |
|--------|--------|
| `SDB1560NM — 260 кг` | `status: pass` |
| `SDB1560M: масса 260 кг` | `status: pass` |
| `SDB1560М — 260 кг` | `status: pass` |
| HTTP-shaped contextual extract (markdown + табл. 1.1) | `pass` (retained) |
| Colloquial `SDB1560М … 260 кг` | `pass` (retained) |

### Must fail

| Answer | Expected |
|--------|----------|
| `Масса 260 кг и 156 кг` | **`fail`**, **`reason: contradiction`** (explicit Task 20 requirement) |
| `260 кг и 180 кг` | **`fail`**, **`reason: contradiction`** |
| `не 260 кг, а 180 кг` | **`fail`** |
| `Вес 156 кг` (no 260) | **`fail`**, reason **not** `contradiction` (`missing_or_negated`) |
| `260 кг и 1560 кг` (no `SDB` on 1560) | **`fail`**, **`reason: contradiction`** |
| `SDB1560M: масса 156 кг … также 260 кг` | **`fail`** (retained) |

Existing tests **`testB2Contradiction`**, **`testB2Negation`**, and counterexample suite **unchanged**.

---

## 3. Command results

| Command | Exit code |
|---------|-----------|
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **0** |

No HTTP eval executed (per task scope).

---

## 4. Historical artifact preservation

Read-only confirmation — **no writes** to:

- `logs/baseline-task9/`
- `logs/baseline-task15/`
- `logs/baseline-task16/`
- `logs/baseline-task17/`
- `logs/baseline-task18/http-verify-20261029-r3/`

---

## 5. Acceptance criteria

| Criterion | Met |
|-----------|-----|
| Both test scripts exit 0 | **Yes** |
| `260 кг и 156 кг` → `contradiction` | **Yes** (explicit assert) |
| Listed pass/fail cases | **Yes** |
| Report with files, commands, artifact preservation | **Yes** |
| No scope creep | **Yes** |

---

## 6. Defects outside scope

None identified during Task 20. Checker behavior matches Task 19 audit; coverage gap for `260 кг и 156 кг` is **closed** in unit tests.

---

## Status: **COMPLETE**
