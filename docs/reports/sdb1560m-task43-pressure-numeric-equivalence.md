# Task 43 — Atmospheric pressure `84,0` vs eval `84` (numeric equivalence)

**Branch:** `backup/sova-portal`  
**HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged, no commit)  
**Eval runner:** `1.11-task43-r1` (was `1.10-task42-r1` in Task 42)

---

## 1. Root cause (established)

| Question | Answer |
|----------|--------|
| Production answer wrong? | **No** — HTTP answer matches РЭ: «… **84,0 кПа**` (`logs/baseline-task42/targeted-http-pressure-4-verified/`, case `gen.env.pressure-kpa-min`). |
| Extract precedence bug? | **No** — trace shows `extractKind: atmospheric_pressure`; decimal form matches §1.1.2.12. |
| Evaluator factual matcher? | **Yes** — `buildBoundedNumberPattern("84")` used `(?<![0-9.,])84(?![0-9.,])`, which **rejects** `84,0` (comma after `84` violates trailing lookahead). |
| Grounding matcher? | **Same path** — `evaluateRequiredFact` on evidence segments; text with `84,0` failed the same way. |

**Classification:** **evaluator-side** (integer claim vs source zero-decimal). **No production RAG change** for this fix.

**Manual §1.1.2.12:** `84,0 - 106,7 кПа (630 - 800 мм рт. ст.)` — production wording preserved.

---

## 2. Task 42 HTTP context (failure under old runner)

| Case | Task 42 HTTP |
|------|----------------|
| `gen.env.pressure-kpa-min` | **fail** (factual + grounding) |
| `gen.env.pressure-kpa-max` | pass |
| `gen.env.pressure-mmhg-min` | pass |
| `gen.env.pressure-mmhg-max` | pass |

**Targeted run:** `logs/baseline-task42/targeted-http-pressure-4-verified/` — **3/4**, infra **0**.

**Answer (kpa-min):** «Нижняя граница атмосферного давления для эксплуатации Шкафа SDB1560M составляет **84,0 кПа**.»

**Other user regressions (Task 42 session):**

| Run | Path | Result |
|-----|------|--------|
| Priority B | `logs/baseline-task42/targeted-http-priority-b-10/` | **10/10** |
| RH above 30 | `logs/baseline-task42/targeted-http-rh-above30/` | **1/1** |
| Task 28 full | `logs/baseline-task42/task28-generalization-http/` | **73/110**, leakage **0/20** |
| `partition=verified` + generalization-v1 | `logs/baseline-task42/task27-regression/` | 62/93 (not Task 27 v2 **32** suite) |

---

## 3. Code change (Task 43)

**File:** `scripts/sdb1560m-eval-runner-lib.js`

- **`EVAL_RUNNER_LIB_VERSION`:** `1.11-task43-r1`
- **`isIntegerNumericClaimPattern`**, **`requiredNumericTokenEquivalent`** — `84,0` / `84.0` ≡ `84` only when fractional digits are **all zeros**; not `84.5`, not `840`
- **`buildBoundedNumberPattern`** — integer claims: optional `(?:[.,]0+)?`
- **`hasConflictingAlternateNumeric`** — zero-decimal tokens not counted as conflicting alternates

**Unchanged:** explicit decimal claims (`106.7`, `99.9`); RAG/extract/cards/dataset `claimPattern`.

**Tests:** `scripts/test-sdb1560m-task43-pressure-numeric.js`; also pass: counterexamples, task32, task42, eval-runner unit.

---

## 4. Before / after (matcher behavior)

| Text | Pattern `84` (Task 42) | Pattern `84` (Task 43) |
|------|------------------------|------------------------|
| `84 кПа` | pass | pass |
| `84,0 кПа` | **fail** | pass |
| `84.0 кПа` | **fail** | pass |
| `840 кПа` | fail | fail |
| `184 кПа` | fail | fail |
| `84,5 кПа` | fail | fail |
| `Масса 260,5 кг` / pattern `260` | fail | fail |

---

## 5. HTTP verification

| Suite | Status in repo |
|-------|----------------|
| Pressure 4 (with `1.11-task43-r1`) | **Re-run required** — see commands below |
| Priority B, RH, Task 27 v2, T28, smoke | **Re-run after evaluator bump** if you want manifest version stamped |

**Offline:** unit tests + Task 42 `answerPreview` rescored with new matcher — see `logs/baseline-task43/offline-rescore-task42-pressure.json`.

**Expected after re-run:** pressure **4/4**; Task 28 **74/110** (+1 vs 73/110) if only kpa-min flips; Priority B / RH should stay green (eval-only change).

### Commands (copy-paste)

```powershell
cd C:\Users\SOVAI\Documents\Work\QR

node scripts/run-sdb1560m-eval-v1.js --allow-http --no-provision --partition=all --dataset=scripts/eval/sdb1560m-generalization-v1.json --cases=gen.env.pressure-kpa-min,gen.env.pressure-kpa-max,gen.env.pressure-mmhg-min,gen.env.pressure-mmhg-max --out=logs/baseline-task43/targeted-http-pressure-4

node scripts/run-sdb1560m-eval-v1.js --allow-http --no-provision --partition=all --dataset=scripts/eval/sdb1560m-generalization-v1.json --cases=gen.num.dim-tolerance,gen.num.pwr-dry-opt810,gen.kit.feet-height,gen.opt.n2-timer-max,gen.opt.n2-sensor-max,gen.multi.dry-regen-power,gen.multi.ambient-temp-rh,gen.multi.n2-flow-range,gen.note.height-signal,gen.rh.rule-above30 --out=logs/baseline-task43/targeted-http-priority-b-10

node scripts/run-sdb1560m-eval-v1.js --allow-http --no-provision --partition=all --dataset=scripts/eval/sdb1560m-generalization-v1.json --cases=gen.rh.rule-above30 --out=logs/baseline-task43/targeted-http-rh-above30

node scripts/run-sdb1560m-eval-v1.js --allow-http --no-provision --partition=verified --dataset=docs/reports/sdb1560m-eval-suite-expanded-v2.json --out=logs/baseline-task43/task27-suite-v2-32

node scripts/run-sdb1560m-eval-v1.js --allow-http --no-provision --partition=all --dataset=scripts/eval/sdb1560m-generalization-v1.json --out=logs/baseline-task43/task28-generalization-http

npm run test:sdb1560m:honest-smoke:ci
```

---

## 6. Related docs and artifacts

| Item | Path |
|------|------|
| Task 42 (retrieval + 3/4 HTTP) | `docs/reports/sdb1560m-task42-pressure-retrieval-grounding.md` |
| Task 42 pressure HTTP | `logs/baseline-task42/targeted-http-pressure-4-verified/` |
| Task 43 offline note | `logs/baseline-task43/offline-rescore-task42-pressure.json` |
| Retrieval card | `knowledge/sdb1560m/retrieval-cards/ambient-pressure.md` |

---

## 7. Definition of Done (Task 43)

| # | Status |
|---|--------|
| Root cause | **Done** — evaluator bounded integer matcher |
| Fix implemented | **Done** — eval runner only |
| 4/4 pressure HTTP on `1.11-task43-r1` | **User must re-run** (portal unchanged; runner reads updated `sdb1560m-eval-runner-lib.js`) |
| No commit | **Yes** |

---

## 8. Honest assessment

- **Genuine fix:** yes, for the remaining Task 42 pressure failure — production was already source-correct.
- **Fully closed Task 43 DoD:** only after HTTP artifacts under `logs/baseline-task43/` show **4/4** pressure with runner version **1.11-task43-r1** in manifest.
