# Task 34 — SDB1560NM generalization quality audit (diagnostic only)

**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (dirty; no commit)  
**Eval runner:** `1.7-task33` (read-only use in audit script)  
**Pre-task snapshot:** `logs/baseline-task34/pre-task34-status.txt`  
**Post-task snapshot:** `logs/baseline-task34/post-task34-status.txt`

**No production RAG, evaluator, dataset, DB, or Qdrant changes in Task 34.**

---

## 1. Sources

| Artifact | Path |
|----------|------|
| Task 33 Task 28 HTTP | `logs/baseline-task33/task28-generalization-http-v9/report.json` |
| RAG diagnostics | `logs/baseline-task33/task28-generalization-http-v9/eval-rag-diagnostics.jsonl` |
| Summary | `logs/baseline-task33/task28-generalization-http-v9/SUMMARY.md` |
| Task 27 reference (verified baseline) | `logs/baseline-task33/task27-regression-http-v10/` |
| Classification output | `logs/baseline-task34/task28-failure-classification.json` |
| Task 35 plan | `logs/baseline-task34/task35-priority-plan.json` |
| Generator (read-only) | `scripts/build-task34-generalization-audit.js` |

**Baseline HTTP headline:** 55 pass / 51 fail / 4 not_evaluable; factual **46/89**; must_abstain **9/17**; leakage **0/20**; infra **0**.

---

## 2. Failure inventory (55 cases)

### 2.1 By overall evaluator outcome

| Overall | Count | Layer driver |
|---------|------:|----------------|
| `fail` + reason `factual` | 43 | Factual heuristic |
| `fail` + reason `abstention` | 8 | must_abstain (all 8 are must_abstain cases) |
| `not_evaluable` + `factual_heuristic_limit` | 4 | Short/ambiguous `claimPattern` (evaluator limit) |

**Grounding failures on this run:** **0** (Task 33 dry-power / model-group fixes hold on generalization).

### 2.2 Full ID lists — 51 fail

`gen.num.mass.base`, `gen.num.voltage`, `gen.num.freq`, `gen.num.dim-tolerance`, `gen.num.rh-range-high`, `gen.num.rh-accuracy`, `gen.num.pwr-dry-opt810`, `gen.env.pressure-kpa-min`, `gen.env.pressure-kpa-max`, `gen.num.ral`, `gen.kit.wheels`, `gen.kit.feet-height`, `gen.kit.shelves-perf`, `gen.kit.power-cord`, `gen.opt.feeder-basket-min`, `gen.opt.feeder-basket-max`, `gen.opt.n2-timer-max`, `gen.opt.n2-sensor-max`, `gen.maint.dust-months`, `gen.maint.power-cable`, `gen.proc.sound-door`, `gen.proc.door-fan-off`, `gen.multi.mass-depth`, `gen.multi.dry-regen-power`, `gen.multi.ambient-temp-rh`, `gen.multi.n2-flow-range`, `gen.para.mass`, `gen.para.desiccant-qty`, `gen.para.36m`, `gen.disc.storage-vs-dry`, `gen.disc.810-storage-vs-dry`, `gen.unsup.bluetooth`, `gen.unsup.sdb151-mass-for-1560`, `gen.unsup.internal-volume-liters`, `gen.unsup.full-volume-liters`, `gen.unsup.warehouse-humidity-setpoint`, `gen.insuf.n2-without-option`, `gen.unsup.blockchain`, `gen.unsup.serial-format`, `gen.std.esd`, `gen.spare.lock-excluded`, `gen.rh.rule-below30`, `gen.rh.rule-above30`, `gen.spare.fuse-heating`, `gen.env.pressure-mmhg-min`, `gen.env.pressure-mmhg-max`, `gen.ind.green-only-storage`, `gen.note.height-signal`, `gen.proc.open-door-symbol`, `gen.proc.fan-symbol`, `gen.foreign.mass-1106`.

### 2.3 Four not_evaluable

| ID | Evaluator note |
|----|----------------|
| `gen.num.ip55` | `claimPattern` **IP55** — `unsafe_text_pattern` |
| `gen.para.ip` | same |
| `gen.ind.red-door` | **двер** — too short/ambiguous pattern |
| `gen.sym.n2` | **азот** — too short/ambiguous pattern |

These ran with chunk trace (`chunkTextCount` > 0 on several); failure is **evaluator scoring limit**, not infra.

---

## 3. Primary root-cause distribution (55)

Heuristic classification from report + diagnostics (see JSON for per-case fields). **Not** a substitute for manual PDF spot-check on every ID.

| Code | Label | Count | Case IDs |
|------|-------|------:|----------|
| **C** | Generation / interpretation | 19 | See §3.1 |
| **A** | Retrieval (snippet-negative) | 12 | See §3.2 |
| **B** | Contextual extract | 10 | See §3.3 |
| **D** | Abstention / unsupported | 8 | All must_abstain fails |
| **F** | Factual evaluator / dataset | 5 | `gen.num.ip55`, `gen.ind.red-door`, `gen.sym.n2`, `gen.para.ip`, `gen.disc.storage-vs-dry` |
| **H** | Insufficient observability | 1 | `gen.foreign.mass-1106` |
| **E** | Grounding evaluator | 0 | — |

### 3.1 C — Generation / interpretation (19)

`gen.num.mass.base`, `gen.num.voltage`, `gen.num.freq`, `gen.num.rh-accuracy`, `gen.kit.wheels`, `gen.kit.shelves-perf`, `gen.kit.power-cord`, `gen.opt.feeder-basket-min`, `gen.opt.feeder-basket-max`, `gen.maint.dust-months`, `gen.maint.power-cable`, `gen.proc.sound-door`, `gen.proc.door-fan-off`, `gen.multi.mass-depth`, `gen.para.mass`, `gen.para.desiccant-qty`, `gen.para.36m`, `gen.disc.810-storage-vs-dry`, `gen.spare.lock-excluded`.

**Evidence patterns:**

- **`gen.num.mass.base`:** Answer abstain-like («не указано…») while **grounding pass** and chunks include golden table — **C** (LLM spurious abstain; extract `null`). Manual: mass **260 kg** in РЭ tab. 1.1 / golden row.
- **`gen.num.voltage` / `gen.num.freq`:** Substantive or wrong answers with facts in manual (network §1.1.2.6) — generation or missing extract; chunks present.
- Many **procedure / kit / paraphrase** IDs: partial or wrong numeric assertions despite retrieval.

### 3.2 A — Retrieval (12)

`gen.num.rh-range-high`, `gen.env.pressure-kpa-min`, `gen.env.pressure-kpa-max`, `gen.num.ral`, `gen.std.esd`, `gen.rh.rule-below30`, `gen.spare.fuse-heating`, `gen.env.pressure-mmhg-min`, `gen.env.pressure-mmhg-max`, `gen.ind.green-only-storage`, `gen.proc.open-door-symbol`, `gen.proc.fan-symbol`.

**Caveat:** Classification used **200-char diagnostic snippets** only. Where snippets omit the fact but full chunk bodies (not stored in JSONL) contain it, true cause may be **C** not **A**. Task 35 should confirm with full `content` from a one-off read-only export.

### 3.3 B — Contextual extract (10)

`gen.num.dim-tolerance`, `gen.num.pwr-dry-opt810`, `gen.kit.feet-height`, `gen.opt.n2-timer-max`, `gen.opt.n2-sensor-max`, `gen.multi.dry-regen-power`, `gen.multi.ambient-temp-rh`, `gen.multi.n2-flow-range`, `gen.note.height-signal`, `gen.rh.rule-above30`.

**Pattern:** `extractKind` set in evidence but factual fail — extract path ran but answer did not satisfy `requiredFacts` (wrong kind, partial multi-fact, or LLM overwrote extract).

---

## 4. must_abstain (17)

| Result | Count | IDs |
|--------|------:|-----|
| **Pass** | 9 | `gen.unsup.wifi`, `gen.unsup.mqtt-api`, `gen.unsup.mobile-app`, `gen.unsup.default-ip`, `gen.unsup.cpu`, `gen.unsup.regen-duration-min`, `gen.unsup.firmware-version`, `gen.unsup.warranty-years`, `gen.unsup.modbus` |
| **Fail** | 8 | Below |

### 4.1 Eight failures (all reason `abstention`)

| ID | Theme | Actual answer (preview) | Diagnosis |
|----|-------|-------------------------|-----------|
| `gen.unsup.internal-volume-liters` | Internal volume L | States **1896 л** | **P0 hallucination** — must_abstain; substantive numeric |
| `gen.unsup.full-volume-liters` | Full volume L | States **2070 л** | **P0 hallucination** |
| `gen.unsup.bluetooth` | Bluetooth setup | «не упоминается…» | Soft wording; **allowed patterns not matched** (D) |
| `gen.unsup.blockchain` | Blockchain logging | «нет информации…» | Context-style abstain; pattern miss (D) |
| `gen.unsup.warehouse-humidity-setpoint` | Warehouse RH setpoint | Partial procedural text | Not recognized abstain (D) |
| `gen.insuf.n2-without-option` | N2 without option | Explains option not in base kit | **Substantive** policy answer; not allowed abstain template (D) |
| `gen.unsup.serial-format` | Serial number format | Points to nameplate | **Substantive**; may be doc-supported but case expects abstain (D / verify manual §nameplate) |
| `gen.unsup.sdb151-mass-for-1560` | Wrong model mass | Scope gate «только SDB1560» | Wording not in allowed patterns (D) |

**Unsupported-spec gate:** Firmware fixed in Task 33 (`gen.unsup.firmware-version` **pass** on this run). Bluetooth/blockchain/volumes still bypass or use non-template phrasing.

**Not documentation gaps for volumes:** Eval case expects **abstain**; model **invented** catalog-like liters — **user harm risk**, not missing PDF fact.

---

## 5. Documented evaluator / dataset issues (F)

| ID | Proof |
|----|--------|
| `gen.disc.storage-vs-dry` | Answer correctly compares **8 W** storage vs **40 W** dry; factual fail **`contradiction` on 40** (multi-W numeric heuristic). **RAG answer quality OK**; checker/dataset issue for comparative answers. |
| `gen.num.ip55`, `gen.para.ip`, `gen.ind.red-door`, `gen.sym.n2` | `not_evaluable` — patterns too short for deterministic check per runner rules. |

No dataset edits in Task 34.

---

## 6. Success vs failure patterns (n=55 pass, n=55 fail — descriptive only)

| Signal | Pass (55) | Fail+NE (55) |
|--------|-----------|--------------|
| Mean `chunkTextCount` | ~9.3 | ~10 (similar) |
| `extractKind` present | 22/55 (40%) | 10/55 (18%) |
| Grounding fail | 0 | 0 |

**Interpretation:** Failures are **not** explained by missing trace or zero chunks. They cluster in **LLM abstain-on-must_answer**, **extract not applied or overwritten**, and **must_abstain template mismatch**. Small sample — avoid strong global statistics.

---

## 7. Documentation gaps (G)

No case received primary **G** with high confidence without manual PDF line-by-line review. Suspected **G** candidates for Task 35 manual pass:

- `gen.std.esd`, `gen.spare.lock-excluded`, `gen.rh.rule-*` — if facts absent from retrieved snippets **and** confirmed absent in PDF.

Mark **unconfirmed** until PDF search in Task 35.

---

## 8. Observability limits (H)

- Diagnostic snippets capped at **200 chars** (`summarizePayloadDiagnostics`) — drives **A vs C** uncertainty for 12+ cases.
- `gen.foreign.mass-1106`: classified **H** — cross-model scope; needs full answer + leakage context (forbidden **180**).

Trace fields used: `chunkTextCount`, `extractKind`, `contextualExtract`, `sourceDocs`, layer statuses.

---

## 9. Task 35 priority plan (summary)

Full JSON: `logs/baseline-task34/task35-priority-plan.json`.

| Priority | Theme | Cases | Layer |
|----------|-------|------:|-------|
| **P0** | must_abstain hallucinated volumes | 2 | RAG / guardrail |
| **P1** | Spurious abstain on must_answer (grounded evidence) | ~several in C | Extract + routing (`mass`, voltage, freq) |
| **P1** | Extract kind present, answer wrong | 10 | honest-contextual-extract + post-LLM |
| **P1** | Retrieval / cards for env pressure, RAL, rules | 12 | Retrieval + cards |
| **P1** | must_abstain wording / gate | 6 non-hallucination | unsupported-spec + abstain templates |
| **P1** | Comparative 8 W vs 40 W | 1 | Evaluator/dataset (`gen.disc.storage-vs-dry`) — document only unless policy allows change |
| **P2** | not_evaluable IP / short patterns | 4 | Evaluator/dataset review |

---

## 10. Definition of Done

| Criterion | Status |
|-----------|--------|
| All 51 fail analyzed | **Yes** — JSON + §2 |
| All 4 not_evaluable analyzed | **Yes** — §2.3 |
| All 17 must_abstain analyzed | **Yes** — §4 |
| Each classified or explicit limit | **Yes** — confidence + snippet caveat |
| JSON classification | **Yes** |
| JSON Task 35 plan | **Yes** |
| Markdown report | **Yes** |
| No RAG/evaluator/dataset production changes | **Yes** |
| No commit | **Yes** |

---

## 11. Limitations

1. **No code changes** to pipeline — diagnoses are **hypothesis-grade** where snippets truncate evidence.  
2. **Golden facts** used only as retrieval artifact in traces, not as ground truth for §3 documentation claims.  
3. **No new HTTP** in Task 34 (Task 33 v9 sufficient for 55 failures).  
4. **LLM variance** not separated without repeated runs.

**Principle:** Task 35 should fix **P0 abstain hallucinations** and **high-confidence C cases with grounding pass** before broad retrieval tuning.
