# Task 30 — RAG observability, abstention alignment, retrieval/routing fixes

**Branch:** `backup/sova-portal`  
**Git HEAD (start & end):** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (no new commits; working tree still dirty)  
**Pre-task snapshot:** `logs/baseline-task30/pre-task30-status.txt`  
**Post-task snapshot:** `logs/baseline-task30/post-task30-status.txt`

## Executive summary

Task 30 implemented **eval-time RAG observability**, **fixed must_abstain pattern encoding** in the generalization dataset, **reduced golden leakage** on volume questions, and **extended honest contextual extract + routing** for door 60±1 min vs N2 99,9 min, fan +1 RH%, N2 §1.2.2 parameters, and related alarm/procedure cases.

**Operator HTTP (2026-11-02, dirty tree @ `8523954…`, dataset generalization sha256 `53a415bc…`):**

| Suite | Path | Overall | Factual accuracy | Notes |
|-------|------|---------|------------------|--------|
| **Task 28 generalization (110)** | `logs/baseline-task30/task28-generalization-http-v1/` | **54 pass / 52 fail / 4 not_evaluable** (0 infra) | **45/89 (50.6%)** | vs Task 28 v3: **41/66/3**, factual **41/90** |
| **Task 27 verified (32)** | `logs/baseline-task30/task27-regression-http-verified-v2-r2/` | **31/32 pass** | **31/32 (96.9%)** | vs historical **32/32** — fail: `exp.num.n2-timer-99` (missing `99.9`) |

**must_abstain (17):** **9 pass / 8 fail** (Task 28 v3 was **0/17** overall pass on abstain cases — pattern fix + RAG partially effective). **must_answer (93):** **45 pass / 44 fail / 4 N/E** (v3: **41 / 49 / 3**).

**Run conditions:** mid-run **429** on chat limit (~case 69) with retries; `set EVAL_DELAY_MS=8000` in **PowerShell does not set env** (use `$env:EVAL_DELAY_MS="8000"`). **`eval-rag-diagnostics.jsonl`** written (110 lines) with `ragTrace`/`retrieval`, but **`sources[].snippet` empty** and **no `promptChunkSummaries`** — pipeline chunk trace requires **`EVAL_CAPTURE_RAG_TRACE=1` in portal `.env`**, not only in the eval runner process.

Task 30 **improved generalization overall pass (+13)** and **abstain policy matches (+9)** on HTTP, but **does not meet all success criteria**: Task 27 regression **31/32**, **8 abstain** cases still wrong, **1 leakage** hit, chunk-level trace still incomplete on server.

---

## 1. Task 29 findings confirmed

| Finding | Evidence / action in Task 30 |
|--------|------------------------------|
| Eval `report.json` lacked chunk bodies and rich trace | Added `eval-rag-diagnostics.jsonl`, `X-Sova-Eval-Trace`, `EVAL_CAPTURE_RAG_TRACE` chunk summaries |
| ~9/17 abstain fails: portal «не указан» vs broken regex | Fixed `allowedAbstainPatterns` in `scripts/eval/sdb1560m-generalization-v1.json` and builder |
| Over-abstention on answerable PDF facts | New extract kinds + `table-1.1-ttx.md` / existing cards |
| Door 60 min vs N2 99,9 min collision | `isSdb1560mDoorCloseTimerMinutesQuery`, `door_close_timer` extract; N2 timer extract excludes door wording |
| RH / humidity wait vs door timer | `isSdb1560mHumidityWaitQuery` excludes door-close timer queries |
| 1896/2070 L from golden on unsupported volume questions | Golden file/chunks skipped for `inner_volume` / `full_volume` extract corpus |
| Unverified IoT/API abstain cases still need correct *policy* answers | Evaluator patterns fixed; RAG still must not invent Wi‑Fi/MQTT facts (unchanged policy) |

---

## 2. Stage A — RAG observability

### Root cause

- Production chat responses strip source `content` and omit full `ragTrace` unless debug is enabled.
- Eval runner kept only `answerPreview` and thin `evidenceUsed` (no chunk text, no pipeline trace).

### Changes

1. **`server.js`**
   - `shouldExposeDebugChatFields(req)` returns true for header `X-Sova-Eval-Trace: 1` or `EVAL_CAPTURE_RAG_TRACE=1`.
   - `buildChatResponsePayload` accepts `exposeDebug`; eval trace exposes full `sources`, `retrieval`, `ragTrace`.

2. **`scripts/sdb1560m-eval-http-client.js`**
   - `chatRequest(..., { evalTrace: true })` sends the trace header.

3. **`scripts/run-sdb1560m-eval-v1.js`**
   - Sets `EVAL_CAPTURE_RAG_TRACE=1` during HTTP fetch; passes `evalTrace: true`.

4. **`src/rag/pipeline/run-pipeline.js`**
   - When `EVAL_CAPTURE_RAG_TRACE=1`, attaches `fusedChunkSummaries` / `promptChunkSummaries` (snippets ≤220 chars, stable metadata).
   - Records `contextualExtract` debug (kind, apply/reject reason) on `ragTrace.llm`.

5. **`scripts/sdb1560m-eval-runner-lib.js`**
   - `summarizePayloadDiagnostics()` → per-case diagnostics.
   - `writeRunOutput` writes **`eval-rag-diagnostics.jsonl`** beside `report.json`.
   - `evidenceUsed` in report includes `extractKind`, `promptChunkTraceCount`.

### Verification

- **`logs/baseline-task30/task28-generalization-http-v1/eval-rag-diagnostics.jsonl`**: 110 records; `ragTrace.router`, `decision`, `llm`, top-level `retrieval` populated when eval trace header is on.
- **Gap:** `chunkTextCount: 0` and empty `sources[].snippet` in diagnostics — full source bodies still not in HTTP payload for this run; **`promptChunkSummaries` / `fusedChunkSummaries`** absent because **`EVAL_CAPTURE_RAG_TRACE` must be set on the portal process** (runner-only env is insufficient).
- Agent-only runs without creds remain infra-blocked; operator runs above supersede that limitation.

---

## 3. Stage B — abstention evaluator alignment

### Root cause

Dataset patterns were double-escaped in JSON (`не\\\\s+указан`), so after parse the regex matched literal `\s`, not whitespace. Portal template «…этот параметр **не указан**» failed `must_abstain` despite correct policy.

### Changes

- `scripts/build-sdb1560m-generalization-v1.js` — correct `ABSTAIN_PATTERNS` string literals.
- `scripts/eval/sdb1560m-generalization-v1.json` — all 17 `must_abstain` cases updated (dataset sha256 changed; `test-sdb1560m-generalization-v1-dataset.js` still passes).

**Not done:** blanket acceptance of any «не указано» text — only pattern fix + existing forbidden-claim checks.

---

## 4. Stages C–D — over-abstention and routing

### `src/rag/honest-contextual-extract.js`

- New kinds: `door_close_timer`, `fan_restart_1rh`, `door_sound`, `steady_red_door`, `n2_option`.
- Retrieval cards merged per kind (incl. `nitrogen-option.md`, `table-1.1-ttx.md`).
- Volume kinds: no golden chunk merge / no golden file fallback (prevents 1896/2070 leakage).
- `tryHonestContextualNumericFact` optional `traceOut` for eval pipeline.

### `src/rag/sdb1560m-rag-priority.js`

- `isSdb1560mDoorCloseTimerMinutesQuery`, `isSdb1560mN2TechnicalQuery`.
- `isSdb1560mHumidityWaitQuery` excludes door-close timer and N2 timer phrasing.
- Retrieval hint anchors for §1.1.4.4.1 and §1.2.2.

### `knowledge/sdb1560m/retrieval-cards/table-1.1-ttx.md`

- Table 1.1 mass/dimensions (260 kg, 1202×1693×1028 mm, ±5 mm) for extract/RAG hints — sourced from manual table 1.1, not eval golden JSON.

---

## 5. Stage E — unverified facts

- **Volumes 1896/2070:** extract path no longer pulls golden-only corpus for volume kinds; abstain/volume unsupported cases should not get deterministic golden numbers from extract fallback.
- **Direct-facts / LLM:** not weakened; full HTTP check still required for Wi‑Fi, blockchain, serial format, etc.

---

## 6. Stage F — tests

| Script | Result |
|--------|--------|
| `scripts/test-sdb1560m-task30-routing-extract.js` | OK (new) |
| `scripts/test-sdb1560m-eval-runner-unit.js` | OK |
| `scripts/test-sdb1560m-task27-extract-routing.js` | OK |
| `scripts/test-sdb1560m-task26-alarm-rag.js` | OK |
| `scripts/test-sdb1560m-task25-rag-control.js` | OK |
| `scripts/test-sdb1560m-generalization-v1-dataset.js` | OK (110 cases, new dataset hash) |

### HTTP (operator, 2026-11-02)

| Run | Outcome |
|-----|---------|
| Task 27 v2 verified (32) | `logs/baseline-task30/task27-regression-http-verified-v2-r2/` — **31 pass / 1 fail** (`exp.num.n2-timer-99`, factual `99.9`); leakage **0/7** |
| Task 28 generalization (110) | `logs/baseline-task30/task28-generalization-http-v1/` — **54 pass / 52 fail / 4 N/E**; factual **45/89**; leakage **1/21**; **`eval-rag-diagnostics.jsonl`** present |
| Task 28 (agent, no creds) | `task27-regression-http-verified-v2/` — 32 × infra (historical reference only) |

**Recommended re-run flags (PowerShell):**

```powershell
$env:EVAL_DELAY_MS = "8000"
# In portal .env: CHAT_RATE_LIMIT_MAX=500 and EVAL_CAPTURE_RAG_TRACE=1, then restart portal

node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --dataset=docs/reports/sdb1560m-eval-suite-expanded-v2.json --out=logs/baseline-task30/task27-regression-http-verified-v2-r3

node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=all --dataset=scripts/eval/sdb1560m-generalization-v1.json --out=logs/baseline-task30/task28-generalization-http-v1-r2
```

---

## 7. Files touched (Task 30 scope)

| Area | Files |
|------|--------|
| Observability | `server.js`, `src/rag/pipeline/run-pipeline.js`, `scripts/sdb1560m-eval-runner-lib.js`, `scripts/sdb1560m-eval-http-client.js`, `scripts/run-sdb1560m-eval-v1.js` |
| Extract / routing | `src/rag/honest-contextual-extract.js`, `src/rag/sdb1560m-rag-priority.js`, `knowledge/sdb1560m/retrieval-cards/table-1.1-ttx.md` |
| Eval dataset | `scripts/build-sdb1560m-generalization-v1.js`, `scripts/eval/sdb1560m-generalization-v1.json` |
| Tests | `scripts/test-sdb1560m-task30-routing-extract.js` |
| Artifacts | `logs/baseline-task30/*`, this report |

Historical baselines under `logs/baseline-task27`, `logs/baseline-task28`, etc. were not modified.

---

## 8. Comparison to baselines

| Baseline | Metric | Task 30 HTTP |
|----------|--------|----------------|
| Task 27 HTTP v2 (historical) | 32/32 pass | **31/32** — regression on N2 timer case (`exp.num.n2-timer-99`) |
| Task 28 HTTP v3 | 41 / 66 / 3 overall; factual **41/90**; must_abstain **0/17** pass | **54 / 52 / 4** overall; factual **45/89**; must_abstain **9/17** pass |
| Task 28 v3 leakage | (see v3 report) | **1/21** (4.8%) — needs case-id triage in `report.json` |
| Task 29 diagnosis | Trace gap | Partial: `eval-rag-diagnostics.jsonl`; chunk bodies / pipeline summaries still incomplete without portal `EVAL_CAPTURE_RAG_TRACE` |

**Interpretation:** **Regression pass rate** **41/107 (38.3%) → 54/106 (50.9%)**; **factual accuracy** **41/90 → 45/89**; **must_answer** case pass **41 → 45**; **must_abstain** case pass **0 → 9**. Abstain layer confirms Task 29 pattern fix plus partial RAG; **8 abstain** and **44 answer** failures remain.

---

## 9. Open issues

1. **Task 27 regression:** `exp.num.n2-timer-99` — answer missing required **99.9** (extract/direct-fact vs evaluator decimal pattern).
2. **Chunk observability:** set **`EVAL_CAPTURE_RAG_TRACE=1`** on **portal** restart; optionally fix pipeline to honor eval trace header without server env.
3. **8/17 must_abstain** still fail (wrong facts, not pattern-only) — triage via `report.json` + diagnostics.
4. **44 must_answer** failures — use `eval-rag-diagnostics.jsonl` per id (N2, RAL, multi-fact, synthesis abstain).
5. **Cross-model leakage 1/21** — identify failing case in Task 30 generalization report.
6. **Eval pacing:** use **`$env:EVAL_DELAY_MS`** in PowerShell; **`CHAT_RATE_LIMIT_MAX`** on portal to avoid 429 bias mid-suite.

---

## 10. Conclusions we cannot draw yet

- Whether **Task 27 32/32** is restored without the N2-timer regression (needs r3 after fix).
- Exact **leakage case** root cause without reading the one failing `forbiddenLeakage` entry.
- **Per-layer abstention rate** aggregate (runner still reports `correct_abstention_rate` as not aggregated).
- Causal attribution of **+13 overall pass** between evaluator pattern fix vs RAG extract vs 429 mid-run variance (no A/B on same server config).

Primary artifacts for next iteration:  
`logs/baseline-task30/task28-generalization-http-v1/report.json`,  
`logs/baseline-task30/task28-generalization-http-v1/eval-rag-diagnostics.jsonl`,  
`logs/baseline-task30/task27-regression-http-verified-v2-r2/report.json`.
