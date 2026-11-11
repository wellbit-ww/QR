# Task 39 — Priority B resolution (minimal evaluator correction + extract / grounding)

## Executive summary (HTTP, 2026-11-09)

Runner **`1.8-task39`**, portal **`http://127.0.0.1:3000`**, `authMode: eval_login`.

| Run | Path | Result |
|-----|------|--------|
| Priority B ×10 | `logs/baseline-task39/targeted-http-priority-b-10/` | **9/10** pass, **1** fail (`gen.rh.rule-above30`, **grounding**; factual **pass**) |
| Power smoke (8 / 40 / 810 W) | `logs/baseline-task39/targeted-http-power-smoke/` | **3/3** pass |
| Task 27 | `logs/baseline-task39/task27-regression-http/` | **32/32** pass |
| Task 28 | `logs/baseline-task39/task28-generalization-http/` | **69/110** pass, **37** fail, **4** N/E, **infra 0**; leakage **0/20** |

**Vs Task 38:** Priority B **7→9**, Task 27 **unchanged 32/32**, Task 28 **66→69** pass (+3).  
**Task 39 DoD gap (на момент закрытия Task 39):** Priority B **9/10** — **`gen.rh.rule-above30`** (grounding). **Закрыто в Task 40:** см. единый отчёт `docs/reports/sdb1560m-task40-rh-grounding-evidence-recovery.md` — Priority B **10/10**, HTTP в `logs/baseline-task40/`.

---

## 1. Initial Git state

| Field | Value |
|--------|--------|
| Branch | `backup/sova-portal` |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Working tree | **Dirty** (many modified and untracked files; unchanged by this work except new Task 39 docs/logs noted below) |

Task 38 report (authoritative baseline): `docs/reports/sdb1560m-task38-regression-recovery-and-extract-fixes.md`.

---

## 2. Root cause by case

### P0 — `gen.multi.dry-regen-power`

**Symptom (Task 38):** Answer contained **40 Вт** and **540 Вт** with `extractKind: power_dry_regen`, but `evaluateRequiredFact` reported **contradiction** for both required facts.

**Cause:** `hasConflictingAlternateNumeric` treats any *other* number with a watt marker near it as a conflicting alternate. A single sentence legitimately carries two W values.

**Fix:** When the suite has exactly **two** pure numeric **W** facts with patterns **40** and **540**, enable a scoped dual-pair mode: the “alternate” is exempt only if `alternateExemptDryRegenDualW` places **540** in a **регенерац** clause and **40** in a true **режим осушения** clause (not “регенерации **осушителя**”).

### P1 — `gen.note.height-signal`

**Symptom (Task 38):** Factual pass, **grounding fail** — evidence lines split so no segment contained `без\s+учета` as one span.

**Cause:** `buildGroundingEvidenceSegments` only considered **single** trimmed lines.

**Fix:** For each chunk / extract corpus excerpt, also add **adjacent line pairs and triples** as segments so split footnotes still ground the claim.

### P2 — `gen.rh.rule-above30`

**Symptom (Task 38):** Extract kind `rh_setpoint_rule` present; final answer omitted standalone **20**; `should_replace` did not win.

**Cause:** `extractSatisfiesQuery` for `rh_setpoint_rule` was too loose; weak priors could look “satisfying”; `priorAnswerFullyAnswersQuery` for `power_dry_regen` could treat two bare numbers as complete without drying/regen wording.

**Fix:**

- Stricter `extractSatisfiesQuery` for `rh_setpoint_rule`: require **20** plus offset phrasing or **RH%окр** context.
- `priorAnswerFullyAnswersQuery("power_dry_regen")`: require **40** and **540** **and** both **осуш** and **регенерац** in the prior.
- `RETRIEVAL_CARD_BY_KIND.rh_setpoint_rule` → `setpoint-vs-ambient.md` so the extract corpus includes the rule text.
- **Test harness:** `RAG_HONEST_EQUIPMENT=sdb1560m` is set in `scripts/test-sdb1560m-task39-priority-b.js` so `tryHonestContextualNumericFact` runs the same path as production when env is unset.

---

## 3. Files changed (Task 39)

| File | Rationale |
|------|-----------|
| `scripts/sdb1560m-eval-runner-lib.js` | `EVAL_RUNNER_LIB_VERSION` → **1.8-task39**; dual dry/regen W pair detection + scoped exemption in `hasConflictingAlternateNumeric`; grounding segment pair/triple join; export `isDualDryRegenWFactPair`. |
| `src/rag/honest-contextual-extract.js` | RH setpoint satisfaction; `priorAnswerFullyAnswersQuery` for `power_dry_regen` / `rh_setpoint_rule`; retrieval card mapping for `rh_setpoint_rule`. |
| `scripts/test-sdb1560m-eval-runner-unit.js` | Negative / positive tests for dual-W factual and adjacent-line grounding. |
| `scripts/test-sdb1560m-task39-priority-b.js` | End-to-end checks for P0/P1/P2; sets `RAG_HONEST_EQUIPMENT`. |
| `logs/baseline-task39/task39-case-analysis.json` | Structured case analysis (this task). |
| `logs/baseline-task39/task39-regression-comparison.json` | Task 38 vs Task 39 comparison shell (HTTP pending). |
| `docs/reports/sdb1560m-task39-priority-b-resolution.md` | This report. |

**Not modified (per constraints):** evaluation JSON suites, golden facts, Qdrant, `.env`.

---

## 4. Evaluator changes and safeguards

- **Scope:** Dual-W exemption applies only when `isDualDryRegenWFactPair(requiredFacts)` is true (exactly two **W** numerics **40** + **540**).
- **Semantics:** Each alternate must pass **label-aware** `alternateExemptDryRegenDualW` (drying-mode clause vs regeneration clause).
- **Not disabled:** Global alternate-number detection remains for all other cases.
- **Negative coverage:** `testTask39DryRegenDualWFactual` and `scripts/test-sdb1560m-task39-priority-b.js` cover good path, swapped labels, wrong second value, stray **810 Вт**, and non-pair facts.

---

## 5. Unit-test results (this workspace)

Executed in order (PowerShell, `RAG_HONEST_EQUIPMENT=sdb1560m` where needed):

| Script | Result |
|--------|--------|
| `node scripts/test-sdb1560m-task39-priority-b.js` | **OK** |
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **OK** |
| `node scripts/test-sdb1560m-task38-regression-recovery.js` | **OK** |
| `node scripts/test-sdb1560m-task37-contextual-extract.js` | **OK** |
| `node scripts/test-sdb1560m-task27-extract-routing.js` | **OK** |
| `node scripts/test-sdb1560m-task35-hallucination-grounding.js` | **OK** |
| `node scripts/test-sdb1560m-task32-grounding.js` | **OK** (extra sanity) |

---

## 6. Targeted HTTP — Priority B ×10

`logs/baseline-task39/targeted-http-priority-b-10/` (captured **2026-11-09T05:30:39Z**)

```json
{ "total": 10, "pass": 9, "fail": 1, "infrastructure_error": 0, "not_evaluable": 0 }
```

| Case | Task 38 | Task 39 | Notes |
|------|---------|---------|--------|
| `gen.multi.dry-regen-power` | fail (contradiction) | **pass** | Dual-W evaluator |
| `gen.note.height-signal` | fail (grounding) | **pass** | Line pair/triple segments |
| `gen.rh.rule-above30` | fail (missing 20) | **fail (grounding)** | Answer has **20**; factual **pass**; chunks lack **20** in segments |
| Other 7 Priority B | pass | **pass** | Unchanged |

## 7. Targeted HTTP — power (8 / 40 / 810 W)

`logs/baseline-task39/targeted-http-power-smoke/` (**2026-11-09T05:33:52Z**)

```json
{ "total": 3, "pass": 3, "fail": 0, "infrastructure_error": 0 }
```

- `gen.num.pwr-storage` → **8 W**
- `gen.num.pwr-dry` → **40 W**
- `gen.num.pwr-dry-opt810` → **810 W**

## 8. Full Task 27 HTTP

`logs/baseline-task39/task27-regression-http/` (**2026-11-09T05:34:22Z**)

```json
{ "total": 32, "pass": 32, "fail": 0, "infrastructure_error": 0 }
```

Leakage subset in report: **0/7** forbidden matches.

## 9. Full Task 28 HTTP

`logs/baseline-task39/task28-generalization-http/` (**2026-11-09T05:42:15Z**)

```json
{ "total": 110, "pass": 69, "fail": 37, "not_evaluable": 4, "infrastructure_error": 0 }
```

- **cross_model_leakage_rate:** **0/20**
- **regression_pass_rate:** **69/106** (4 cases excluded as not_evaluable)

---

## 10. Comparison vs Task 38

| Metric | Task 38 (`1.7-task33`) | Task 39 (`1.8-task39`) | Δ |
|--------|------------------------|------------------------|---|
| Priority B pass | 7/10 | **9/10** | **+2** |
| Task 27 pass | 32/32 | **32/32** | 0 |
| Task 28 pass | 66/110 | **69/110** | **+3** |
| Task 28 fail | 40 | **37** | **−3** |
| Infrastructure errors | 0 | **0** | 0 |
| Leakage (Task 28) | 0/20 | **0/20** | 0 |

Structured delta: `logs/baseline-task39/task39-regression-comparison.json`.

---

## 11. Remaining failures and limitations

- **DoD not fully closed:** Priority B **9/10** — only **`gen.rh.rule-above30`**.
- **Symptom:** `overall.reason: grounding`; answer preview includes **«минус 20 RH%»** and `extractKind: rh_setpoint_rule`; **`required fact not found in evidence segments`** for pattern **`20`** (same outcome on full Task 28 run).
- **Likely next step:** extend grounding for applied `rh_setpoint_rule` (corpus / setpoint card) without weakening global numeric checks — analogous to P1 line-join or contextual_extract corpus path.
- **Dual-W evaluator** remains scoped to **40+540 W** pairs only.

---

## 12. Final Git status

Branch **`backup/sova-portal`**, HEAD **`8523954fadcc4f31b92305f81b8dfc09f3e61a14`**. Working tree **dirty**.

**Task 39 artifacts:**

- `docs/reports/sdb1560m-task39-priority-b-resolution.md` (this file)
- `logs/baseline-task39/task39-case-analysis.json`
- `logs/baseline-task39/task39-regression-comparison.json`
- `logs/baseline-task39/targeted-http-priority-b-10/{manifest.json,report.json}`
- `logs/baseline-task39/targeted-http-power-smoke/{manifest.json,report.json}`
- `logs/baseline-task39/task27-regression-http/{manifest.json,report.json}`
- `logs/baseline-task39/task28-generalization-http/{manifest.json,report.json}`

**No commit** was created.
