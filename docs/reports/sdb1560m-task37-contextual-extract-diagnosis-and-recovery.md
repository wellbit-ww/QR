# Task 37 — SDB1560NM Contextual Extract Deep Diagnosis & Grounded Recovery

**Branch:** `backup/sova-portal`  
**HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Eval runner:** `1.7-task33`  
**Task 36 baseline:** Task 27 **32/32** (`task27-regression-http-v13`); Task 28 **60/110** (`task28-generalization-http-v14`), factual **49/89**, must_abstain **11/17**, leakage **0/20**  
**Task 37 HTTP (authoritative):** Task 27 **31/32** (`task27-v19`); Task 28 **65/110** (`task28-v1`); targeted **6/10** (`targeted-http-v23`)  
**Commit:** none

## A. Executive summary

All **10** Priority-B cases investigated from Task 36 traces; **4 shared production defects** fixed in `honest-contextual-extract.js`.

**HTTP (after portal restart + credentials):**

| Suite | Result | vs Task 36 |
|---|---|---|
| Targeted 10 | **6/10** pass, **0** infra | **+6** of Priority B |
| Task 28 | **65/110**, factual **55/89**, must_abstain **11/17**, leakage **0/20**, infra **0** | **+5** pass, factual **+6** |
| Task 27 | **31/32**, infra **0** | **−1** (regression) |

**HTTP-proven passes (Priority B):** `dim-tolerance`, `pwr-dry-opt810`, `feet-height`, `n2-timer-max`, `ambient-temp-rh`, `n2-flow-range`.

**Still fail on HTTP:** `n2-sensor-max`, `dry-regen-power`, `height-signal`, `rh.rule-above30`.

**Regression:** Task 27 `exp.num.pwr-dry-base-40` answered with **810 W** drying+options extract instead of base **40 W** — `power_drying_opt` / `dryingPowerWithOptions` too broad for base-dry questions.

---

## B. Verified baselines

| Metric | Task 36 v14 | Task 37 HTTP | Δ |
|---|---:|---:|---|
| Task 27 | **32/32** | **31/32** (`task27-v19`) | **−1** |
| Task 28 pass | **60/110** | **65/110** (`task28-v1`) | **+5** |
| Factual (heuristic) | **49/89** | **55/89** | **+6** |
| must_abstain | **11/17** | **11/17** | 0 |
| Leakage | **0/20** | **0/20** | 0 |
| Infra | **0** | **0** | 0 |
| Targeted Priority B | 0/10 | **6/10** (`targeted-http-v23`) | **+6** |

Superseded / non-authoritative: `targeted-http-v1` (portal down), `targeted-http-v21` (3 infra), `task27-v18` (missing `EVAL_LOGIN`/`EVAL_PASSWORD`).

---

## C. Investigation method

- Baseline traces: Task 36 HTTP v14 diagnostics  
- Source checks: PDF/cards (`table-1.1-ttx`, setpoint, page-025 N2 **99,9**)  
- Code: `honest-contextual-extract.js`  
- Inventory: `logs/baseline-task37/task37-case-analysis.json`

---

## D. Root-cause table + HTTP outcome

| Case | Task 36 | Root cause | Source | Task 37 HTTP v23 |
|---|---|---|---|---|
| `gen.num.dim-tolerance` | fail | INTENT_ROUTING → dimensions | PDF_CONFIRMED ±5 mm | **pass** |
| `gen.num.pwr-dry-opt810` | fail | INTENT_ROUTING → n2_option | PDF_CONFIRMED 810 W | **pass** |
| `gen.kit.feet-height` | fail | INTENT_ROUTING → dimensions | PDF_CONFIRMED 50 mm | **pass** |
| `gen.opt.n2-timer-max` | fail | EXTRACT_SATISFACTION (timer) | PDF_CONFIRMED 99,9 | **pass** |
| `gen.opt.n2-sensor-max` | fail | EXTRACT_SATISFACTION (need 98) | PDF_CONFIRMED | **fail** — answer `78–98,0 %` but checker `98` = missing_or_negated |
| `gen.multi.dry-regen-power` | fail | MULTI_FACT_COMPLETENESS | PDF_CONFIRMED | **fail** — answer has **40** and **540**, checker marks contradiction on both |
| `gen.multi.ambient-temp-rh` | fail | MULTI_FACT_COMPLETENESS | PDF_CONFIRMED | **pass** |
| `gen.multi.n2-flow-range` | fail | INTENT_ROUTING | PDF_CONFIRMED 3–30 | **pass** |
| `gen.note.height-signal` | fail | INTENT_ROUTING | PDF_CONFIRMED | **fail** — LLM abstain-like; height_table_note extract not applied / corpus miss |
| `gen.rh.rule-above30` | fail | INTENT_ROUTING | PDF_CONFIRMED −20 | **fail** — grounding (answer mentions 20 but fails grounding layer) |

---

## E. Shared defects → fixes

| Defect | Fix | HTTP |
|---|---|---|
| Misrouting | New kinds: `dim_tolerance`, `kit_feet`, `height_table_note`, `power_drying_opt`, `power_dry_regen`, `ambient_temp_rh`, `rh_setpoint_rule` | Partially proven (6/10) |
| Partial prior blocks replace | `priorAnswerFullyAnswersQuery` | Proven on tolerance/feet/timer |
| Multi-fact | Combined dry+regen / temp+RH extracts | temp+RH pass; dry+regen checker fail |
| N2 satisfaction | Timer / flow-range / drop generic azot fallback | timer + flow pass; sensor-max still fail |

---

## F. Production changes

| File | Change |
|---|---|
| `src/rag/honest-contextual-extract.js` | Kinds, extractors, FORCE_CONTEXT, satisfaction/replacement, N2 branches |

**Not changed:** evaluator, datasets, golden facts, DB/Qdrant.

---

## G. Unit test results

| Script | Result |
|---|---|
| `scripts/test-sdb1560m-task37-contextual-extract.js` | OK |
| `scripts/test-sdb1560m-task36-mains-power-post-gate.js` | OK |
| `scripts/test-sdb1560m-task35-hallucination-grounding.js` | OK |
| `scripts/test-sdb1560m-task32-grounding.js` | OK |
| `scripts/test-sdb1560m-task31-regression.js` | OK |
| `scripts/test-sdb1560m-task27-extract-routing.js` | OK |
| `scripts/test-sdb1560m-task33-unsupported-firmware.js` | OK |
| `scripts/test-sdb1560m-eval-runner-unit.js` | OK |

---

## H. HTTP verification (authoritative)

| Run | Path | Result |
|---|---|---|
| Task 27 | `logs/baseline-task37/task27-v19/` | **31/32**, infra **0** (2026-11-06T05:50Z) |
| Task 28 | `logs/baseline-task37/task28-v1/` | **65/41/4**, factual **55/89**, must_abstain **11/17**, leakage **0/20**, infra **0** (2026-11-06T06:17Z) |
| Targeted | `logs/baseline-task37/targeted-http-v23/` | **6/4/0**, infra **0** (2026-11-06T07:31Z) |

**Task 27 fail:** `exp.num.pwr-dry-base-40` — answer used **810 W** drying+options wording (`cross_model or forbidden claim`). Likely Task 37 `dryingPowerWithOptions` / `power_drying_opt` firing on a **base** dry-power question.

**Protections intact on Task 28 HTTP:** voltage, freq, volume abstains (`internal-volume-liters`, `full-volume-liters`), leakage **0**.

---

## I. Comparison vs Task 36

- Task 28 **+5** overall (60 → 65); factual **+6** (49 → 55).  
- Priority B: **6/10** recovered on HTTP; **4** remain.  
- Task 27 **not** DoD-green (**31/32**); must restore base dry **40 W** before Task 37 sign-off.

---

## J. Remaining blockers

1. **P0:** restore Task 27 `exp.num.pwr-dry-base-40` (narrow `dryingPowerWithOptions` so base dry ≠ opt 810).  
2. **`gen.note.height-signal`** — ensure table-1.1 footnote corpus + extract apply.  
3. **`gen.rh.rule-above30`** — grounding fail despite −20 in answer.  
4. **`gen.opt.n2-sensor-max` / `gen.multi.dry-regen-power`** — answer text looks correct; checker `missing_or_negated` / `contradiction` — diagnose before changing extract further.  
5. Deferred: 12 retrieval-first + 6 must_abstain (unchanged **11/17**).

---

## K. Git state

- **Pre:** `logs/baseline-task37/pre-task37-status.txt`  
- **Post:** `logs/baseline-task37/post-task37-status.txt`  
- Dirty tree preserved; no commit.

**Files touched (Task 37):**

- `src/rag/honest-contextual-extract.js`
- `scripts/test-sdb1560m-task37-contextual-extract.js`
- `scripts/build-task37-case-analysis.js`
- `docs/reports/sdb1560m-task37-contextual-extract-diagnosis-and-recovery.md`
- `logs/baseline-task37/*`

---

## Artifacts

| Path |
|------|
| `docs/reports/sdb1560m-task37-contextual-extract-diagnosis-and-recovery.md` |
| `logs/baseline-task37/task37-case-analysis.json` |
| `logs/baseline-task37/task37-regression-comparison.json` |
| `logs/baseline-task37/task27-v19/` |
| `logs/baseline-task37/task28-v1/` |
| `logs/baseline-task37/targeted-http-v23/` |
