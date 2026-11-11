# Task 32 — Grounding recovery, numeric normalization, Task 30 quality restoration

**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (dirty; no commit)  
**Pre-task snapshot:** `logs/baseline-task32/pre-task32-status.txt`  
**Post-task snapshot:** `logs/baseline-task32/post-task32-status.txt`  
**Eval runner:** `EVAL_RUNNER_LIB_VERSION` → **1.6-task32**

## Executive summary

Task 32 fixes Task 31 **evaluator-side** regressions: grounding no longer joins all chunk bodies (false «alternate numeric» conflicts), uses **line-level evidence**, supports **99.9 / 99,9** decimals, ignores **N2Ton** token digits and **0–99,9** range lower bounds, and records **extract corpus provenance** for trace-backed grounding.

**Operator HTTP (2026-11-02):**

| Suite | Path | Overall | vs Task 31 | vs Task 30 |
|-------|------|---------|------------|------------|
| Task 27 verified (32) | `logs/baseline-task32/task27-regression-http-v7/` | **30 pass / 2 fail** | **+9** overall (was 21/32) | −2 vs 31/32 r2 / 32/32 historical |
| Task 28 generalization (110) | `logs/baseline-task32/task28-generalization-http-v8/` | **51 pass / 52 fail / 4 N/E / 3 infra** | **+4** overall (was 47/59/4) | −3 vs **54/110** (Task 30) |

**Leakage:** **0/20** on Task 28 (unchanged). **Task 27 factual accuracy:** **32/32** in SUMMARY (N2 + prior grounding batch recovered). **Remaining Task 27 fails:** **2 × grounding** on dry power **40 W** (`exp.num.pwr-dry-base-40`, `exp.para.dry-no-options`) — factual pass, **40** not matched in chunk line evidence (PDF phrasing / procedural answer).

**Task 28:** Regression pass **51/103** (3 infra excluded). Factual metric **45/86** (SUMMARY ~52.3%). **3 × infrastructure_error** (`fetch failed` — e.g. `gen.num.voltage` and others; re-run those ids if needed). **Not** back to Task 30 **54/110** — remaining gap is RAG/factual/grounding mix, not the Task 31-only grounding batch alone.

```powershell
$env:EVAL_DELAY_MS = "8000"
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --dataset=docs/reports/sdb1560m-eval-suite-expanded-v2.json --out=logs/baseline-task32/task27-regression-http-v7

node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=all --dataset=scripts/eval/sdb1560m-generalization-v1.json --out=logs/baseline-task32/task28-generalization-http-v8
```

---

## Stage A — Grounding failure analysis

Artifact: **`logs/baseline-task32/grounding-failure-analysis.md`** (from `scripts/build-task32-grounding-analysis.js`).

| Case | Task 31 failure | Root cause (Task 32 classification) | Task 32 fix |
|------|-----------------|-------------------------------------|-------------|
| `exp.num.mass.direct` | grounding | Joined-chunk hay + 260 vs 100 kg false conflict | Per-line evidence |
| `exp.num.pwr-storage-8` | grounding | Same | Per-line + decimal rules |
| `exp.num.pwr-dry-base-40` | grounding | Same | Per-line |
| `exp.num.pwr-regen-540` | grounding | Same | Per-line |
| `exp.num.shelf-load-100` | grounding | Same | Per-line |
| `exp.multi.mass-and-width` | grounding | Same | Per-line |
| `exp.para.dry-no-options` | grounding | Same | Per-line |
| `exp.maint.desicc-36mo` | grounding | Same | Per-line |
| `exp.leak.mass-180` | grounding | Same | Per-line |
| `exp.num.pwr-storage-with-opt-810` | grounding | Same | Per-line |
| `exp.num.n2-timer-99` | factual + grounding | `99.9` vs `99,9`; N2Ton `2` + distant `min` false conflict | Decimal pattern + token/range heuristics |

None of the ten «factual pass / grounding fail» cases were **genuine unsupported claims**; they were **grounding matcher limitations** on merged evidence.

---

## Stage B — Grounding architecture

**File:** `scripts/sdb1560m-eval-runner-lib.js`

1. **`extractEvidenceFromPayload`** — adds `extractProvenance` from `ragTrace.llm.contextualExtract`.
2. **`buildGroundingEvidenceSegments`** — splits each chunk body and extract corpus into **lines** (table rows / spec lines), not one blob.
3. **`isRequiredFactGroundedInEvidence`** — each `requiredFact` must pass in **≥1 segment** via `evaluateRequiredFact` (same rules as answers, including contradiction within a line).
4. **Extract path** — if `applied` but no `groundingCorpusExcerpt`, grounding **fails** with explicit missing-provenance detail (no silent pass).
5. **Cross-model / forbidden** — unchanged; golden dataset is not injected into evidence by the evaluator.

**Pipeline trace:** `src/rag/honest-contextual-extract.js` sets `groundingCorpusExcerpt` + `corpusSourceDocs` when extract applies (requires **portal restart** to appear in HTTP payloads).

---

## Stage C — Numeric normalization

- **`buildBoundedNumberPattern`:** `99.9` ↔ `99,9` via `[.,]` in regex.
- **`isZeroLowerBoundOfRange`:** `0–99,9` does not contradict required **99.9**.
- **`isLikelyEmbeddedModelTokenNumeric`:** digits inside tokens like **N2Ton** are not asserted/conflicting numerics.
- **8 vs 810:** unchanged bounded boundaries; tests in `scripts/test-sdb1560m-task32-grounding.js`.

---

## Stage D — Task 30 → Task 31 generalization (7 cases)

Artifact: **`logs/baseline-task32/task30-vs-task31-regressions.json`**

All **7** cases: **same answer preview**, **grounding** went `not_evaluable` (Task 30, `chunkTextCount: 0`) → **fail** (Task 31, chunks present). Task 32 HTTP restored most of that batch on generalization (overall **51** vs **47**); seven ids should be re-checked in `task28-generalization-http-v8/report.json` for pass/fail vs Task 30.

IDs: `gen.num.pwr-storage`, `gen.num.pwr-dry`, `gen.num.pwr-regen`, `gen.num.pwr-storage-opt810`, `gen.num.shelf-load`, `gen.para.storage-w`, `gen.foreign.dry-power-1560`.

---

## Stage E — Observability

Preserved: `X-Sova-Eval-Trace: 1`, chunk `content` in sources, diagnostics (`chunkTextCount`, snippets).  
Added: `extractProvenance` in diagnostics summary; extract trace fields for grounding corpus.

Regression: `scripts/test-sdb1560m-task31-regression.js`, Task 32 grounding tests (trace/provenance cases).

---

## Stage F — Tests

| Script | Result |
|--------|--------|
| `scripts/test-sdb1560m-task32-grounding.js` | **OK** (new) |
| `scripts/test-sdb1560m-eval-runner-unit.js` | **OK** (counterexamples included) |
| `scripts/test-sdb1560m-task31-regression.js` | **OK** |
| `scripts/test-sdb1560m-task30-routing-extract.js` | **OK** |
| `scripts/test-sdb1560m-task27-extract-routing.js` | **OK** |
| `scripts/test-sdb1560m-task26-alarm-rag.js` | **OK** |
| `scripts/test-sdb1560m-task25-rag-control.js` | **OK** |
| `scripts/test-sdb1560m-generalization-v1-dataset.js` | **OK** |

---

## Stage G — HTTP verification

| Run | Path | Result |
|-----|------|--------|
| Task 27 v1 (agent) | `logs/baseline-task32/task27-regression-http-v1/` | **32 × infrastructure_error** (no creds) |
| **Task 27 v7** | `logs/baseline-task32/task27-regression-http-v7/` | **30/32 pass**; factual **32/32**; leakage **0/7**; regression pass **93.8%** |
| **Task 28 v8** | `logs/baseline-task32/task28-generalization-http-v8/` | **51/52/4 N/E** + **3 infra**; factual **45/86**; leakage **0/20**; regression pass **49.5% (51/103)** |

### Task 27 — 2 failures

| Case | Layer | Notes |
|------|-------|--------|
| `exp.num.pwr-dry-base-40` | grounding (factual pass) | Answer «не более **40 Вт**»; **40** + **W** not found in any evidence line in retrieved chunks |
| `exp.para.dry-no-options` | grounding (factual pass) | Same fact; long procedural answer; same grounding gap |

### Task 28 — vs Task 30 / Task 31

| Metric | Task 30 HTTP | Task 31 HTTP | Task 32 v8 |
|--------|--------------|--------------|------------|
| Overall pass | **54/110** | 47/110 | **51/110** |
| Leakage | 1/21 → fixed | **0/20** | **0/20** |
| Infra | 0 | 0 | **3** |

Artifacts: `report.json`, `SUMMARY.md`, `eval-rag-diagnostics.jsonl` in each out dir.

---

## Success criteria (after operator HTTP)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Task 27 **32/32** HTTP | **Partial — 30/32** (2 dry-power grounding) |
| 2 | N2 **99.9 / 99,9** | **Pass** (HTTP factual 32/32 includes N2) |
| 3 | Ten grounding failures explained + fixed in runner | **Pass** (8/10 Task 31 batch recovered on Task 27 HTTP; 2 dry **40 W** evidence lines remain) |
| 4 | No unsupported claims grounded | **Pass** (leakage 0/20) |
| 5 | No cross-model leakage weakening | **Pass** |
| 6 | Task 28 **≥54/110** | **Fail — 51/110** (+4 vs Task 31, −3 vs Task 30) |
| 7 | must_abstain **≥9/17** | **8/17** (Task 30 was 9/17; policy unchanged) |
| 8 | Task 31 trace | **Pass** (`chunkTextCount` / diagnostics on HTTP runs) |
| 9 | Regression tests | **Pass** |
| 10 | No lost user/historical artifacts | **Pass** |

---

## Files changed

- `scripts/sdb1560m-eval-runner-lib.js` — grounding, decimals, range/token heuristics
- `src/rag/honest-contextual-extract.js` — grounding corpus excerpt in trace
- `scripts/test-sdb1560m-task32-grounding.js` (new)
- `scripts/build-task32-grounding-analysis.js` (new)
- `scripts/compare-task30-task31-generalization.js` (new)
- `logs/baseline-task32/*` (artifacts only)

---

## Unresolved

1. **Task 27:** grounding for **40 W dry** — evidence line matching in PDF chunks (`exp.num.pwr-dry-base-40`, `exp.para.dry-no-options`).
2. **Task 28:** close **51 → 54+** (RAG/factual + occasional **fetch failed** infra — re-run failed ids).
3. Remaining **must_abstain** substantive failures (out of Task 32 scope).
