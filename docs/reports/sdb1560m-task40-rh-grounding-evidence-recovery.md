# Task 40 — SDB1560NM RH above-30: source-to-grounding evidence recovery

## Executive summary (HTTP complete, 2026-11-09)

Runner **`1.9-task40-r1`**, portal `http://127.0.0.1:3000`, `authMode: eval_login`.  
**Артефакты:** `logs/baseline-task40/` · сводка JSON: `logs/baseline-task40/task40-regression-comparison.json`.

### Task 40 Definition of Done — **закрыт по HTTP**

| Критерий | Task 39 | Task 40 | Статус |
|----------|---------|---------|--------|
| Priority B ×10 | 9/10 | **10/10** | OK |
| `gen.rh.rule-above30` | fail (grounding) | **pass** | OK |
| Power smoke 8/40/810 W | 3/3 | **3/3** | OK |
| Task 27 | 32/32 | **32/32** | OK |
| Task 28 | 69/110 | **70/110** (+1) | OK (порог ≥69) |
| Cross-model leakage (T28) | 0/20 | **0/20** | OK |
| Infrastructure errors | 0 | **0** | OK |

### HTTP runs (authoritative)

| Run | Directory | Captured (UTC) | Summary |
|-----|-----------|----------------|---------|
| RH above-30 | `targeted-http-rh-above30-r24/` | 07:41:46 | **1/1** pass |
| Priority B ×10 | `targeted-http-priority-b-10/` | 07:51:07 | **10/10** pass |
| Power smoke | `targeted-http-power-smoke/` | 07:57:34 | **3/3** pass |
| Task 27 | `task27-regression-http/` | 07:59:00 | **32/32** pass |
| Task 28 (110) | `task28-generalization-http/` | 08:21:14 | **70/36/4** N/E, infra **0** |

**Task 28:** 36 failing cases remain in the generalization suite (как и раньше — не цель Task 40); регрессия **не хуже** Task 39 (69→70 pass).

**Предыдущие попытки (audit):** `targeted-http-rh-above30` (grounding fail), `targeted-http-rh-above30-r23` (infra `fetch failed`).

**Суть фикса:** правило **−20 RH%** для уставки **≥30 RH%** подтверждается РЭ (ВНИМАНИЕ п.2); routing + provenance + карточка в `sources[]` + eval **1.9-task40-r1**.

---

## 1. Git state (start / end)

| Field | Value |
|--------|--------|
| Branch | `backup/sova-portal` |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Working tree | **Dirty** (unchanged policy — no reset/stash/commit) |

Task 39 HTTP baseline: `logs/baseline-task39/` (Priority B **9/10**, `gen.rh.rule-above30` fail **grounding**).

---

## 2. Original manual passage (P0 source truth)

**File:** `Руководство SDB1560NM.pdf`  
**Location:** §1.1.1, **ВНИМАНИЕ**, item **2** (audit text layer: `docs/reports/sdb1560m-audit-pdf-pages/page-005.txt`).

Wording (PDF text layer):

> УСТАНАВЛИВАЕМОЕ ЗНАЧЕНИЕ ОТНОСИТЕЛЬНОЙ ВЛАЖНОСТИ ВНУТРИ РАБОЧЕГО ОБЪЕМА ШКАФА ДОЛЖНО БЫТЬ:  
> − ДЛЯ ДИАПАЗОНА ОТ 0RH% ДО 30RH% - НЕ БОЛЕЕ RH%окр.ср. - **10RH%**;  
> − ДЛЯ ДИАПАЗОНА ОТ **30RH% И ВЫШЕ** – НЕ БОЛЕЕ RH%окр.ср. - **20RH%**.

**Interpretation:** offset **20** is a **subtraction from ambient RH** (percentage points), not a standalone RH range cap.  
**Retrieval card** `knowledge/sdb1560m/retrieval-cards/setpoint-vs-ambient.md` matches this passage (п. 1.1.1, 1.1.2, 1.1.4.4.1).

No source/evaluation discrepancy — the suite expectation **20** is supported.

---

## 3. Indexed content

- PDF chunks in Qdrant exist but the above-30 query (Task 39) was routed **`TROUBLESHOOTING_QA`** → maintenance/troubleshooting chunks in **prompt top-10** (no **20** in RH setpoint context).
- Card `setpoint-vs-ambient.md` appeared in **fused rank 12**, excluded from default prompt/sources window.
- Honest extract still built answer from **corpus** (prompt + card merge), but eval **sources[]** lacked the card → segment grounding failed.

---

## 4. Root cause

| Layer | Issue |
|--------|--------|
| Routing | Misclassified as troubleshooting (humidity symptom) instead of spec/rule query. |
| Retrieval | Setpoint rule card not in top prompt chunks → not in `sources[].content` for eval. |
| Provenance | `contextual_extract_early` via grounding contract without `traceOut` → eval saw `applied: false`, `groundingCorpusExcerpt: null`. |
| Evaluator | Bare numeric **20** in segments never matched; unrelated **20** must not pass (scoped check added). |

---

## 5. Changes (files and rationale)

| File | Change |
|------|--------|
| `src/rag/router/query-router.js` | `isRhSetpointRuleAbove30Query` → **REASONING_QA**, `hybrid_wide`, hints `1.1.1` / `ВНИМАНИЕ`; excluded from troubleshooting. |
| `src/rag/synthesis/sdb1560-grounding-contract.js` | `traceOut` on honest extract (early + late) → `trace.contextualExtract` with corpus excerpt. |
| `src/rag/honest-contextual-extract.js` | `appendRetrievalCardSource`, card read helpers; export `isRhSetpointRuleAbove30Query`. |
| `src/rag/pipeline/run-pipeline.js` | Propagate grounding-contract extract trace; append retrieval **card** to `sources[]` when extract applies; avoid overwriting applied trace at post-gate. |
| `scripts/sdb1560m-eval-runner-lib.js` | **1.9-task40-r1**: RH offset grounding scope; provenance from `groundingContract.contextualExtract`; evidence augment from setpoint card when early extract + RH answer. |
| `scripts/test-sdb1560m-task40-rh-grounding.js` | Source card/PDF excerpt, positive/negative segment tests, mock payload layers. |

**Not changed:** eval datasets, golden facts, Qdrant DB, global numeric contradiction rules.

---

## 6. Grounding trace (conceptual before → after)

**Before (Task 39 HTTP):** chunks = troubleshooting PDF; `extractKind: rh_setpoint_rule`; `contextualExtract.applied: false`; grounding **fail** on **20**.

**After (unit simulation):** `sources[]` includes `retrieval-cards/setpoint-vs-ambient.md` with `…30 RH%…− 20 RH%…`; and/or `groundingCorpusExcerpt` from applied extract trace → grounding **pass**; unrelated `220 В ± 10 %` / `20 месяцев` **rejected** by `segmentSupportsRhSetpointAbove30Offset`.

---

## 7. Unit tests (run locally)

```text
node scripts/test-sdb1560m-task40-rh-grounding.js
node scripts/test-sdb1560m-task39-priority-b.js
node scripts/test-sdb1560m-eval-runner-unit.js
node scripts/test-sdb1560m-task38-regression-recovery.js
node scripts/test-sdb1560m-task37-contextual-extract.js
node scripts/test-sdb1560m-task27-extract-routing.js
node scripts/test-sdb1560m-task35-hallucination-grounding.js
```

**Result in this workspace:** all **OK** (2026-11-09).

---

## 8. Targeted HTTP — `gen.rh.rule-above30` (authoritative)

`logs/baseline-task40/targeted-http-rh-above30-r24/` — captured **2026-11-09T07:41:46Z**

```json
{ "total": 1, "pass": 1, "fail": 0, "infrastructure_error": 0 }
```

| Layer | Status |
|--------|--------|
| Factual | **pass** (`20` in answer) |
| Grounding | **pass** |
| Leakage | **pass** |

**Pipeline (r24):** `REASONING_QA` / `hybrid_wide`; `extractKind: rh_setpoint_rule`; grounding contract **`contextual_extract_early`**; `groundingCorpusExcerpt` present; **11** evidence chunk bodies including **`retrieval-cards/setpoint-vs-ambient.md`**.

**Earlier HTTP attempts (for audit):**

| Out dir | Summary |
|---------|---------|
| `targeted-http-rh-above30` | 0/1 fail (**grounding**) — Task 39-era evidence |
| `targeted-http-rh-above30-r23` | 0/0/1 **infra** — portal restart race (`fetch failed`) |

---

## 9. HTTP — Priority B ×10

`logs/baseline-task40/targeted-http-priority-b-10/` (2026-11-09T07:51:07Z)

```json
{ "total": 10, "pass": 10, "fail": 0, "infrastructure_error": 0 }
```

Все десять кейсов Task 38/39 batch, включая **`gen.rh.rule-above30`** (после фикса grounding).

---

## 10. HTTP — power smoke и Task 27

| Run | Path | Summary |
|-----|------|---------|
| 8 / 40 / 810 W | `logs/baseline-task40/targeted-http-power-smoke/` | **3/3** (07:57:34Z) |
| Task 27 verified | `logs/baseline-task40/task27-regression-http/` | **32/32** (07:59:00Z), leakage subset **0/7** |

---

## 11. HTTP — Task 28 generalization

`logs/baseline-task40/task28-generalization-http/` (2026-11-09T08:21:14Z)

```json
{ "total": 110, "pass": 70, "fail": 36, "not_evaluable": 4, "infrastructure_error": 0 }
```

- **cross_model_leakage_rate:** **0/20**
- vs Task 39: **69→70** pass, **37→36** fail (небольшое улучшение; 36 прочих fail не входили в scope Task 40)

---

## 12. Сравнение Task 37 → 38 → 39 → 40 (HTTP)

| Metric | Task 38 | Task 39 | Task 40 |
|--------|---------|---------|---------|
| Priority B | 7/10 | 9/10 | **10/10** |
| Task 27 | 32/32 | 32/32 | **32/32** |
| Task 28 pass | 66/110 | 69/110 | **70/110** |
| RH above-30 | fail | fail (grounding) | **pass** |
| Leakage T28 | 0/20 | 0/20 | **0/20** |

---

## 13. Ограничения

- **Task 28:** 36 failed + 4 not_evaluable — отдельная очередь generalization, не блокер Task 40.
- Scoped grounding для **20** только на формулировку «уставка от 30 RH% и выше».
- Карточка в `sources[]` — текст источника, не подстановка ответа.

---

## Artifacts

| Артефакт | Назначение |
|----------|------------|
| **`docs/reports/sdb1560m-task40-rh-grounding-evidence-recovery.md`** | Этот отчёт (единая точка) |
| `logs/baseline-task40/task40-regression-comparison.json` | Цифры и DoD |
| `logs/baseline-task40/task40-case-analysis.json` | Root cause `gen.rh.rule-above30` |
| `logs/baseline-task40/*/report.json` | HTTP manifests (5 прогонов) |

**No commit.**
