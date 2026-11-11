# Task 28 — SDB1560NM Generalization & Full-Manual Evaluation

**Date:** 2026-11-02  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (matches Task 27 expected HEAD)  
**Status:** **Complete — HTTP generalization scored** (`logs/baseline-task28/http-verified-20261102-v3/`). Task 27 regression **32/32** remains authoritative in `logs/baseline-task27/` (not re-run successfully in Task 28 follow-ups).

**Evaluator / regression suite:** unchanged — v2 + `1.5-task23`, Task 27 baseline directory untouched.

---

## 1. Git state (start ≈ end)

| | |
|--|--|
| Branch | `backup/sova-portal` |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Working tree | **dirty** (~108 lines in `git status --short`; pre-existing Task 25–27 work preserved) |

**Task 28–only additions (intended):**

- `scripts/build-sdb1560m-generalization-v1.js`
- `scripts/test-sdb1560m-generalization-v1-dataset.js`
- `scripts/eval/sdb1560m-generalization-v1.json`
- `logs/baseline-task28/**` (new run artifacts; Task 27 `logs/baseline-task27/` not modified)
- `scripts/run-sdb1560m-eval-v1.js` (eval-only: `EVAL_DELAY_MS`, 429 retry/backoff)
- `server.js` / `.env.example` (optional `CHAT_RATE_LIMIT_MAX` for local eval >100 requests)

No commits. No reset/stash/clean. No production RAG, index, evaluator, or v2 suite edits.

---

## 2. Task 27 immutable baseline

| Artifact | Value |
|----------|--------|
| Report | `docs/reports/sdb1560m-task27-extract-routing-regression-recovery.md` |
| HTTP directory | `logs/baseline-task27/http-verified-20261102-v2/` |
| `report.json` SHA-256 | `634197E4FFDD8095B9589D50E7B8F34103156CA229B6518BD2948CE89A39A93C` |
| Authoritative score | **32/32** verified partition, leakage **0/7**, infra **0** (operator run 2026-11-02T06:12:09Z) |

v2 file contains **52** cases; **`--partition=verified`** selects **32** (`must_answer` + `requiredFacts` + `ready`).

---

## 3. Manual source and structure

| Source | Path / note |
|--------|-------------|
| Authoritative PDF | `public/manuals/SDB1560NM.pdf` (~1.6 MB, present) |
| Golden facts (curated) | `knowledge/sdb1560m/golden-facts-sdb1560m.md` |
| Retrieval cards (Task 26+) | `knowledge/sdb1560m/retrieval-cards/*.md` (15 procedure/fact cards) |
| PDF text audit samples | `docs/reports/sdb1560m-audit-pdf-pages/page-*.txt`, `page-text-samples.json`, `pattern-search.json` |

**Document outline used for question design:**

1. **§1.1** — назначение, ТТХ (RH, мощность, питание, габариты, условия эксплуатации, ESD, IP, RAL).
2. **§1.1.3–1.1.4** — комплектация (табл. 1.2), запасные части (1.3), опции (1.4), индикация LCD/свет, звук, режимы, процедуры двери/осушения.
3. **§1.2.2** — опция азота (давление, расход, таймер, датчик).
4. **§3.1** — график ТО (табл. 3.1).
5. **Dry Storage** — удалённый доступ по Ethernet (не путать с «мобильным приложением»).

---

## 4. Processed corpus completeness (read-only check)

**Not re-indexed in Task 28.**

| Check | Finding |
|-------|---------|
| PDF available to portal/RAG | Yes (`public/manuals/SDB1560NM.pdf`) |
| Supplementary markdown | Golden facts + 15 retrieval cards; no full-page markdown dump of entire PDF in repo |
| Audit text layer | Spot pages extracted (e.g. 4–12, 15, 25, 35); `pattern-search.json` maps many facts to page numbers across the manual |
| Tables | Table 1.1 (mass/dims), 1.2 (kit), 1.3–1.4 (spares/options), 3.1 (maintenance) represented in audit snippets |
| Known gaps | **Internal/full volume in liters** (1896 / 2070 in golden) **not verified in PDF text layer** — excluded from answer cases; included as **abstain** generalization cases |
| Images / captions | Not systematically verified in this task; indicator semantics taken from text §1.1.4.3 |

**Order / duplicate chunks:** not validated against Qdrant in Task 28 (no DB access change).

---

## 5. Methodology — generalization dataset

1. Builder script derives cases from **PDF audit excerpts** and golden facts, **not** from v2 messages.
2. Overlap check: **0** identical questions vs `sdb1560m-eval-suite-expanded-v2.json`.
3. Each `must_answer` case has `requiredFacts[].sourceHint` (PDF section/page).
4. Each `must_abstain` case has `abstentionRules` + human `abstainReason` / `notes`.
5. Schema: `1.0-eval-contour`, same fields as v2; evaluator **1.5-task23** without modification.

**Build / validate:**

```text
node scripts/build-sdb1560m-generalization-v1.js
node scripts/test-sdb1560m-generalization-v1-dataset.js
```

---

## 6. Dataset composition

**File:** `scripts/eval/sdb1560m-generalization-v1.json`  
**SHA-256:** `38236023a4631691a32a62422066b58fbede2f00aea9ef76f88d6f8d4c4dbcff`

| Metric | Count |
|--------|------:|
| **Total cases** | **110** |
| `must_answer` | 93 |
| `must_abstain` | 17 |

**By category:**

| Category | Cases |
|----------|------:|
| numeric_spec | 46 |
| kit_completeness | 18 |
| operating_mode | 10 |
| unsupported_by_manual | 17 |
| paraphrase | 7 |
| maintenance | 5 |
| alarm_troubleshooting | 5 |
| foreign_model | 2 |

**Manual section coverage (primary sources in `sourceHint`):**

§1.1.2 TTX · §1.1.2.6–7 power · §1.1.2.12 environment · §1.1.3–1.4 kit/options · §1.1.4.3–4 indication/procedures · §1.2.2 N2 · §3.1 maintenance · unsupported list (Wi‑Fi, MQTT, Modbus, IP, etc.).

**Unresolved / not promoted to golden answer cases:**

- `F-VOL-INT` / `F-VOL-FULL` (liters) — abstain cases `gen.unsup.internal-volume-liters`, `gen.unsup.full-volume-liters`.
- Regeneration **duration in minutes** — abstain `gen.unsup.regen-duration-min` (3 h warmup ≠ regen length).

---

## 7. Dataset validation results

`node scripts/test-sdb1560m-generalization-v1-dataset.js` → **pass**

- JSON schema valid (`validateSuiteDocument`).
- Unique IDs and messages.
- No v2 question text overlap.
- Source metadata complete.
- Partitions: `all`=110, `verified`=93, `unsupported`=17.

---

## 8. HTTP results

### 8.1 Authoritative generalization run

**Directory:** `logs/baseline-task28/http-verified-20261102-v3/`  
**Captured:** 2026-11-02T07:20:40Z · **evaluator** `1.5-task23` · **infra errors 0**  
**`report.json` SHA-256:** `F540C5F848C94E0322D200778098ADFC9554852D4EAD43A1156B77AD825D480`

| Metric | Value |
|--------|------:|
| **Overall pass / fail** | **41 / 66** (+ **3** `not_evaluable`) |
| `must_answer` pass / fail | **41 / 49** |
| `must_abstain` pass / fail | **0 / 17** |
| Factual accuracy (runner metric) | **45.6%** (41/90 denom) |
| Cross-model leakage (denom 21) | **4.8%** (1 fail) |
| Infrastructure errors | **0** |

**By category (pass / fail / not_evaluable):**

| Category | Pass | Fail | NE |
|----------|-----:|-----:|---:|
| numeric_spec | 19 | 26 | 1 |
| kit_completeness | 10 | 8 | 0 |
| operating_mode | 6 | 3 | 1 |
| unsupported_by_manual | 0 | 17 | 0 |
| alarm_troubleshooting | 0 | 5 | 0 |
| paraphrase | 2 | 4 | 1 |
| maintenance | 3 | 2 | 0 |
| foreign_model | 1 | 1 | 0 |

**Run notes:** Prolonged **429** mid-run (chat limit 100/15 min); runner retried until window cleared. For suites **>100** cases use **`CHAT_RATE_LIMIT_MAX=500`** on portal restart and **`EVAL_DELAY_MS=8000–10000`**.

### 8.2 Non-authoritative / partial attempts (historical)

| Directory | Result |
|-----------|--------|
| `http-verified-20261102-v1/` | Missing credentials → 110 × infra |
| `http-verified-20261102-v2/` | Partial + 429 → **40/110** pass (superseded by v3) |
| `task27-regression-http-attempt-20261102/` | 32 × infra (429 / creds) |
| `task27-regression-20261102-v2/` | 32 × infra (429 after generalization) |

### 8.3 Task 27 regression

**Authoritative:** `logs/baseline-task27/http-verified-20261102-v2/` — **32/32** (2026-11-02T06:12:09Z).

Task 28 did **not** produce a clean re-run of verified v2 on the same portal session after generalization; regression status on current tree is **unchanged** vs Task 27 report.

**Re-run command (separate session, after limit reset):**

```text
set EVAL_DELAY_MS=10000
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified ^
  --dataset=docs/reports/sdb1560m-eval-suite-expanded-v2.json ^
  --out=logs/baseline-task28/task27-regression-20261102-v4
```

---

## 9. RAG-stage error classification (HTTP v3)

Classification uses **`report.json` layer flags** only (no manual trace re-audit per case).

| Failure bucket | Count (among **66** overall fail) | Interpretation |
|----------------|-------------------------------------:|----------------|
| **Factual / generation** (`layers.factual` fail) | **49** | Answer missing required regex facts or wrong numbers |
| **Abstention** (`layers.abstention` fail) | **17** | All **17** `must_abstain` cases — RAG **answered** instead of abstaining |
| **Forbidden leakage** | **1** | `foreign_model` or cross-model claim |
| **Retrieval** (layer fail) | **0** | Evaluator did not mark retrieval fail on these cases |
| **Grounding** (layer fail) | **0** | Same |
| **`not_evaluable`** (heuristic) | **3** | `gen.num.ip55`, `gen.sym.n2`, `gen.para.ip` — `factual_heuristic_limit` |

**Patterns (qualitative):**

- **Abstain suite 0/17** — largest gap vs Task 27 (v2 unsupported partition was HTTP-green). Wi‑Fi/MQTT/Modbus/volume-L questions often get **confident numeric or procedural answers**.
- **`alarm_troubleshooting` 0/5** — door/fan/60 min/+1 RH procedures not matching golden regexes on independent wording.
- **`numeric_spec`** — mixed pass; failures include pressure kPa, RAL, kit counts, **N2 option** block (many fails), some core TTX still pass (power modes, several env limits).
- **Retrieval not flagged** — does **not** prove retrieval was correct; evaluator v1.5 often scores factual-only without retrieval pass on these cases.

**Production RAG code:** no Task 28 fixes applied (evaluation-only).

---

## 10. Comparison with Task 27

| Aspect | Task 27 (v2 verified) | Task 28 generalization v1 (HTTP v3) |
|--------|------------------------|-------------------------------------|
| Cases | 32 | 110 |
| HTTP pass rate | **100%** (32/32) | **37.3%** overall (41/110) |
| Answer cases | 32/32 | **44.1%** (41/93) |
| Abstain cases | 7/7 (leakage partition) | **0/17** |
| Infra | 0 | 0 |
| Overlap with v2 questions | Same suite | **0** text overlap |

**Takeaway:** Regression suite shows RAG **stable on curated 32**; independent manual-style questions expose **abstention** and **breadth** weaknesses (kit/N2/alarm wording), not a single v2 regression.

---

## 11. Changed files (Task 28)

| File | Role |
|------|------|
| `scripts/eval/sdb1560m-generalization-v1.json` | Dataset |
| `scripts/build-sdb1560m-generalization-v1.js` | Builder |
| `scripts/test-sdb1560m-generalization-v1-dataset.js` | Validation |
| `scripts/run-sdb1560m-eval-v1.js` | Eval HTTP pacing / 429 retry |
| `server.js`, `.env.example` | Optional `CHAT_RATE_LIMIT_MAX` |
| `docs/reports/sdb1560m-task28-generalization-evaluation.md` | This report |
| `logs/baseline-task28/**` | HTTP artifacts |

**Production RAG (`src/rag/*`):** unchanged in Task 28 scope.

---

## 12. Limitations

1. Generalization HTTP **one full run** (v3); mid-run **429** may have added latency/variance; not A/B repeated.
2. Dataset from **audit excerpts + golden**, not full manual line-by-line review.
3. Evaluator regex **≠** semantic truth; **3** `not_evaluable` factual heuristics.
4. **Dirty working tree** at HEAD `8523954…` — RAG may differ from committed snapshot.
5. **No Task 27 re-verify** after v3 on same day/session.
6. Layer taxonomy **without** per-case retrieval trace review.

---

## 13. Recommendations

1. **Abstention:** align unsupported handling with Task 27 v2 behavior on **new phrasings** (17/17 fail is priority).
2. **Alarm / procedure cards:** extend retrieval or extract for door/fan/60 min/+1 RH **independent questions** (0/5 pass).
3. **N2 option block:** diagnose factual misses (retrieval vs generation) with chat logs for `gen.opt.n2-*`.
4. Re-run **v2 verified 32/32** after portal limit reset → `task27-regression-*-v4` to confirm no drift.
5. Optional: tighten generalization **abstain** patterns or add routing cases only after root-cause evidence (do not weaken evaluator).

---

## 14. Result table

| Проверка | Результат |
|---|---|
| Task 27 regression suite (authoritative) | **32/32** (`baseline-task27/http-verified-20261102-v2/`) |
| Task 27 re-check in Task 28 | **Not cleanly re-verified** (429 / not run to completion) |
| **Новая generalization suite (HTTP v3)** | **41/110 pass** |
| Infrastructure errors (v3) | **0** |
| Answer cases | **41/93 pass** |
| Abstention cases | **0/17 pass** |
| Unsupported claims (leakage metric) | **1** fail in denom |
| Не классифицировано (deep trace) | **3** not_evaluable + cases without retrieval traces |

---

## 15. HTTP vs hypothesis

| Confirmed by HTTP (v3) | Not confirmed / open |
|------------------------|----------------------|
| **41/110** overall; **41/93** answer; **0/17** abstain | Exact root cause per failed case (retrieval vs extract vs LLM) |
| **0** infra on v3 | Task 27 still **32/32** on **current** code without re-run |
| Abstention is the main generalization gap | Whether 429 mid-run biased late-case scores |
| Alarm and N2 sections weak on independent wording | Corpus/index gaps |

---

**Stop:** Task 28 evaluation **documented** with HTTP v3; **Task 29 not started.**
