# Task 21 — SDB1560NM RAG Quality Audit and Expanded Evaluation Dataset

**Date:** 2026-10-29  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Working tree:** dirty (modified + untracked files preserved; no reset/clean/stash/commit)

---

## 1. Git state and preservation

| Check | Result |
|-------|--------|
| Branch | `backup/sova-portal` |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (matches known state) |
| Destructive Git | **None** |
| Historical baselines | **Not modified** (`logs/baseline-task9/` … `task18/http-verify-20261029-r3/`) |
| `sdb1560m-eval-suite-draft-v1.json` | **Not overwritten** |
| Production / HTTP | **No portal restart, no HTTP in Task 21** |
| `.env` / DB / index | **Not touched** |

Representative `git status --short`: modified RAG/eval scripts under `src/rag/**`, `scripts/test-sdb1560m-*.js`, `knowledge/sdb1560m/golden-facts-sdb1560m.md`; many untracked reports/logs (unchanged by this task except new Task 21 deliverables).

---

## 2. Artifacts and sources inspected

| Artifact / file | Use |
|-----------------|-----|
| `docs/reports/sdb1560m-task16-restart-verification.md` | Gate vs RAG mass failure timeline |
| `docs/reports/sdb1560m-task17-mass-mismatch-diagnosis.md` | Product fix (156→260 kg) |
| `docs/reports/sdb1560m-task18-verification.md` | Checker false positive (`1560`+kg window) |
| `docs/reports/sdb1560m-task19-checker-audit.md` | Frozen Task 18 evidence |
| `docs/reports/sdb1560m-task20-checker-regression.md` | Checker regression tests |
| `logs/baseline-task17/http-mass-20261029-r2/` | Pre-checker-fix HTTP (read-only) |
| `logs/baseline-task18/http-verify-20261029-r3/` | **Frozen 6/6 HTTP** under `1.4-task18` |
| `docs/reports/sdb1560m-eval-suite-draft-v1.json` | Current 16-case draft (6 verified HTTP) |
| `docs/reports/sdb1560m-facts-and-eval-audit.md` | Fact registry C1–C4, PDF page audit |
| `docs/reports/sdb1560m-audit-pdf-pages/page-text-samples.json` | PDF text excerpts (tables 1.1, 1.2) |
| `knowledge/sdb1560m/golden-facts-sdb1560m.md` | Golden facts + unsupported list |
| `public/manuals/SDB1560NM.pdf` | Authoritative manual (47 pp.; also `knowledge/sdb1560m/Руководство SDB1560NM.pdf`) |
| `scripts/sdb1560m-eval-runner-lib.js` | Checker `1.4-task18`, partitions, grounding layers |
| `scripts/run-sdb1560m-eval-v1.js` | HTTP/dry runner CLI |
| `src/rag/pipeline/run-pipeline.js` | Honest/RAG PURE, grounding contract, trace |
| `src/equipment/profiles/sdb1560m.js` | Gate, post-gate, scoped chat |

**Task 18 manifest (frozen):** `mode=http`, `allowHttp=true`, `dryRun=false`, `authMode=eval_login`, `evalRunnerLibVersion=1.4-task18`, `skipReasons=[]`, summary **6 pass / 0 fail** — applies only to **draft-v1 `verified` partition (6 cases)**, not the full manual.

---

## 3. Manual structure and coverage (evidence-based)

Family manual **SATE.421411.001… РЭ 2026**, model row **SDB1560М** in **table 1.1** (p.7): **1202×1693×1028 mm**, **260 kg**. **Table 1.2** (p.10): kit lines including **4 wheels**, **4 feet**, **4 perforated shelves (8.6)**, **2 desiccant blocks (6.2)** for SDB1560М. **Section 1.1.2.7**: power caps (8 W storage, 40 W dry base, 540 W regen, 810 W with options for 1560). **1.1.2.11**: **IP55**. **1.1.2.12**: ambient **+15…+35 °C**, RH **≤80%**. **§1.1.4.x**: door beep, humidity rise with open door. **Table 3.1** (p.35): desiccant replacement **36 months**.

**Known source conflicts (from facts audit — not resolved in Task 21):**

| ID | Topic | PDF vs golden / cards |
|----|--------|------------------------|
| C1 | Shelf count in kit | PDF **4** (8.6) vs golden **2** |
| C2 | Desiccant count | PDF **2** (6.2) vs golden **1** |
| C3 | Dry power with options | PDF **810 W** vs golden **415 W** |
| C4 | Internal/full volume | golden **896 / 2070 L** — **not in PDF text layer** |

**Not applicable / not found in audited excerpts:** detailed installation anchoring, default Ethernet IP, mobile app, sensor vendor (correctly **unsupported** in golden).

---

## 4. Coverage matrix (existing vs gaps)

Machine-readable: [`sdb1560m-task21-coverage-matrix.json`](sdb1560m-task21-coverage-matrix.json) (12 summary rows).

### Draft v1 (`verified` HTTP = 6 cases)

| Area | Draft case IDs | Gap |
|------|----------------|-----|
| Mass | `num.mass.verified`, `para.mass-colloquial.verified` | Dims, IP, mains, RH specs, regen power, shelf load, N2 timer, wheels/feet |
| Dry power base | `num.dry-power-base.verified` | Storage 8 W, regen 540 W, 810 W with options |
| Safety | `mode.regen-shutdown.verified` | Env limits, W symbol, red lamp |
| Maintenance | `maint.desicc-interval.verified` | — |
| Alarm | `alarm.beep-door.verified` | RH-rise-after-load, red lamp |
| Blocked / routing | 10 other draft cases | Not in HTTP verified partition |

**Conclusion:** 6/6 HTTP proves **regression on six hand-picked checks**, not manual-wide correctness.

---

## 5. Expanded evaluation dataset

**File:** [`docs/reports/sdb1560m-eval-suite-expanded-v1.json`](sdb1560m-eval-suite-expanded-v1.json)  
**Schema:** `1.0-eval-contour` (same as draft v1)  
**Cases:** **52** distinct questions (within 40–60 target)

| Partition | Count | Meaning |
|-----------|------:|---------|
| `all` | 52 | Full design catalog |
| `verified` | 32 | `ready` + `must_answer` + `requiredFacts` (deterministic factual targets) |
| `blocked` | 8 | C1–C4 / dialog / poisoned context — **no requiredFacts** |
| `unsupported` | 10 | `must_abstain` |
| `routing` | 10 | Foreign model, leakage, contradictory context |

**Validation:** `validateSuiteDocument()` → **ok** (Task 21, local).

**Not executed against portal:** runner dry-run on expanded suite → **52 not_run** (manifest-only; no synthetic answers for scoring).

Each case includes `notes` with source locator (PDF section/page where known), expected behavior, and evaluation limits.

---

## 6. Dataset vs checker (`1.4-task18`)

Existing tests (unchanged in Task 21):

| Command | Exit |
|---------|------|
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **0** |

**Spot checks on expanded intents (local, not committed as suite HTTP):**

- Multi-fact answer shape `SDB1560NM — 260 kg … 1202` → **pass** on F-MASS with `unit: kg` (model designator skip).
- Case `exp.num.pwr-storage-with-opt-810` → checker accepts **810 W** phrasing; **forbidden `8` in case metadata is not enforced as hard fail** on dual mentions — **residual risk** if answers conflate base and option power in one sentence (recommend future counterexample if seen in HTTP).

**No checker or runner semantic changes in Task 21.**

**Lexical pass ≠ grounding:** expanded cases with `mustNotRelyOnSourceAlone` / grounding layer still **not_evaluable** when HTTP payload lacks chunk bodies (as in Task 18 reports: `_chunkTextCount: 0`).

---

## 7. RAG architecture and observability (repository trace)

| Stage | Implementation (SDB1560M) | Eval visibility |
|-------|---------------------------|-----------------|
| Scope gate | `sdb1560m-chat-gate.js` + profile `equipmentChatScoped: true` | Not in HTTP report unless trace exported |
| Deterministic FAQ | Disabled for honest pilot; whitelist in `honest-rag-deterministic.js` | Delivery method in trace when present |
| Retrieval | `unified-retriever.js`, synonyms in `sdb1560m-rag-priority.js`, cards under `knowledge/sdb1560m/retrieval-cards/` | HTTP report: **`sourceDocs` names only** (weak) |
| Rerank / filter | `rerank.js`, `filterFusedChunksForRagPure` | Scores not in standard eval JSON |
| Context | `formatContextForPrompt`, chunk caps in `run-pipeline.js` | Chunk text **not** stored in Task 18 artifact |
| Generation | `llm-service.js`, routes via `query-router.js` | `answerPreview` max **320** chars |
| Honest / RAG PURE | `honest-rag-mode.js`, grounding contract `sdb1560-grounding-contract.js`, contextual extract | Trace flags possible (`groundingContract`, `CONTEXTUAL_EXTRACT_GROUNDING`) — **not in saved baseline JSON** |
| Post-gate | `honest-rag-post-gate.js` / validation `sdb1560m-answer-validation.js` | Partial via factual layer only |

**Four distinct conditions (must not conflate):**

1. **Source filename in `sourceDocs`** — Task 18 mass/dry cases: **pass** retrieval weak check.  
2. **Fact text in retrieved chunk** — **Not demonstrated** in frozen HTTP artifacts.  
3. **Answer supported by chunk** — **Not scored** (`grounding: not_evaluable`).  
4. **Factually correct answer** — Partially approximated by deterministic **`requiredFacts`** on answer text only.

---

## 8. Metrics supported by evidence (Task 21)

| Metric | Value | Evidence |
|--------|-------|----------|
| Draft HTTP verified (6 cases) | **6/6 pass** | `logs/baseline-task18/http-verify-20261029-r3/` only |
| Factual accuracy (draft HTTP) | **100% (6/6)** | Same; checker `1.4-task18` |
| Expanded suite size | **52 cases** | New JSON, validated offline |
| Expanded HTTP pass rate | **Not available** | No HTTP run in Task 21 |
| Retrieval recall@k | **Not available** | No chunk text in baselines |
| Grounded claim rate | **Not available** | `_chunkTextCount: 0` |
| Whole-manual quality | **Not claimed** | By design |

---

## 9. Known defects, risks, open questions

| Item | Type | Notes |
|------|------|-------|
| C1–C4 source conflicts | **Data / product** | Blocked cases in expanded suite; RAG may answer inconsistently |
| `para.mass` without `unit: kg` | **Eval design** | Asymmetric vs direct mass case |
| Source list without chunks | **Observability** | Inflates retrieval pass confidence |
| Live tests accepting `(2\|4)` shelves | **Test debt** | Documented in facts audit — not changed here |
| Route/off-topic cases in JSON | **Runner limit** | `must_abstain` cases need gate or HTTP; not scored offline |
| Checker heuristics | **Risk** | Multi-number answers, family table leakage — mitigated by forbiddenClaims + Task 18–20 fixes |

---

## 10. Recommended next tasks (priority)

1. **HTTP eval expanded `verified` (32)** → new artifact dir `logs/baseline-task21/` or `task22/`; **do not** rescore Task 18.  
2. **Enhance eval payload capture** (chunk text hashes/snippets, post-gate trace) for grounding layer — code change, separate task.  
3. **Resolve C1–C4 with documentation owner** → update golden + unblock cases.  
4. **Optional:** add counterexample for `260 кг и 156 кг` if not already covered (Task 20 done).  
5. **Profile test RH% failure** — unrelated to eval suite but blocks full `test-sdb1560m-profile.js`.

---

## 11. Task 21 acceptance

| Criterion | Met |
|-----------|-----|
| Six-case baseline unchanged | **Yes** |
| Git documented | **Yes** |
| Manual inspected | **Yes** (PDF text samples + facts audit + golden) |
| Coverage gaps evidenced | **Yes** (matrix + §4) |
| Versioned expanded dataset | **Yes** (52 cases, validated) |
| Unit + counterexample tests run | **Yes** (exit 0) |
| No production / HTTP | **Yes** |
| No unsupported whole-manual quality claim | **Yes** |

**Production quality tested in Task 21:** **No** — dataset and architecture audit only; **Task 18 remains the only frozen HTTP quality sample (6 questions).**
