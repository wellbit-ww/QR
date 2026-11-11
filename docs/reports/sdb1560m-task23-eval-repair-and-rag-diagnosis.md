# Task 23 — Repair Evaluation Defects and Diagnose SDB1560NM RAG Failures

**Date:** 2026-10-29  
**Branch:** `backup/sova-portal`  
**Git HEAD (start and end):** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Working tree:** dirty — preserved; no reset/clean/stash/commit.

**Production RAG / portal:** **not changed** in Task 23.

---

## 1. Initial Git state (recorded)

`git status --short` at task start showed many pre-existing modified and untracked paths (including `src/rag/*`, `package.json`, Task 9–22 reports, baselines, etc.). Task 23 **only** adds/edits the files listed in §8.

**Historical artifact SHA-256 (unchanged after Task 23):**

| Artifact | SHA-256 |
|----------|---------|
| `docs/reports/sdb1560m-eval-suite-expanded-v1.json` | `0ea1ccf790ec5dfb8f2caaa9aeb5e665a00cf55d2a07228b258aab78c69d8b36` |
| `logs/baseline-task22/http-verified-20261029-r2/report.json` | `18d3b8ed350d400a9ce1fb62ea5edbfbb8b3e231b38f0559b4b0cef66611fa03` |
| `logs/baseline-task22/http-verified-20261029/report.json` | `34486c108b0c769fd9c79bb624f7d0ada33bda8c01f015648a79c9996eada2e3` |

No writes to `logs/baseline-task18/http-verify-20261029-r3/` or Task 9–21 baseline directories.

---

## 2. Part A — Evaluation-only repairs

### 2.1 Root cause pattern (suite JSON)

Several expanded-v1 fields used **double JSON escaping**, so after `JSON.parse` the regex contained **literal `\s` (backslash + s)** instead of whitespace `\s`. Draft v1 used the correct single escape (see `sdb1560m-eval-suite-draft-v1.json` mass retrieval line).

### 2.2 Suite v2 (new file; v1 untouched)

**New file:** `docs/reports/sdb1560m-eval-suite-expanded-v2.json`  
**SHA-256:** `c628bf86d22405f4408f76e5c5a18ff720c44f395f1c72bee20f3183095b2f3a`  
**Parent:** expanded-v1 SHA above.

| Case ID | Field | v1 (loaded pattern / behavior) | v2 change | Reason |
|---------|--------|--------------------------------|-----------|--------|
| `exp.num.mass.direct` | `retrievalExpectations.mustIncludeSourceDocPatterns[0]` | `SDB1560NM\\.pdf\|…` with literal `\s` | `SDB1560NM\.pdf\|Руководство\s+SDB1560` (JSON: `"SDB1560NM\\.pdf\|Руководство\\s+SDB1560"`) | Matches `Руководство SDB1560NM.pdf` in Task 22 `evidenceUsed.sourceDocs`; retrieval assertion preserved |
| `exp.num.rh-accuracy` | `requiredFacts[0].claimPattern` | `±\\s*1\|1\\s*RH` (broken `\s`) | `±\s*1\s*RH\|±\s*1\s*%\s*RH\|1\s*RH\s*%` | Aligns with PDF/golden **±1 RH%** and Task 22 answer `± 1RH%` |
| `exp.num.n2-timer-99` | `requiredFacts[0]` | `claimPattern: "99"` | `claimPattern: "99.9"`, `unit: "min"` | Golden / manual **99,9 min**; explicit decimal required (not any `99` substring) |

**Not changed in suite v2:** `exp.num.pwr-storage-with-opt-810` forbidden spec (still forbids standalone **8 W** conceptually); fix is in the checker (below).

### 2.3 Eval runner (`scripts/sdb1560m-eval-runner-lib.js`)

**Version:** `1.4-task18` → **`1.5-task23`**

| Change | Behavior |
|--------|----------|
| `isPureNumericClaimPattern` | Accepts decimals `99.9` / `99,9` for required facts |
| `forbiddenPatternToRegex` + `evaluateCaseLayers` | Pure-numeric **forbidden** patterns use `buildBoundedNumberPattern` (same as required numerics) |
| `UNIT_ALIASES.min` | Supports **мин / minutes** for N2 timer unit check |

**Effect on `exp.num.pwr-storage-with-opt-810`:** Answer with **810 Вт** no longer hits forbidden **8**; answer asserting **8 Вт** in the optional-storage context still fails forbidden layer.

**Offline replay:** Task 22 r2 `answerPreview` + `evidenceUsed.sourceDocs` for the four eval-defect cases → **overall pass** under v2 + lib 1.5 (see `scripts/test-sdb1560m-task23-eval-repair.js`).

---

## 3. Part B — Seven RAG factual misses (Task 22 r2)

**Source:** `logs/baseline-task22/http-verified-20261029-r2/report.json`  
**Common artifact limits:** `chunkTextCount: 0` for all cases; `hasDebugTrace: true` but trace **not** stored in report; `sourceDocs` names only — **no** chunk bodies. Pipeline stage for retrieval vs generation: **undetermined** unless noted.

### 3.1 `exp.num.pwr-storage-8`

| Item | Detail |
|------|--------|
| Question | Сколько ватт в режиме хранения? |
| Answer (preview) | «Максимальная потребляемая мощность … в режиме хранения **не более 810 Вт**.» |
| Expected | **8 W** base storage (PDF p.5 / golden «не более 8 Вт») |
| Checker | Correct fail — missing bounded **8** with **W** |
| Chunks in artifact | **None** |
| Classification | **Genuinely incorrect** — wrong power tier (810 W with-options line vs 8 W base) |
| Plausible cause | **Undetermined** at retrieval; likely **generation / routing** conflating SDB1560M optional 810 W row with base storage (same symptom as pre-Task-17 mass confusion class) |
| Confidence | **High** on incorrect fact; **low** on pipeline stage |

### 3.2 `exp.num.rh-range`

| Item | Detail |
|------|--------|
| Question | Какой диапазон влажности поддерживает шкаф? |
| Answer (preview) | Claims cabinet does not actively humidify; cites **30%** max internal RH — not **0–80** |
| Expected | **0** and **80** (PDF 1.1.2.1 `[0 - 80RH%]`; golden 0–80 RH%) |
| Checker | Correct fail — missing **0** and **80** |
| Chunks | **None** |
| Classification | **Genuinely incorrect** — wrong numeric range and misleading “does not support humidity” framing vs manual (passive band 0–80, capped by ambient) |
| Plausible cause | **Undetermined**; **generation** (invented 30%) without evidence in artifact |
| Confidence | **High** incorrect; **low** stage |

### 3.3 `exp.para.warmup-plain`

| Item | Detail |
|------|--------|
| Question | Долго выходит на влажность после включения? |
| Answer (preview) | «В документации **не указано** конкретное время…» + generic compliance text |
| Expected | **180** min or **3 ч** (PDF 1.1.2.4 / golden ≤180 min) |
| Checker | Fail — `isAbstainLike` / must_answer (`не указан`) |
| Chunks | **None** |
| Classification | **Genuinely incorrect** — manual states ≤3 h; response abstains |
| Plausible cause | **Undetermined**; abstain-like wording consistent with **post-gate / generation** choosing non-answer |
| Confidence | **High** incorrect |

### 3.4 `exp.env.temp-range`

| Item | Detail |
|------|--------|
| Question | При какой температуре помещения можно эксплуатировать шкаф? |
| Answer (preview) | **+15 °C** lower bound cited; **+35 °C** upper **not** stated; «верхняя граница **не указана**» |
| Expected | **15** and **35** (case note: PDF 1.1.2.12 +15…+35 °C) |
| Checker | Fail — abstain-like (`не указан`) despite partial **15** |
| Chunks | **None** |
| Classification | **Incomplete and incorrect** for eval — missing **35**; hedged upper bound |
| Plausible cause | **Undetermined**; **generation** incomplete spec |
| Confidence | **Medium–high** incorrect/incomplete |

### 3.5 `exp.alarm.red-lamp`

| Item | Detail |
|------|--------|
| Question | Красная лампа мигает — что означает? |
| Answer (preview) | «В предоставленных фрагментах **нет** конкретной информации…»; pivots to door/beep |
| Expected | **Осушен** / **1.1.4.3** (PDF 1.1.4.3.3: green + **мигающий красный** = режим **«Осушения»**) |
| Checker | Fail — abstain-like + missing required patterns |
| Chunks | **None** |
| Classification | **Genuinely incorrect / incomplete** — does not state drying mode |
| Plausible cause | **Undetermined**; answer text suggests **missing context in prompt** but chunks not in artifact — cannot confirm retrieval failure |
| Confidence | **High** incorrect answer; **low** stage |

### 3.6 `exp.alarm.rh-rise-loading`

| Item | Detail |
|------|--------|
| Question | После загрузки влажность выросла — это нормально? |
| Answer (preview) | «Да, это нормально…» + generic RH control; **no** **1.1.4.4.1** / **вентилятор** / door procedure |
| Expected | Pattern `1.1.4.4.1\|вентилятор\|открыт` (procedure after loading / door) |
| Checker | Fail — missing required procedural cues |
| Chunks | **None** |
| Classification | **Semantically partial** (accepts normality) but **eval-incomplete** vs manual procedure depth |
| Plausible cause | **Undetermined**; **generation** omitting section cite |
| Confidence | **Medium** — partial user value, fail vs strict checker |

### 3.7 `exp.alarm.w-display`

| Item | Detail |
|------|--------|
| Question | На дисплее W — это ошибка? |
| Answer (preview, 320 chars) | Denies error; mentions **"W"**; hedges «нужна дополнительная информация…» (preview **truncated** at 320) |
| Expected | **подогрев** or **W** (PDF 1.1.4.3.2: **W** = система подогрева) |
| Checker (stored) | Fail — **must_answer but abstain-like** on **full** answer (preview alone is **not** abstain-like and would pass `подогрев\|W`) |
| Chunks | **None**; sources list golden + PDF names only |
| Classification | **Incomplete** — does not state подогрев; checker used **full** answer with abstain heuristic beyond stored preview |
| Plausible cause | **Undetermined** pipeline; **observability gap** — preview truncates before tail that triggered abstain-like |
| Confidence | **Medium** |

---

## 4. Part C — Grounding observability (design only; not implemented)

**Already in HTTP chat payload (when server returns JSON):** `answer`, `sources[]` (may include `sourceDoc`, optional `content`), `retrieval` (route, scores, chunk count), `ragTrace` (mode, router, gate, LLM flags) — see `src/rag/pipeline/run-pipeline.js` return shape and `extractEvidenceFromPayload` in the eval runner.

**Already in eval report today:** `answerPreview` (320 chars), `evidenceUsed.sourceDocs` (max 4), `chunkTextCount`, `hasDebugTrace` boolean.

**Not persisted today:** `ragTrace`, `retrieval`, chunk ids, scores, gate reasons, chunk text (often stripped when `IS_PRODUCTION` / no `content` on sources).

**Smallest safe future change (recommended):**

1. In `runEvalWithPayloads`, add `diagnostics` per case: `summarizeRagTrace(payload.ragTrace)` (reuse `src/chat-session-log.js` shape), `retrieval` subset (`route`, `topScore`, `chunks`, `intent`), and per-source `{ sourceDoc, chunkId, page, contentSha256 }` where `contentSha256 = sha256(first 512 chars)` or empty if no content.
2. Optional: one redacted snippet field `contentPreview` (≤120 chars, digits/units only) only when `EVAL_STORE_SNIPPETS=1`.
3. Do **not** store cookies, prompts, or full manual text by default.

This separates “filename in sources” from “chunk body was present for eval” without changing RAG behavior.

---

## 5. Part D — Verification

| Command | Exit code |
|---------|-----------|
| `node scripts/test-sdb1560m-task23-eval-repair.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** |
| `node -e "require('./scripts/test-sdb1560m-eval-runner-counterexamples.js').runCounterexampleTests()"` | **0** |
| `validateSuiteDocument()` on v2 via load in task23 test | **ok** |

**No HTTP** eval runner invoked.

---

## 6. Files touched by Task 23

| Path | Action |
|------|--------|
| `docs/reports/sdb1560m-eval-suite-expanded-v2.json` | **Added** |
| `scripts/sdb1560m-eval-runner-lib.js` | **Modified** (eval only) |
| `scripts/test-sdb1560m-task23-eval-repair.js` | **Added** |
| `docs/reports/sdb1560m-task23-eval-repair-and-rag-diagnosis.md` | **Added** |

**Explicit non-changes:** `.env`, Qdrant/DB, manuals, golden facts, portal/RAG modules, all historical baseline logs, **expanded-v1.json**.

---

## 7. Unresolved uncertainties and proposed next work

1. **New HTTP baseline** on **suite v2** + runner **1.5-task23** — only way to measure post-repair pass rate (Task 23 did not run HTTP).
2. **Seven RAG misses** need product fixes (power line disambiguation, RH range, warmup/time specs, alarm/indicators) — separate task; pipeline stage remains **undetermined** without chunk/trace capture.
3. **Other v1 over-escaped regexes** (e.g. `exp.para.warmup-plain` `3\\\\s*ч`, alarm section ids) may cause false fails — audit in a follow-up suite hygiene task; not bulk-fixed in v2 beyond the four confirmed Task 22 defects.
4. **`isAbstainLike`** vs long hedged answers (`exp.alarm.w-display`) — optional eval refinement once full answers are stored in reports.

---

## 8. Verdict

| Area | Task 23 outcome |
|------|-----------------|
| **Evaluation reliability** | **Improved** — suite **v2**, runner **1.5-task23**, offline tests; four Task 22 eval false failures addressed without weakening facts |
| **Production RAG** | **No changes** |
| **Production quality claims** | **None new** — Task 22 r2 remains the last HTTP evidence (21/32); seven cases remain **product** issues pending a future RAG task and a **new HTTP run** on v2 |
