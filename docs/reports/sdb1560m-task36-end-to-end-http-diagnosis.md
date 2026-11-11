# Task 36 — SDB1560NM End-to-End HTTP RAG Diagnosis & Grounded Answer Recovery

**Branch:** `backup/sova-portal`  
**HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged)  
**Eval runner:** `1.7-task33`  
**Task 35 baseline:** Task 27 **32/32** (`task27-regression-http-v11`); Task 28 **58/110**, must_abstain **11/17**, leakage **0/20** (`task28-generalization-http-v12`)  
**Task 36 HTTP (authoritative):** Task 27 **32/32** (`task27-regression-http-v13`); Task 28 **60/110** (`task28-generalization-http-v14`), must_abstain **11/17**, factual **49/89**, leakage **0/20**  
**Commit:** none

## A. Executive summary

**Investigated:** Full HTTP lifecycle for Priority A (voltage/frequency), plus Task 35 trace inventory for Priority B/C/D (30 cases) from `task28-generalization-http-v12`.

**Confirmed (Priority A):** Post-gate rejected mains answers when extract included **±10 % / ±0,4 Гц** not grounded in PDF validation context, and combined 220+50 answers hit **`parameter_leakage`** on single-field questions.

**Fixed:** `extractMainsPowerAnswer()` — nominal **220 В** / **50 Гц**; query-aware single-field wording.

**HTTP verified (v14, after portal restart):** `gen.num.voltage` and `gen.num.freq` **pass**; trace `extractPreview`: `**220 В**` / `**50 Гц**`. Task 28 **60/110** (+2 vs Task 35), factual **49/89** (+2). Task 27 **32/32**, volume abstentions **pass**, leakage **0**.

**Not fixed in Task 36:** Priority B **10/10**, C **12/12**, D must_abstain **6/6** still fail at baseline levels.

---

## B. Baseline and metrics

| Metric | Task 35 (v11/v12) | Task 36 HTTP (v13/**v14**) | Δ |
|---|---:|---:|---|
| Task 27 | **32/32** | **32/32** | 0 |
| Task 28 pass | **58/110** | **60/110** | **+2** |
| must_abstain | **11/17** | **11/17** | 0 |
| Factual (heuristic) | **47/89** | **49/89** | **+2** |
| Leakage | **0/20** | **0/20** | 0 |
| Infra errors | **0** | **0** | 0 |

**New passes vs Task 35 v12 (only):** `gen.num.voltage`, `gen.num.freq`.

**Key cases (Task 36 v14):**

| Case | Task 35 v12 | Task 36 v14 |
|---|---|---|
| `gen.unsup.internal-volume-liters` | pass | pass |
| `gen.unsup.full-volume-liters` | pass | pass |
| `gen.num.mass.base` | pass | pass |
| `gen.num.voltage` | fail | **pass** |
| `gen.num.freq` | fail | **pass** |

Earlier run `task28-generalization-http-v1` (58/110) used **stale portal code** (trace still showed ± tolerances); **v14** is the authoritative Task 36 Task 28 result.

---

## C. Priority A — voltage / frequency (confirmed)

### Symptoms (Task 35 v12)

| Case | Answer | extractKind | Trace |
|---|---|---|---|
| `gen.num.voltage` | «…параметр **не указан**» | `mains_power` | `contextualExtract.rejectReason: should_not_replace`; `extractPreview` had ± tolerances |
| `gen.num.freq` | same | `mains_power` | same pattern |

Retrieved PDF evidence (full chunk, rank ~6 in diagnostics):  
`2.2.1.3 … напряжением **220 В**, частотой **50 Гц**`.

### Lifecycle (measured)

1. **Retrieval:** OK — PDF chunk with 220 V / 50 Hz in prompt.
2. **LLM:** Often abstain-like / unsupported wording.
3. **Grounding contract:** `tryHonestContextualNumericFact` builds extract; `answerPassesGroundingContract` can accept via **on-topic heuristic** even when strict validation fails.
4. **Post-gate:** `validateSdb1560mAnswerAgainstContext` **fails** on extract with ±10 % / ±0,4 Гц (`grounding_numeric_fail`: «10 %», «0.4 гц» not in PDF line).
5. **Outcome:** `resolveAbstainAnswer` → `MODEL_PARAM_NOT_SPECIFIED` (eval: factual fail, abstain-like).

Secondary failure mode (after nominal combined answer): **`parameter_leakage`** — voltage question must not include «50 Гц» in the same answer (and vice versa).

### Fix (implemented) — **verified on HTTP v14**

File: `src/rag/honest-contextual-extract.js` — see trace `extractPreview` **220 В** / **50 Гц** without ± on `gen.num.voltage` / `gen.num.freq`.

---

## D. Priority B — contextual extract (10 cases)

All **fail** at Task 35 baseline. Classifications in `logs/baseline-task36/task36-case-analysis.json` (mostly `EXTRACT_SELECTION_FAILURE`, `EXTRACT_ROUTING_FAILURE`, or `INSUFFICIENT_TRACE` from report metadata). **No production code changes** — requires per-case full-chunk review before fixing.

---

## E. Priority C — retrieval-first (12 cases)

All **fail** at Task 35 baseline. Snippet-only Task 34 labels treated as **provisional**. Full chunk text is present in v12 `diagnosticsByCaseId.*.sources` for offline review; no retrieval/index changes in Task 36.

---

## F. Priority D — must_abstain (6 cases)

All **fail** abstention at Task 35 baseline (`gen.unsup.bluetooth`, `gen.unsup.sdb151-mass-for-1560`, `gen.unsup.warehouse-humidity-setpoint`, `gen.insuf.n2-without-option`, `gen.unsup.blockchain`, `gen.unsup.serial-format`). Need answer-shape vs evaluator pattern review; **no abstention policy weakening** in Task 36.

---

## G. Pipeline diagnosis (measured vs hypothesis)

| Stage | Finding | Evidence |
|---|---|---|
| Query / intent | Voltage/freq correctly → `mains_power`, `focusParameter` voltage | v12 `ragTrace.router` |
| Retrieval | PDF 2.2.1.3 present | diagnostics sources snippet |
| Context assembly | Golden + PDF in prompt | sourceDocs list |
| Extract | Extract **generated** | `extractPreview` in trace |
| Extract selection | Deferred pass `should_not_replace` | trace |
| LLM | Contributes abstain-like text | answerPreview before reground |
| **Post-processing** | **Validation → MODEL_PARAM** | **confirmed in code + trace** |
| Abstention policy | Correct for true unsupported; **false positive here** | Priority A |

---

## H. Trace / observability

Existing eval HTTP capture (`hasDebugTrace`, `diagnosticsByCaseId`, `ragTrace.llm.contextualExtract`, fused/prompt chunk summaries) was **sufficient for Priority A root cause**. Full chunk bodies are in report JSON (not only 200-char snippets in diagnostics). No new user-facing trace fields added.

---

## I. Regression (unit)

| Script | Result |
|---|---|
| `scripts/test-sdb1560m-task36-mains-power-post-gate.js` | OK |
| `scripts/test-sdb1560m-task35-hallucination-grounding.js` | OK (volume P0 preserved) |
| `scripts/test-sdb1560m-task32-grounding.js` | OK |
| `scripts/test-sdb1560m-task31-regression.js` | OK |
| `scripts/test-sdb1560m-task27-extract-routing.js` | OK |
| `scripts/test-sdb1560m-task33-unsupported-firmware.js` | OK |
| `scripts/test-sdb1560m-eval-runner-unit.js` | OK |

---

## J. Operator HTTP

| Run | Path | Result |
|---|---|---|
| Task 27 | `logs/baseline-task36/task27-regression-http-v13/` | **32/32**, infra **0** (2026-11-03) |
| Task 28 | `logs/baseline-task36/task28-generalization-http-v14/` | **60/46/4**, infra **0** (2026-11-03T10:39Z) |

Superseded: `task28-generalization-http-v1` (58/110, stale server — do not use for Task 36 sign-off).

---

## K. Remaining work (ranked)

| Priority | Issue | Impact | Confidence | Effort |
|---|---|---|---|---|
| ~~P1~~ | ~~Verify voltage/freq on HTTP after fix~~ | **Done (v14)** | — | — |
| P1 | Priority B extract failures (10) | Generalization | Medium | Medium–high |
| P2 | Priority C retrieval vs generation (12) | Generalization | Low–medium (snippet bias) | Medium |
| P2 | Priority D abstention wording (6) | must_abstain | Medium | Medium |

---

## L. Git safety

- **Pre:** `logs/baseline-task36/pre-task36-status.txt`
- **Post:** `logs/baseline-task36/post-task36-status.txt`
- **Changed by Task 36:** `src/rag/honest-contextual-extract.js`, `scripts/test-sdb1560m-task35-hallucination-grounding.js`, `scripts/test-sdb1560m-task36-mains-power-post-gate.js`, `scripts/build-task36-case-analysis.js`, docs/logs under `baseline-task36/`
- **Dirty tree preserved;** no commit.

---

## Artifacts

| Path |
|------|
| `docs/reports/sdb1560m-task36-end-to-end-http-diagnosis.md` (this file) |
| `logs/baseline-task36/task36-case-analysis.json` |
| `logs/baseline-task36/task36-regression-comparison.json` |
| `logs/baseline-task36/pre-task36-status.txt` |
| `logs/baseline-task36/post-task36-status.txt` |
