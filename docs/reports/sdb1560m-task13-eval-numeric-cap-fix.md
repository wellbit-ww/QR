# Task 13 — Eval Numeric-Cap Checker Fix

**Date:** 2026-10-29  
**Git HEAD (unchanged):** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Branch:** `backup/sova-portal` (pre-existing dirty/untracked tree preserved; no commit)

**Confirmation:** No production HTTP, `--allow-http` eval, ingest, provisioning, DB/index mutation, `.env` changes, chat-gate/RAG edits, or changes to `logs/baseline-task9/http-run-20261029-r2/`. Only eval runner library + its unit/counterexample tests + this report.

---

## 1. Confirmed root cause

**Baseline case:** `num.dry-power-base.verified` in `logs/baseline-task9/http-run-20261029-r2/report.json` — factual layer `missing_or_negated` for `claimPattern: "40"`, `unit: "W"`, despite answer text «… **не более 40 Вт**».

**Code path:** `evaluateRequiredFact` → numeric branch filters matches with `isNegatedAt` and `isNonExactNumericContext` (`scripts/sdb1560m-eval-runner-lib.js`).

Two mechanisms rejected the valid cap wording:

1. **`isNegatedAt`** — patterns such as `/\b(?:не|нет)\s+[\w…]{0,20}$/` matched the prefix **«не более »** before `40`, treating it as negation of the number.
2. **`isNonExactNumericContext`** — `/не\s+(?:превышает|более|менее)\s+$/` (and a broad `(?:не\s+)?…|до|…` rule) marked the match as non-assertive, excluding it from `asserted`.

**Before fix (verified locally on baseline string):** `evaluateRequiredFact({ claimPattern: "40", unit: "W" }, baselineAnswer)` → **`fail` / `missing_or_negated`**.

---

## 2. Correction (narrow)

**Version:** `EVAL_RUNNER_LIB_VERSION` → **`1.3-task13`**.

Added **`isRegulatoryMaximumBefore(text, matchIndex)`** — true when the 32 characters before the number end with:

- `не превышает ` / `не более ` (PDF upper-bound wording), or  
- `до ` (maximum cap).

**`isNegatedAt`:** returns **false** when `isRegulatoryMaximumBefore` is true ( «не более 40» is not «не 40» ).

**`isNonExactNumericContext`:** returns **false** for regulatory caps; still excludes approximate / lower-bound / unqualified comparatives (`около`, `примерно`, `не менее`, bare `более`/`менее` without cap semantics, ranges, etc.).

No change to production RAG, suite JSON, or baseline artifacts. Re-scoring the frozen baseline report would show factual **pass** for dry-power only if the report is re-evaluated with lib 1.3 — not done in this task.

---

## 3. Files changed

| File | Change |
|------|--------|
| `scripts/sdb1560m-eval-runner-lib.js` | `isRegulatoryMaximumBefore`; negation/non-exact logic; version bump |
| `scripts/test-sdb1560m-eval-runner-unit.js` | `testB2NumericCapMaximum` (baseline string + caps) |
| `scripts/test-sdb1560m-eval-runner-counterexamples.js` | Task 13 cap matrix; «не превышает 260 кг» → **pass** (aligned with cap semantics) |
| `docs/reports/sdb1560m-task13-eval-numeric-cap-fix.md` | This report |

---

## 4. Before / after — targeted counterexamples

Required fact: `{ claimPattern: "40", unit: "W" }` (same as `F-PWR-DRY` / `num.dry-power-base.verified`).

| Answer fragment | Before (1.2-task6 behavior) | After (1.3-task13) |
|-----------------|------------------------------|---------------------|
| `не более 40 Вт` | fail | **pass** |
| `до 40 Вт` | fail | **pass** |
| `40 W` / `Мощность 40 W` | pass | **pass** |
| `не более 50 Вт` | fail (no `40`) | **fail** |
| `не более 30 Вт` | fail (no `40`) | **fail** |
| `не 40 Вт` | fail | **fail** |
| Task 9 baseline full sentence | fail | **pass** |
| `Масса не превышает 260 кг` (260 kg fact) | fail | **pass** (cap at stated value) |
| `В таблице ошибок указан код 40, режим хранения 8 Вт` | fail | **fail** (no `40` + W) |

---

## 5. Commands and exit codes

| Command | Exit code |
|---------|-----------|
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **0** |

---

## 6. Diff review

- **Scope:** Eval checker + tests only (~40 lines in lib, tests additive).
- **HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` unchanged.
- **Not touched:** `src/rag/**`, `sdb1560m-chat-gate.js`, suite draft, baseline directory, `.env`, DB/index.

---

## 7. Limitations and ambiguity

1. **Checker vs production:** Passing `evaluateRequiredFact` on the baseline answer means **metrics can reflect manual cap wording**; it does **not** re-validate retrieval, grounding, or that the live portal still returns the same text.
2. **HTTP baseline:** `logs/baseline-task9/http-run-20261029-r2/report.json` remains frozen at **fail** for dry-power until a **new** eval run is executed (out of scope).
3. **Semantic ceiling:** The checker treats **«не более N» / «до N»** with correct unit as asserting reference maximum **N**; it does not verify that the question asked for a maximum vs nominal value (suite `requiredFacts` still use numeric `claimPattern` only).
4. **Unrelated mention:** Answers that include **`40 Вт`** in a clearly contradictory or alternate-numeric context still fail via **`hasConflictingAlternateNumeric`** / missing bounded `40`+W; answers with bare **`40`** without W still fail **`missing_unit`**. Fully semantic “unrelated paragraph” detection is not attempted.
5. **Task 6 doc drift:** `sdb1560m-eval-runner-counterexample-audit.md` still describes «не превышает 260» as fail-by-design; behavior is intentionally updated in code/tests — update that doc separately if desired.

---

## 8. Checker correctness vs RAG quality

| | |
|--|--|
| **Checker (this task)** | Fixes false **fail** on PDF-style **«не более 40 Вт»** for a 40 W cap fact. |
| **Production RAG** | Unchanged; Task 9 baseline already contained an acceptable dry-power **answer text**; only the **runner score** was wrong. |
| **Remaining baseline gap** | `num.mass.verified` requires **Task 12** gate fix + optional HTTP re-run; not addressed here. |
