# Task 27 — Extract Routing, Scope Guards, Regression Recovery

**Date:** 2026-11-02  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged)  
**Status:** **Complete — HTTP verified 32/32 (100%)**.

**Authoritative Task 27 HTTP:** `logs/baseline-task27/http-verified-20261102-v2/` · **2026-11-02T06:12:09Z** · infra **0**.

**Historical baselines (unchanged):** Task 25 r2 **29/32** · Task 26 **28/32** (`logs/baseline-task26/http-verified-20261102-v2/`).

**Evaluator / suite:** v2 + `1.5-task23` (unchanged).

---

## 1. Git state

| | |
|--|--|
| Branch | `backup/sova-portal` |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Working tree | **dirty** (preserved; no reset/clean/stash/commit) |

---

## 2. Root cause per Task 26 regression

| Case | Task 26 failure | Root cause |
|------|-----------------|------------|
| `exp.num.rh-step` | «параметр не указан» | **No `rh_step` kind** — abstain not replaced. |
| `exp.multi.mass-and-width` | Dims only, no **260 kg** | Partial **`dimensions` FORCE replace**; Cyrillic «Масса» missed by `\b` mass detection. |
| `exp.env.rh-ambient-max` | **+15…+35 °C** | **`ambient_temp`** on RH-max question («окружающий воздух» without temp guard). |
| `exp.num.pwr-storage-with-opt-810` | **8 Вт** + forbidden **8** | **`power_storage`** on options question. |

**Common mechanism:** RAG_PURE contextual extract without **scope validation** and **safe replacement**.

---

## 3. Pipeline evidence (selection / replacement)

1. Single **`resolveExtractKind`** per message — wrong priority → wrong extract.
2. **`FORCE_CONTEXT_EXTRACT_KINDS`** replaced good/partial LLM answers.
3. No **`extractSatisfiesQuery`** before replace.
4. Task 26 offline tests lacked **negative** routing cases.

---

## 4. Production changes

| File | Change |
|------|--------|
| `src/rag/honest-contextual-extract.js` | Kinds: `rh_step`, `rh_ambient_max`, `power_storage_opt`, `mass_and_dimensions`; **`shouldReplaceWithExtract`** / **`extractSatisfiesQuery`**; alarm kinds preserved |
| `src/rag/sdb1560m-rag-priority.js` | **`isSdb1560mAmbientTempQuery`**: exclude humidity-only ambient queries |
| `scripts/test-sdb1560m-task27-extract-routing.js` | Routing regression suite |

---

## 5. New routing / guard logic (summary)

- **Priority:** multi-fact mass+dims; RH step / RH ambient max before range / ambient temp; **810 W** vs **8 W** by options wording.
- **`extractSatisfiesQuery`:** extract must match question semantics.
- **`shouldReplaceWithExtract`:** no partial overwrite; no base storage on opt questions; weak/abstain still replaced.
- **Alarms:** Task 26 card + extract path unchanged.

---

## 6. Offline tests

| Script | Result |
|--------|--------|
| `node scripts/test-sdb1560m-task27-extract-routing.js` | **pass** |
| `node scripts/test-sdb1560m-task26-alarm-rag.js` | **pass** |
| `node scripts/test-sdb1560m-task25-rag-control.js` | **pass** |
| `node scripts/test-sdb1560m-task23-eval-repair.js` | **pass** |
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **pass** |

---

## 7. HTTP verification (operator)

**Artifact:** `logs/baseline-task27/http-verified-20261102-v2/`  
**Captured (UTC):** `2026-11-02T06:12:09.231Z`

| Metric | Task 27 | Task 26 | Task 25 r2 |
|--------|--------:|--------:|-----------:|
| Pass / fail | **32 / 0** | 28 / 4 | 29 / 3 |
| Factual accuracy | **100%** | 87.5% | 90.6% |
| Leakage (leak partition) | **0/7** | 1/7 | 0/7 |
| Infra | **0** | 0 | 0 |

### 7.1 Eleven control cases (all **pass** on HTTP)

| Group | Case IDs | Task 26 | Task 27 |
|-------|----------|---------|---------|
| Regressions fixed | `exp.num.rh-step`, `exp.multi.mass-and-width`, `exp.env.rh-ambient-max`, `exp.num.pwr-storage-with-opt-810` | fail | **pass** |
| Alarms (Task 26) | `exp.alarm.red-lamp`, `exp.alarm.rh-rise-loading`, `exp.alarm.w-display` | pass | **pass** |
| Task 25 controls | `exp.num.pwr-storage-8`, `exp.num.rh-range`, `exp.para.warmup-plain`, `exp.env.temp-range` | pass | **pass** |

Remaining **21** verified cases: **pass** (no new failures vs Task 25 r2 pass set).

---

## 8. HTTP results (summary)

Full suite v2 verified partition: **32/32**, **0** factual fails, **0** infra. No `"status": "fail"` in `report.json`.

---

## 9. Comparison Task 25 / 26 / 27

| Run | Pass | Δ vs prior |
|-----|-----:|------------|
| Task 24 r2 (ref.) | 25/32 | — |
| Task 25 r2 | 29/32 | +4 RAG (numeric/env) |
| Task 26 | 28/32 | +3 alarms, −4 extract routing |
| **Task 27** | **32/32** | **+4 regressions recovered**, alarms kept |

---

## 10. Regression check

| Check | Result |
|-------|--------|
| Four Task 26 regressions | **Restored (HTTP pass)** |
| Three Task 26 alarms | **Preserved (HTTP pass)** |
| Four Task 25 controls | **Preserved (HTTP pass)** |
| Full suite vs Task 25 r2 | **No case that passed in r2 now fails**; **+3** former alarm fails now pass |

---

## 11. Files changed (Task 27)

- `src/rag/honest-contextual-extract.js`
- `src/rag/sdb1560m-rag-priority.js`
- `scripts/test-sdb1560m-task27-extract-routing.js`
- `docs/reports/sdb1560m-task27-extract-routing-regression-recovery.md`

---

## 12. Working tree

User dirty state preserved; no destructive git operations.

---

## Verdict

| Criterion | Status |
|-----------|--------|
| Four regressions recovered | **Yes (HTTP)** |
| Three alarms preserved | **Yes (HTTP)** |
| Four Task 25 controls preserved | **Yes (HTTP)** |
| Full suite v2 verified | **32/32 (100%)** |
| Evaluator weakened | **No** |

**Task 27 complete.** Arc Tasks 25→26→27: **29 → 28 → 32** on same suite after portal restarts. Task 28 not started.

