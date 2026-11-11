# Task 26 — SDB1560NM Alarm / Troubleshooting RAG Improvement

**Date:** 2026-11-02  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged)  
**Status:** **HTTP verified** — alarm goal **met (3/3 pass)**; suite **28/32 (87.5%)**, **−1 vs Task 25 r2** due to **four regressions**.

**Authoritative Task 26 HTTP:** `logs/baseline-task26/http-verified-20261102-v2/` · **2026-11-02T06:05:05Z** · infra **0**.

**Reference:** Task 25 r2 — `logs/baseline-task25/http-verified-20261102-v2-r2/` — **29/32**. **Evaluator / suite:** v2 + `1.5-task23` (unchanged).

---

## 1. Initial branch, HEAD, working tree

| Check | Value |
|-------|--------|
| Branch | `backup/sova-portal` |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Tree | **dirty** (pre-existing user changes preserved) |

Pre-task snapshot: `logs/task26-pre-status-snapshot.txt` (first lines of `git status -sb`). No `git reset`, `clean`, `stash`, or commit performed.

---

## 2. Root cause per failing case (Task 25 r2 HTTP)

| Case ID | Symptom on HTTP | Primary cause (confirmed in code review) |
|---------|-----------------|------------------------------------------|
| `exp.alarm.red-lamp` | Abstain-like («в предоставленном контексте нет…») | **RAG_PURE** skipped pipeline `tryHonestContextualNumericFact` (`!ragPure` guard). Reground ran, but **extract** needed tighter corpus (retrieval **cards** not merged) and **red-lamp** off-topic rule missed queries without «авария/норма». |
| `exp.alarm.rh-rise-loading` | Generic «Да, нормально» without §/ventilator | **`shouldRegroundSdb1560Answer`** returned **false** when validation passed, **before** off-topic was evaluated. **`ragPureSdb1560AnswerOffTopic`** did not flag «загрузка + выросла» without procedure keywords unless answer also mentioned seal/fault heuristics. |
| `exp.alarm.w-display` | Hedge without **подогрев** | Reground triggered, but **W extract** matched loose «W + подогрев» in power TTX context; hedge answers not always **`isSpuriousModelAbstainAnswer`**. Extract needed **display-scoped** W rules + **yellow-and-w** card in corpus. |

**Offline vs HTTP (Task 25):** Task 25 tests injected **synthetic one-line corpus** (incl. § anchors). HTTP uses **RAG_PURE** + chunked context without guaranteed card bodies → extract returned **null** while LLM answer stood.

**Not primary cause (this task):** missing PDF in index — sources listed `Руководство SDB1560NM.pdf` on fails; problem was **post-LLM replacement**, not empty retrieval list alone.

---

## 3. Pipeline evidence (mechanism)

1. **Query → kind:** `resolveExtractKind` maps all three eval messages to `indicator_drying`, `load_humidity`, `w_symbol` (incl. red-lamp via `isSdb1560mRedLightQuery` + «мига»).
2. **RAG_PURE path:** `run-pipeline.js` applied contextual extract only when `shouldUseHonestRag && !ragPure` — **disabled for production SDB1560 honest+PURE** (Task 25 numeric fixes relied on reground + restart; alarms still missed).
3. **Grounding contract:** `applySdb1560GroundingContract` skipped reground when `validateSdb1560mAnswerAgainstContext` was **ok** even if answer lacked procedure/indicator facts; off-topic checked **after** validation ok.
4. **Extract:** `extractBlinkingRedAnswer` / `extractWSymbolAnswer` patterns too strict for **retrieval-card** wording; corpus builder did not append `knowledge/sdb1560m/retrieval-cards/*.md`.

---

## 4. Manual excerpts (expected behaviour)

**п. 1.1.4.3.2 — символ W** (audit PDF page 15):

> е) символ W - подключена Система подогрева воздуха.

**п. 1.1.4.3.3 — красный индикатор** (audit PDF page 15):

> б) зеленый световой сигнал и мигающий красный - Шкаф находится в режиме осушения (далее по тексту - режим «Осушения»);

**п. 1.1.4.4.1 — загрузка / дверь / вентилятор** (retrieval card `door-close-dry.md`, sourced to §1.1.4.4.1):

> При **открытой двери** вентилятор осушителя **отключается** … При **закрытии двери** вентилятор **включается**, отсчёт … **60 ± 1 мин** … заново.

---

## 5. Production RAG files changed (Task 26)

| File | Role |
|------|------|
| `src/rag/honest-contextual-extract.js` | Merge retrieval cards into extract corpus; stronger alarm extractors; W vs power disambiguation |
| `src/rag/honest-rag-mode.js` | Red-lamp / load-humidity off-topic; hedge abstain patterns |
| `src/rag/synthesis/sdb1560-grounding-contract.js` | Reground when off-topic/spurious **before** validation ok; early contextual extract pass |
| `src/rag/pipeline/run-pipeline.js` | Contextual extract for **RAG_PURE** (remove `!ragPure` guard) |
| `scripts/test-sdb1560m-task26-alarm-rag.js` | New regression |

**Not changed:** suite JSON, eval runner, golden facts, Qdrant, `.env`, Task 25 baseline dir.

---

## 6. Change rationale (summary)

- **Cards in corpus:** Same mechanism as retrieval — inject `red-lamp.md`, `yellow-and-w.md`, `door-close-dry.md` when extract kind is alarm-related (not case-ID hardcoding).
- **RAG_PURE extract:** Ensures reground/fallback applies on live portal path, not only non-PURE.
- **Grounding contract:** Treat incomplete alarm answers as reground candidates; try **contextual extract first** to avoid another hedging LLM pass.
- **Off-topic / spurious:** Align with eval checker expectations (§1.1.4.4.1, **Осушение**, **подогрев**) without weakening guardrails globally.

---

## 7. Offline regression tests

| Command | Result |
|---------|--------|
| `node scripts/test-sdb1560m-task26-alarm-rag.js` | **pass** |
| `node scripts/test-sdb1560m-task25-rag-control.js` | **pass** |
| `node scripts/test-sdb1560m-task23-eval-repair.js` | **pass** |
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **pass** |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **pass** (exit 0) |

---

## 8. HTTP verification (operator run)

**Artifact:** `logs/baseline-task26/http-verified-20261102-v2/`  
**Captured (UTC):** `2026-11-02T06:05:05.998Z` · `authMode: eval_login` · infra **0**

| Metric | Task 26 | Task 25 r2 | Task 24 r2 |
|--------|--------:|-----------:|-----------:|
| Pass / fail | **28 / 32** | **29 / 32** | **25 / 32** |
| Factual accuracy | **87.5%** | **90.6%** | **78.1%** |
| Leakage (leak partition) | **1/7** | **0/7** | — |

### 8.1 Target alarm cases (Task 26 goal)

| Case ID | Task 25 r2 | Task 26 | Answer (preview) |
|---------|------------|---------|------------------|
| `exp.alarm.red-lamp` | fail | **pass** | «Осушения» + п. **1.1.4.3.3** (contextual extract) |
| `exp.alarm.rh-rise-loading` | fail | **pass** | п. **1.1.4.4.1**, вентилятор, **60 ± 1 мин** |
| `exp.alarm.w-display` | fail | **pass** | **подогрев**, п. **1.1.4.3.2**, не ошибка |

**Alarm troubleshooting goal: confirmed on HTTP (3/3).**

### 8.2 Task 25 seven-control cases (non-alarm four)

| Case ID | Task 25 r2 | Task 26 |
|---------|------------|---------|
| `exp.num.pwr-storage-8` | pass | **pass** |
| `exp.num.rh-range` | pass | **pass** |
| `exp.para.warmup-plain` | pass | **pass** |
| `exp.env.temp-range` | pass | **pass** |

No regression on the four numeric/env controls fixed in Task 25.

### 8.3 New HTTP failures vs Task 25 r2 (regressions)

| Case ID | Task 25 r2 | Task 26 | Likely mechanism (HTTP evidence) |
|---------|------------|---------|----------------------------------|
| `exp.num.rh-step` | pass | **fail** | Answer: «параметр не указан» (abstain-like) — **no** `0,1` step extract / reground |
| `exp.multi.mass-and-width` | pass | **fail** | Answer: **габариты only** (1202…), **missing 260 kg** — partial **dimensions** extract |
| `exp.env.rh-ambient-max` | pass | **fail** | Answer: **+15…+35 °C** (ambient **temp** extract) instead of **80 %RH** max ambient |
| `exp.num.pwr-storage-with-opt-810` | pass | **fail** | Answer: **8 Вт** + forbidden **8** hit — **base storage** extract misfired on «с азотом и подогревом» query |

These four cases were **not** failing in Task 25 r2; enabling **FORCE** contextual extract on **RAG_PURE** likely caused cross-kind substitution (temp vs RH; 8 W vs 810 W; dimensions-only).

---

## 9. Comparison Task 24 / 25 / 26

| Run | Pass | Three alarm IDs | Net vs prior |
|-----|-----:|-----------------|--------------|
| Task 24 r2 | 25/32 | 0/3 | — |
| Task 25 r2 | 29/32 | 0/3 | +4 (Task 25 RAG) |
| Task 26 HTTP | **28/32** | **3/3** | **+3 alarms, −4 other** vs Task 25 |

---

## 10. Regression check

| Area | Result |
|------|--------|
| Offline Task 25/26 tests | **Pass** (did not catch cross-query extract collisions) |
| Task 25 four controls on HTTP | **Pass (4/4)** |
| Full suite vs Task 25 r2 | **4 regressions** (see §8.3) |
| Leakage | **1 fail** on `exp.num.pwr-storage-with-opt-810` (forbidden **8** in answer) |

**Follow-up (not Task 27 scope here):** tighten `resolveExtractKind` / extract guards so **810 W + options**, **RH ambient max**, **RH step**, and **multi-fact mass+width** are not overwritten by alarm or narrow numeric extractors.

---

## 11. Limitations

- Task 26 **did not** reach **32/32**; overall score **dropped 1** vs Task 25 r2 despite alarm fix.
- Regressions are **production RAG** side effects, not evaluator changes.
- Eval `chunkTextCount: 0` unchanged.

---

## 12. Files touched (Task 26 only)

- `src/rag/honest-contextual-extract.js`
- `src/rag/honest-rag-mode.js`
- `src/rag/synthesis/sdb1560-grounding-contract.js`
- `src/rag/pipeline/run-pipeline.js`
- `scripts/test-sdb1560m-task26-alarm-rag.js`
- `docs/reports/sdb1560m-task26-alarm-rag-improvement.md`
- `logs/task26-pre-status-snapshot.txt`

---

## 13. Working tree preservation

Pre-existing modified/untracked files from `git status` at task start remain; Task 26 adds/edits only the files in §12. No destructive git operations.

---

## Verdict

| Criterion | Status |
|-----------|--------|
| Three alarm cases on HTTP | **Pass (3/3)** — goal of Task 26 |
| Production RAG changed | **Yes** |
| Offline tests | **Pass** |
| HTTP verified | **Yes** — `logs/baseline-task26/http-verified-20261102-v2/` |
| Overall pass vs Task 25 r2 | **28/32 vs 29/32 (−1)** |
| Regressions | **4 cases** (§8.3) |
| Task 25 baseline preserved | **Yes** |

**Summary:** Alarm/troubleshooting RAG fix **confirmed**. Suite-wide quality **not** improved vs Task 25; next work should **preserve 3/3 alarms** while fixing extract **kind guards** for the four regressions. **Task 27 not started.**
