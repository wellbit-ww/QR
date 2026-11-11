# Task 41 — Comprehensive failure triage (SDB1560NM Task 28 after Task 40)

**Audit only.** No RAG, evaluator, dataset, DB, or HTTP reruns.  
**Branch:** `backup/sova-portal` · **HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` · dirty worktree preserved.

## Authoritative baseline (verified)

| Metric | Value | Artifact |
|--------|------:|----------|
| Cases | 110 | `logs/baseline-task40/task28-generalization-http/report.json` |
| Pass | 70 | same |
| Fail | **36** | same |
| Not evaluable | 4 | same |
| Infrastructure error | 0 | same |
| Cross-model leakage | **0/20** | `summary` + `cross_model_leakage_rate` in report |

Diagnostics: `logs/baseline-task40/task28-generalization-http/eval-rag-diagnostics.jsonl`  
Task 40 comparison: `logs/baseline-task40/task40-regression-comparison.json`  
Eval runner at capture: `1.9-task40-r1`

**Task 41 outputs:** `logs/baseline-task41/` — see §9 deliverables.

---

## Executive answers (10 required questions)

1. **Why do the remaining 36 cases fail?**  
   Mostly **`overall.reason=factual` (30/36)** on `must_answer` cases: answers are abstain-like, incomplete, or wrong despite retrieval often including golden table rows. **6/36** fail **`abstention`** on `must_abstain` (wrong or non-allowed wording). Nine cases also have **`grounding.status=fail`** (“required fact not found in evidence segments”), but **always with factual fail** — abstain-like or incomplete answers leave nothing to ground. Two **comparative power** cases fail factual **contradiction** while the answer text appears technically correct (evaluator pattern issue).

2. **How many are genuine answer-quality problems?**  
   **28/36** (all except **6** abstention-layer fails and **2** comparative-power evaluator cases). The 4 `not_evaluable` cases are evaluator limits, not RAG.

3. **How many retrieval-related? (A)**  
   **3** primary: `gen.num.rh-range-high`, `gen.std.esd`, `gen.ind.green-only-storage` (wrong-family or irrelevant chunks dominate snippets).

4. **How many routing/extraction-related? (B + C)**  
   **B: 1** (`gen.rh.rule-below30` — setpoint rule paraphrase, route/card gap analogous to pre–Task 40 `gen.rh.rule-above30`).  
   **C: 3** (`gen.num.pwr-regen`, `gen.num.rh-accuracy`, `gen.kit.shelves-perf` — extract kind applied or attempted but factual miss).

5. **How many synthesis-related? (D)**  
   **20** — spurious context abstention, partial kit/option answers, procedure paraphrase hedging, symbol answers that defer to “not in context” while chunks exist.

6. **How many grounding/evaluation defects? (E + G)**  
   **E: 0** as primary (no factual-pass + grounding-fail). Grounding co-fails on 9 IDs are secondary to synthesis/abstain.  
   **G: 2** fails (`gen.disc.storage-vs-dry`, `gen.disc.810-storage-vs-dry`) plus **4 not_evaluable** (`gen.num.ip55`, `gen.para.ip`, `gen.ind.red-door`, `gen.sym.n2`).

7. **How many abstention failures? (F)**  
   **6:** `gen.unsup.bluetooth`, `gen.unsup.sdb151-mass-for-1560`, `gen.unsup.warehouse-humidity-setpoint`, `gen.insuf.n2-without-option`, `gen.unsup.blockchain`, `gen.unsup.serial-format`.

8. **Largest common root causes?**  
   - **Spurious abstain on must_answer** (~15 cases) — dominant.  
   - **must_abstain phrasing** (6).  
   - **Cross-model TTX chunk pollution** (7 in cluster, 3 primary A).  
   - **Environmental/RAL retrieval gap** (pressure + RAL + ESD family).  
   - **Comparative W evaluator** (2).

9. **Single improvement to implement next?**  
   **Task 42 — spurious abstain recovery** (early extract + reject “не указано в контексте” when golden/table corpus present). Highest case count, high confidence, isolated to synthesis/post-gate. Details: `logs/baseline-task41/improvement-roadmap.md`.

10. **Safest sequence of subsequent tasks?**  
   43 (must_abstain gate) → 42 (spurious abstain) → 46 (demote SDB1106NM TTX rows) → 44 (env/RAL cards) → 45 (RH below-30 routing) → 48 (LCD symbols) → 49 (single-field extracts) → 47 (comparative W evaluator — **stakeholder sign-off only**).

**Primary classification sum:** A3 + B1 + C3 + D20 + E0 + F6 + G2 + H1 = **36** (see `logs/baseline-task41/task41-final-classifications.json`).

---

## Historical regression (Tasks 30, 32, 33, 39, 40)

| Task | T28 pass | fail | NE | Notes |
|------|---------:|-----:|---:|-------|
| 30 | 54 | 52 | 4 | `logs/baseline-task30/task28-generalization-http-v1/` |
| 32 | 51 | 52 | 4 | 3 infra errors |
| 33 | 55 | 51 | 4 | Pre–Priority-B push |
| 39 | 69 | 37 | 4 | After Task 39 eval fixes |
| 40 | **70** | **36** | 4 | After Task 40 RH grounding |

- **Improved 39→40:** `gen.rh.rule-above30` (now pass; not in the fail set).  
- **Regressed 39→40 among current fails:** none.  
- **All 36 fails were fail at Task 39.**  
- **34/36** also fail at Task 33; **regained fail after T33 pass:** `gen.num.pwr-regen`, `gen.para.storage-w` (HTTP variance / RAG churn — no single commit attributed).

Full JSON: `logs/baseline-task41/historical-regression.json`.

---

## Genuine RAG vs evaluation

| Bucket | Count | IDs (summary) |
|--------|------:|---------------|
| RAG answer quality (D+A+B+C+H) | 28 | See inventory |
| Abstention policy (F) | 6 | `gen.unsup.*`, `gen.insuf.*` |
| Evaluator/dataset (G) | 2 fails + 4 NE | `gen.disc.*`; ip55/ip/sym patterns |
| Grounding-primary (E) | 0 | — |

---

## Protected baselines (unchanged in Task 41)

- Task 27: **32/32** (Task 40 HTTP)  
- Priority B: **10/10**  
- Task 28: **≥ 70/110** (current **70**)  
- Leakage: **0/20**  
- Infrastructure: **0**

---

## Deliverables

| # | Path |
|---|------|
| 1 | `logs/baseline-task41/failure-inventory.md` |
| 2 | `logs/baseline-task41/root-cause-analysis.md` |
| 3 | `logs/baseline-task41/failure-clusters.json` |
| 4 | `logs/baseline-task41/improvement-roadmap.md` |
| 5 | `docs/reports/sdb1560m-task41-failure-triage.md` (this file) |

**Supporting:** `task41-inventory.json`, `task41-final-classifications.json`, `repo-metadata.json`, `historical-regression.json`, read-only generator `build-task41-triage.js` (logs only).

---

## Success criterion

Task 41 delivers a **complete, evidence-backed diagnosis** of the 36 remaining generalization failures. Pass rate was **not** changed. No production code was modified.
