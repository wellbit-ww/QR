# Task 17 — Direct Mass Query Diagnosis (156 kg vs 260 kg)

**Date:** 2026-10-29  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged; working tree still dirty)

**Status: PARTIALLY FIXED** — code fix and local regressions pass; **production HTTP re-verification blocked** in agent shell (no `EVAL_LOGIN` / `EVAL_PASSWORD`). Operator must restart portal and run eval into a **new** directory after deploy.

---

## 1. Git identity and preservation checks

| Check | Result |
|-------|--------|
| `git rev-parse HEAD` | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Commit / reset / clean / stash | **Not performed** |
| Task 9 / 15 / 16 baseline dirs | **Not modified** |
| `.env` | **Not read** |
| Eval suite | **Not modified** |
| Chat gate | **Not modified** (Task 16 shows gate OK) |
| Query-specific hardcoded answer for direct mass | **Not added** |

---

## 2. Authoritative artifacts (Phase A)

| Artifact | Role |
|----------|------|
| `docs/reports/sdb1560m-task16-restart-verification.md` | Post-restart HTTP; direct mass **156 kg** vs colloquial **260 kg** |
| `logs/baseline-task16/http-mass-20261029/manifest.json` | `capturedAt` 2026-10-29T07:47:16Z, runner **1.3-task13**, partition `verified` |
| `logs/baseline-task16/http-mass-20261029/report.json` | Full case rows (below) |
| `knowledge/sdb1560m/golden-facts-sdb1560m.md` | **Масса \| 260 кг \| Таблица 1.1** |
| `docs/reports/sdb1560m-eval-suite-draft-v1.json` | `num.mass.verified`, `para.mass-colloquial.verified` unchanged |

### `num.mass.verified` (Task 16 HTTP)

| Field | Value |
|-------|--------|
| Query | `Какой вес шкафа SDB1560M?` |
| answerPreview | `Вес шкафа SDB1560M составляет 156 кг.` |
| overall | fail / factual — missing **260** |
| retrieval (weak) | pass — `golden-facts-sdb1560m.md`, `Руководство SDB1560NM.pdf` in source list |
| chunkTextCount | **0** (no chunk bodies in artifact) |
| forbiddenLeakage | pass (no SDB1106 **180** kg leak) |

### `para.mass-colloquial.verified` (same run)

| Field | Value |
|-------|--------|
| answerPreview | `Масса Шкафа SDB1560М составляет 260 кг. Так что вдвоём будет сложно…` |
| overall | **pass** |
| Same source doc names | golden + PDF |

**Repo search:** `156 кг` appears only in Task 16 report/artifact and Task 17 tests — **not** in golden facts, direct-facts, or manual excerpts in-repo. **156** in the wrong answer aligns with **SDB1560** model-token anchoring, not a second authoritative mass row.

---

## 3. Root cause (evidence-based)

Production path for SDB1560M uses **honest RAG** + **RAG PURE** (`RAG_HONEST_EQUIPMENT` + `RAG_PURE` — fingerprint redacted in manifest as `unknown`, consistent with prior operator runs).

1. **Chat gate (Task 12):** Direct mass is **IN_SCOPE** — confirmed Task 16.
2. **Deterministic FAQ mass (`tryDeterministicSdb1560mAnswer`):** Disabled for honest pilot; only whitelisted safety/contact paths run (`honest-rag-deterministic.js`).
3. **Contextual extract (`tryHonestContextualNumericFact`):** Implemented for mass but **skipped in pipeline when `ragPure`** (`run-pipeline.js` — honest extract guarded by `!ragPure`).
4. **Initial LLM answer:** For the direct query, model emitted **156 kg** (model number **1560** → **156**), while colloquial phrasing (“тяжёлый / вдвоём”) more often yields **260 kg** (same source list in Task 16).
5. **RAG PURE retry gap:** `ragPureSdb1560AnswerOffTopic` had **no mass/weight rule**. Wrong kg answers were **not** treated as off-topic, so:
   - `answerPassesGroundingContract` could accept a plausible-looking **156 кг** sentence when validation did not contradict it.
   - Grounding contract LLM reground passes could fail; **`applied: false`** left the **first wrong LLM answer** in place.
6. **Colloquial vs direct:** Same retrieval source **names**; difference is **generation + post-check heuristics**, not gate or missing PDF in source list. `ragPureSdb1560AnswerLooksOnTopic` already required **260** in the answer for mass-like messages — colloquial **260** passes; direct **156** fails `looksOnTopic` and **should** trigger `needsFactRetry`, but without mass **offTopic** / grounding fallback the wrong answer could still ship when reground did not improve.

**Conclusion:** Failure mechanism = **LLM model-number hallucination** + **incomplete RAG PURE mass validation/recovery**, not chat gate, not missing **260** in authoritative docs.

---

## 4. Direct vs colloquial path comparison

| Aspect | Direct (`num.mass.verified`) | Colloquial (`para.mass-colloquial.verified`) |
|--------|------------------------------|-----------------------------------------------|
| Pre-gate | IN_SCOPE (scoped equipment chat) | IN_SCOPE |
| Honest / RAG PURE | Yes (production pilot) | Same |
| Deterministic mass FAQ | Skipped | Skipped |
| Pipeline contextual extract | Skipped (`ragPure`) | Skipped |
| Task 16 sourceDocs | golden + PDF | golden + PDF |
| Task 16 answer | **156 kg** | **260 kg** |
| `looksOnTopic` (mass heuristics) | Fails (no 260 in answer) | Passes (260 present) |

Golden facts and table 1.1 cite **260 kg** only. **156 kg** is not documented as cabinet mass.

---

## 5. Minimal fix (Phase C)

### Rationale

Address the **general** failure mode: reject unsupported mass numbers in RAG PURE checks and **recover from retrieved context** via existing table parse (same path as other numeric facts), without a query-specific string match or hardcoded reply for one question.

### Files changed

| File | Change |
|------|--------|
| `src/rag/honest-rag-mode.js` | `ragPureSdb1560AnswerOffTopic`: mass/weight questions with **≠260** kg in answer, and explicit **156 кг** with **SDB1560** in Q/A, mark off-topic → triggers fact retry / reground |
| `src/rag/synthesis/sdb1560-grounding-contract.js` | After failed LLM reground passes, **`tryHonestContextualNumericFact`** from same retrieval context (parse **260** from PDF/golden table text) when grounding contract passes |
| `scripts/test-sdb1560m-profile.js` | Early regressions (mass gate, offTopic, extract, deterministic paraphrase) |
| `scripts/test-sdb1560m-task17-mass-mismatch.js` | Focused Task 17 script (runs clean independent of profile RH% failure) |

**Not changed:** chat gate, eval suite, eval checker, index/DB, `.env`.

---

## 6. Tests run and exit codes

| Command | Exit |
|---------|------|
| `node scripts/test-sdb1560m-task17-mass-mismatch.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **0** |
| `node scripts/test-sdb1560m-profile.js` | **1** (pre-existing: line ~190 RH% `RH%п + 1 RH%` vs humidity-after-loading answer — unchanged from Tasks 12–16) |

Regression coverage includes:

- Direct mass + paraphrase deterministic **260 kg** (non-honest path)
- RAG PURE offTopic / needsFactRetry / grounding contract reject **156 kg**
- Contextual extract **260 kg** from synthetic PDF/golden context
- Colloquial mass offTopic negative
- Off-topic `Сколько стоит токарный станок 1560?` remains **OFF_TOPIC**

---

## 7. Before / after behavior (expected)

| Query | Task 16 HTTP (before fix) | Expected after portal reload |
|-------|---------------------------|------------------------------|
| `Какой вес шкафа SDB1560M?` | 156 kg | **260 kg** from context extract or reground with mass offTopic |
| Colloquial mass | 260 kg | **260 kg** (unchanged) |
| Unrelated `1560` (lathe) | OFF_TOPIC | OFF_TOPIC |

---

## 8. HTTP verification

| Item | Status |
|------|--------|
| Agent HTTP eval | **Not run** — no eval credentials in agent environment |
| Operator command (new artifact dir) | From repo root, same shell as creds: |

```powershell
$env:EVAL_LOGIN = "<login>"
$env:EVAL_PASSWORD = "<password>"
node scripts/run-sdb1560m-eval-v1.js --mode=http --allowHttp --partition=verified --outDir=logs/baseline-task17/http-mass-20261029
```

Restart Node portal process after pulling code so `honest-rag-mode.js` and `sdb1560-grounding-contract.js` load.

**Acceptance:** Manual review of `answerPreview` for `num.mass.verified` must show **260** with **kg**, not eval pass alone.

---

## 9. Remaining risks and next step

| Risk | Mitigation |
|------|------------|
| LLM reground still returns 156 before extract fallback | Contextual extract runs last in grounding contract when corpus contains **260** |
| Extract corpus missing table row (retrieval failure) | Should abstain or fail validation — no invented **260** without context |
| Profile RH% test noise | Track separately; does not block Task 17 regressions |

**Recommended next step:** Operator restart + HTTP eval to `logs/baseline-task17/…`; if direct mass still wrong, capture `ragTrace` / chunk text for one request (read-only) to verify grounding pass `contextual_extract`.

---

## Status

**PARTIALLY FIXED** — root cause addressed in code; **FIXED** on production only after restart and successful HTTP artifact confirming **260 kg** for `num.mass.verified`.
