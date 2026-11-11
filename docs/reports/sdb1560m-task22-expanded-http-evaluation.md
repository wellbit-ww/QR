# Task 22 — Expanded SDB1560NM HTTP Evaluation and Grounding Diagnostics

**Date:** 2026-10-29  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Status:** **Complete (operator HTTP)** — expanded `verified` partition measured on live portal. **Not** a claim of whole-manual quality.

**Production code changed in Task 22:** **No**

---

## 1. Preservation and preflight

| Check | Result |
|-------|--------|
| `git reset` / clean / stash / commit | **None** |
| Baselines task9–task21 / Task 18 r3 | **Not modified** |
| Eval suite JSON | **Not modified** |
| `.env` | **Not read** |

**Expanded suite:** `docs/reports/sdb1560m-eval-suite-expanded-v1.json`  
**SHA-256:** `0ea1ccf790ec5dfb8f2caaa9aeb5e665a00cf55d2a07228b258aab78c69d8b36`  
**Partition `verified`:** **32 cases**

**Authoritative HTTP artifact:** `logs/baseline-task22/http-verified-20261029-r2/`  
**Captured at:** `2026-10-29T09:31:26.310Z` · `authMode: eval_login` · `evalRunnerLibVersion: 1.4-task18`

**Credential failure artifact (retained):** `logs/baseline-task22/http-verified-20261029/` — 32× `infrastructure_error` (agent shell).

**Command (operator):**

```powershell
node scripts/run-sdb1560m-eval-v1.js `
  --allow-http `
  --partition=verified `
  --dataset=docs/reports/sdb1560m-eval-suite-expanded-v1.json `
  --out=logs/baseline-task22/http-verified-20261029-r2
```

---

## 2. Results summary

| Metric | Value | Notes |
|--------|------:|-------|
| Cases run | **32** | `verified` only |
| **Regression pass (overall checker)** | **21 / 32 (65.6%)** | Any failing layer → fail |
| **Factual layer pass** | **23 / 32 (71.9%)** | From run `SUMMARY.md` |
| Infrastructure errors | **0** | Operator credentials |
| Blocked / not run | **0** | — |

**Exit code:** expect **1** when any case fails (11 failures).

This measures **deterministic checker behavior on HTTP answers**, not human rubric scores across the full PDF.

---

## 3. Failure taxonomy (11 failures)

| Case ID | Overall reason | Classification | Notes |
|---------|----------------|----------------|-------|
| `exp.num.mass.direct` | retrieval | **eval / suite** | Answer **260 kg**; factual **pass**; retrieval fails — `mustIncludeSourceDocPatterns` double-escaped in JSON (`\\.pdf` → literal backslash) |
| `exp.num.pwr-storage-8` | factual | **RAG** | Answered **810 W** storage max instead of **8 W** base line |
| `exp.num.rh-range` | factual | **RAG** | Hedging / incomplete **0–80 %RH** ambient range |
| `exp.num.rh-accuracy` | factual | **suite / checker** | Preview has `± 1RH%`; suite `claimPattern` does not match (invalid / over-escaped regex) |
| `exp.num.n2-timer-99` | factual | **suite / checker** | Preview **99.9 min** (golden); bounded **99** pattern rejects decimal form |
| `exp.para.warmup-plain` | factual | **RAG** | No **180 min** warmup time |
| `exp.env.temp-range` | factual | **RAG** | Missing clear **15 / 35 °C** ambient band |
| `exp.alarm.red-lamp` | factual | **RAG** | “No info in fragments” style |
| `exp.alarm.rh-rise-loading` | factual | **RAG** | Missing **1.1.4.4.1** / ventilator procedure cues |
| `exp.alarm.w-display` | factual | **RAG** | Weak match on **W** / подогрев meaning |
| `exp.num.pwr-storage-with-opt-810` | forbidden / leakage | **eval design** | Factual **pass**; forbidden digit **`8`** hits substring of **810** |

**Aggregate (diagnostics):** 7 RAG factual miss · 2 suite/checker defect · 1 eval retrieval pattern · 1 forbidden false positive.

Per-case JSON: [`sdb1560m-task22-case-diagnostics.json`](sdb1560m-task22-case-diagnostics.json).

---

## 4. Task 18 overlap (6 intents)

| Expanded ID | Task 18 draft | r2 overall | r2 note |
|-------------|---------------|------------|---------|
| `exp.num.mass.direct` | `num.mass.verified` | **fail** | retrieval only; mass **260 kg** in answer |
| `exp.para.mass-heavy` | `para.mass-colloquial.verified` | **pass** | — |
| `exp.num.pwr-dry-base-40` | `num.dry-power-base.verified` | **pass** | — |
| `exp.mode.regen-no-shutdown` | `mode.regen-shutdown.verified` | **pass** | — |
| `exp.maint.desicc-36mo` | `maint.desicc-interval.verified` | **pass** | — |
| `exp.alarm.beep-open-door` | `alarm.beep-door.verified` | **pass** | — |

Task 18 frozen HTTP (draft v1, 6 cases): **6/6 pass** — `logs/baseline-task18/http-verify-20261029-r3/`.

**Interpretation:** Task 17 mass fix still holds on factual content; expanded mass case adds a **retrieval-layer false fail** from suite regex, not a regression to **156 kg**.

---

## 5. Grounding and retrieval observability

| Evidence | r2 HTTP report | Notes |
|----------|----------------|-------|
| `sourceDocs` | Present (names, max 4) | Weak signal |
| Chunk bodies | **`chunkTextCount: 0`** all 32 cases | Grounding layer **not_evaluable** |
| `hasDebugTrace` | **true** all cases | Trace not persisted in `report.json` |
| Grounding layer | **not_evaluable** | Same limitation as Task 18 |

**Checker pass ≠ grounded fact:** all **21 passing** cases also have **`chunkTextCount: 0`** (listed in diagnostics as `checkerPassButUngrounded`).

Do **not** equate PDF filename in `sourceDocs` with retrieved or grounded content.

---

## 6. Topic coverage (verified 32)

Failures cluster in **power (storage lines)**, **RH / env**, **warmup paraphrase**, and **alarm / troubleshooting** (4 cases). Numeric specs with golden-backed deterministic paths (mass colloquial, dry 40 W, desicc 36 mo, regen shutdown, beep door) largely **pass** overall except mass **direct** retrieval quirk.

Blocked partition (C1–C4 conflicts) was **not** run in Task 22 HTTP scope.

---

## 7. Recommended follow-ups (out of Task 22 scope)

1. **Suite fixes (no silent weakening):** unescape `mustIncludeSourceDocPatterns` for `exp.num.mass.direct`; fix `exp.num.rh-accuracy` text pattern; allow **99.9** for `exp.num.n2-timer-99` or require **99.9** explicitly.
2. **Forbidden patterns:** narrow `8` on `exp.num.pwr-storage-with-opt-810` (word-boundary / context) so **810** does not false-trigger.
3. **RAG product work:** storage **8 W vs 810 W** routing, RH range/accuracy answers, warmup **180 min**, env temp band, alarm procedure depth — separate tasks with owner sign-off.
4. **Eval runner (optional):** persist redacted chunk hashes / retrieval summary in artifacts for grounding audits.

---

## 8. Deliverables

| Path | Status |
|------|--------|
| `logs/baseline-task22/http-verified-20261029/` | Credential failure (agent) — kept |
| `logs/baseline-task22/http-verified-20261029-r2/` | **Authoritative** 21/32 pass |
| `docs/reports/sdb1560m-task22-expanded-http-evaluation.md` | This report |
| `docs/reports/sdb1560m-task22-case-diagnostics.json` | 32 rows from **r2** `report.json` |

---

## 9. Conclusion

Task 22 **completed** expanded verified HTTP evaluation: **65.6% regression pass**, **71.9% factual-layer pass**, **0** infrastructure errors. Quality gaps are a mix of **real RAG misses** (8 checker-classified), **eval/suite defects** (3 cases: retrieval regex, RH accuracy pattern, N2 **99.9**), and **forbidden substring** on **810 W**. Mass answer content remains **260 kg**; do **not** infer whole-manual readiness from this 32-case slice.
