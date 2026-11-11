# Task 29 — Generalization Failure Analysis, Abstention Recovery & Regression Verification

**Date:** 2026-11-02  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Status:** **Diagnostic complete** — root-cause analysis from Task 28 v3 `report.json`; **Task 27 not re-verified** in this environment (missing `EVAL_LOGIN`/`EVAL_PASSWORD` in loaded `.env`); **no production RAG changes**.

**Pre-task snapshot:** `logs/baseline-task29/pre-task29-snapshot.txt`  
**Case-level audit JSON:** `logs/baseline-task29/task28-v3-case-audit.json`  
**Analyzer:** `scripts/analyze-sdb1560m-task29-from-report.js`

---

## 1. Git state and baseline SHA-256

| Item | Value |
|------|--------|
| Branch | `backup/sova-portal` |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Working tree | **dirty** (~112 lines in `git status --short`) |

| Artifact | SHA-256 |
|----------|---------|
| Task 27 `logs/baseline-task27/http-verified-20261102-v2/report.json` | `634197E4FFDD8095B9589D50E7B8F34103156CA229B6518BD2948CE89A39A93C` |
| Task 28 v3 `logs/baseline-task28/http-verified-20261102-v3/report.json` | `F540C5F848C94E0322D200778098ADFC9554852D4EAD43A1156B77AD825D480` |
| Dataset `scripts/eval/sdb1560m-generalization-v1.json` | `38236023A4631691A32A62422066B58FED2F00AEA9EF76F88D6F8D4C4DBCFF` |

Historical baselines **not modified**.

---

## 2. Task 28 metric arithmetic (recounted from JSON)

Source: `logs/baseline-task28/http-verified-20261102-v3/report.json` (110 `caseResults`).

### 2.1 Dataset composition

| Partition | Count |
|-----------|------:|
| Total cases | **110** |
| `must_answer` | **93** |
| `must_abstain` | **17** |

### 2.2 Overall HTTP outcomes (all 110 executed)

| Status | Count |
|--------|------:|
| `pass` | **41** |
| `fail` | **66** |
| `not_evaluable` | **3** |
| `infrastructure_error` | **0** |

**Check:** 41 + 66 + 3 = **110**. All cases received HTTP payloads.

### 2.3 Clarifying “41/49” vs 93 `must_answer`

Task 28 prose used **two pass counts and two fail counts**, not one fraction:

| Metric | Meaning | Count |
|--------|---------|------:|
| `must_answer` **pass** | `overall.status === pass` | **41** |
| `must_answer` **fail** | `overall.status === fail` | **49** |
| `must_answer` **not_evaluable** | `overall.status === not_evaluable` | **3** |

**41 + 49 + 3 = 93** — all `must_answer` cases accounted for. There is **no** “denominator 49” for the full answer set; **49** is simply the number of failed answer cases.

| `must_abstain` | pass | fail |
|----------------|-----:|-----:|
| | **0** | **17** |

### 2.4 Runner metric denominators (not the same as 93)

From `computeMetrics()` in `sdb1560m-eval-runner-lib.js`:

| Metric | Num / Den | Explanation |
|--------|-----------|-------------|
| **answer_factual_accuracy** | **41 / 90** | Only `must_answer` + `requiredFacts.length > 0` + factual layer **pass or fail** (excludes **3** `not_evaluable`: `gen.num.ip55`, `gen.sym.n2`, `gen.para.ip`) |
| **regression_pass_rate** | **41 / 107** | All non-blocked cases except **3** `not_evaluable` (includes **17** abstain cases in denominator) |
| **cross_model_leakage_rate** | **1 / 21** | Cases with `forbiddenClaims` |

**Overall pass rate:** 41/110 = **37.3%** — this mixes abstain and answer cases; **do not** compare directly to Task 27 **32/32**.

### 2.5 Report vs JSON

Task 28 summary numbers **match** recomputation from v3 JSON. No arithmetic error in the report; the **41/49** wording was easy to misread as a ratio.

---

## 3. HTTP artifacts and trace limits

The runner **does not persist** full HTTP request/response bodies in `report.json`.

Per case, v3 stores:

| Field | Present |
|-------|---------|
| Question (`case.message`) | Yes |
| `answerPreview` (truncated answer) | Yes |
| `overall` + `layers` (evaluator) | Yes |
| `evidenceUsed.sourceDocs` (≤4 titles) | Often |
| `evidenceUsed.chunkTextCount` | Often **0** |
| `evidenceUsed.hasDebugTrace` | Usually **false** |
| Full retrieval chunk text | **No** |
| `ragTrace` / `retrieval` from API | **Not stored** in report |

**Implication:** Stage classification below uses **answer text + source doc names + evaluator layers**. It is **not** a chunk-by-chunk retrieval audit. Deeper proof requires re-running selected cases with chat logging or extending the runner to persist traces (out of scope for Task 29 code changes).

**Mapping table:** see `logs/baseline-task29/task28-v3-case-audit.json` → `rows[]` (`id`, `overall`, `answerPreview`, `evidenceUsed`).

---

## 4. Task 27 regression re-verification

**Target:** `logs/baseline-task29/task27-regression-http-verified-v1/`

| Run | Result |
|-----|--------|
| 2026-11-02T07:42:12Z | **32 × `infrastructure_error`** — `authMode: missing_credentials` (`EVAL_LOGIN` / `EVAL_PASSWORD` not in environment loaded by agent) |

**Not confirmed:** 32/32 on current portal in this session.

**Authoritative historical baseline unchanged:** Task 27 **32/32** at `logs/baseline-task27/http-verified-20261102-v2/`.

**Operator re-run (portal up, creds in shell, optional `CHAT_RATE_LIMIT_MAX=500`, `EVAL_DELAY_MS=10000`):**

```powershell
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified `
  --dataset=docs/reports/sdb1560m-eval-suite-expanded-v2.json `
  --out=logs/baseline-task29/task27-regression-http-verified-v2
```

---

## 5. Seventeen `must_abstain` failures (priority)

All **17** failed with `overall.reason === abstention` (except where factual leakage also applies). Full list:

`gen.unsup.wifi`, `gen.unsup.mqtt-api`, `gen.unsup.mobile-app`, `gen.unsup.default-ip`, `gen.unsup.cpu`, `gen.unsup.regen-duration-min`, `gen.unsup.bluetooth`, `gen.unsup.firmware-version`, `gen.unsup.warranty-years`, `gen.unsup.sdb151-mass-for-1560`, `gen.unsup.internal-volume-liters`, `gen.unsup.full-volume-liters`, `gen.unsup.warehouse-humidity-setpoint`, `gen.unsup.modbus`, `gen.insuf.n2-without-option`, `gen.unsup.blockchain`, `gen.unsup.serial-format`

### 5.1 Classification summary

| Class | Count | IDs (summary) |
|-------|------:|----------------|
| **G — Dataset / evaluator pattern** | **9** | wifi, mqtt-api, mobile-app, default-ip, cpu, regen-duration-min, firmware-version, warranty-years, modbus |
| **E — Generation (substantive wrong answer)** | **5** | bluetooth, full-volume-liters, internal-volume-liters, warehouse-humidity-setpoint, serial-format, blockchain (partial) |
| **F — Abstention policy / scope** | **2** | sdb151-mass-for-1560 (scope redirect), insuf.n2-without-option (definite claim without abstain) |
| **H — Unknown** | **0** | — |

*(blockchain counted under E partial; total 17.)*

### 5.2 Evidence highlights

#### G — Evaluator pattern gap (9 cases)

**Observed answer (typical):** «В документации на данную модель этот параметр не указан.»

**PDF:** Wi‑Fi / MQTT / Modbus / default IP / CPU / warranty / firmware — **not** in manual (golden unsupported list confirms).

**Retrieval:** often `sourceDocs: []`, `chunkTextCount: 0`.

**Why evaluator failed:** `abstentionRules.allowedAbstainPatterns` use JSON-escaped regexes. After parse, pattern `не\\s+указан|отсутств` does **not** match «не указан» (literal `\\s` in pattern, not whitespace class). Substring `отсутств` matches only answers containing that stem (e.g. «отсутствует»), **not** the portal’s «не указан» template.

**Conclusion:** RAG behavior is **semantically correct abstain**; **evaluator + dataset patterns** mark it fail. This is **not** the same failure mode as Task 27 v2 abstain passes, which use phrases like «Информация отсутствует в документации.» or `STRICT_ABSTAIN`.

**Fix direction (future, not done in Task 29):** align portal abstain template with v2 patterns **or** fix pattern escaping in dataset (separate from “weakening” scoring intent).

#### E — Wrong substantive answers (5–6 cases)

| ID | Answer issue | PDF / golden |
|----|----------------|---------------|
| `gen.unsup.internal-volume-liters` | **1896 л** | Volume L **not verified** in PDF text layer; golden C4 conflict |
| `gen.unsup.full-volume-liters` | **2070 л** | Same |
| `gen.unsup.warehouse-humidity-setpoint` | RH setpoint rules without class | Insufficient question → should abstain; RAG gave generic RH rule |
| `gen.unsup.serial-format` | “Маркировка”, decoding SN | Over-specific; not a supported abstain |
| `gen.unsup.bluetooth` | Ethernet/panel narrative | Partial answer, not clean abstain |
| `gen.unsup.blockchain` | Long denial with speculation | Abstain phrasing + extra claims |

**Class:** **E / F** — generation and abstention policy, not document gap.

#### F — Scope / policy (2 cases)

| ID | Behavior |
|----|----------|
| `gen.unsup.sdb151-mass-for-1560` | «Я специализируюсь только на SDB1560M…» — scope gate, **not** evaluator abstain pattern |
| `gen.insuf.n2-without-option` | «не имеет расхода азота» — logical but **not** matching abstain regexes; debatable as answer vs abstain |

---

## 6. Alarm troubleshooting — 0/5

| ID | Expected (manual) | Actual (preview) | Likely cause |
|----|-------------------|------------------|--------------|
| `gen.ind.red-door` | Open door (§1.1.4.3.3) | «Информация отсутствует в документации.» | **F** — false abstain on `must_answer` (card `red-lamp.md` exists) |
| `gen.proc.sound-door` | Sound on door open (p.15) | Hedged / generic | **C/E** — context not used; abstain-like |
| `gen.proc.door-fan-off` | Fan off when door open (§1.1.4.4.1) | Guess + door symbol | **B/C/E** — card not applied to wording |
| `gen.proc.close-door-timer` | **60 ± 1 min** after close | N2 valve menu 0–99.9 min | **D/E** — wrong extract topic (azot vs door dry cycle) |
| `gen.proc.fan-restart-1rh` | **RHп + 1 %** | RH ambient rules / abstain | **B/C/E** — card `fan-restart-1rh.md` not surfaced |

**Retrieval cards present:** `door-close-dry.md`, `fan-restart-1rh.md`, `red-lamp.md` — failures are **not** missing files; independent phrasing + routing/extract/generation dominate.

---

## 7. N2 option failures

| ID | Status | Notes |
|----|--------|-------|
| `gen.opt.n2-pressure` | fail | Abstain-like “не указано…” — PDF **p.25: 6 Bar** |
| `gen.opt.n2-tube` | fail | Abstain-like — PDF **8 mm** |
| `gen.opt.n2-flow-min` | fail | Abstain-like — PDF **3 l/min** |
| `gen.opt.n2-flow-max` | **pass** | **30 l/min** |
| `gen.opt.n2-timer-max` | fail | **99 min** vs **99.9** |
| `gen.opt.n2-sensor-min` | fail | «не указан» — PDF **78 %** |
| `gen.opt.n2-sensor-max` | fail | Partial answer, regex miss |

**Pattern:** §1.2.2 text likely **under-retrieved** or model **defaults to abstain** for option-specific numbers. One pass (max flow) shows corpus **can** succeed.

**Class:** predominantly **B/C/E** (retrieval/context + generation), not evaluator.

---

## 8. Other numeric / kit / maintenance failures

Among **49** failed `must_answer` cases, **28** have factual detail **«must_answer but answer is empty or abstain-like»** — RAG refused or hedged where facts exist in PDF/golden (e.g. `gen.num.mass.base` with mass in table 1.1).

Remaining fails: missing regex facts (pressure kPa, RAL, kit counts, multi-fact partial answers, N2 above).

**Evaluator:** factual layer only; **0** retrieval layer fails recorded (retrieval checks mostly `not_evaluable`).

---

## 9. Source corpus check (read-only)

| Source | Role in failures |
|--------|------------------|
| PDF `SDB1560NM.pdf` | Authoritative; N2 §1.2.2, alarms §1.1.4.4, table 1.1 |
| `golden-facts-sdb1560m.md` | Cited in sources for **volume** and unsupported — **risk of golden leakage** on abstain cases |
| Retrieval cards | Alarm/N2 cards exist but **not evidenced** in stored traces |
| Qdrant / reindex | **Not inspected** (no DB changes) |

---

## 10. Production RAG changes

**None.** Task 29 is diagnostic only.

Grouped **root causes** for a future Task 30+ (minimal, general fixes):

1. **Abstain template vs evaluator patterns** (9 generalization abstain “fails”).
2. **Over-abstention on answerable TTX** (~28 abstain-like factual fails).
3. **Golden / volume unsupported claims** (1896/2070 L on abstain questions).
4. **Extract/routing confusion** (door 60 min vs N2 timer; fan +1 RH vs ambient RH rules).
5. **Option §1.2.2 retrieval** (N2 parameter block).
6. **Dataset regex** for `99.9` vs answer «99 минут» (possible evaluator strictness).

Do **not** add 17 question-specific rules.

---

## 11. HTTP after changes

Not applicable — no RAG changes.

---

## 12. Comparison before/after

Only Task 28 v3 baseline analyzed; no post-fix HTTP.

---

## 13. Open questions

1. Task **27/32** on **current** code — needs operator HTTP with credentials.
2. Chunk-level retrieval for failed cases — needs trace capture.
3. Whether v2 abstain cases always use `STRICT_ABSTAIN` vs «не указан» template on live portal.
4. PDF text layer proof for **1896/2070 L**.

---

## 14. Recommendations (next stage)

1. Re-run **Task 27 verified** → `task27-regression-http-verified-v2`.
2. Persist **ragTrace/chunk snippets** in eval reports for failure analysis.
3. Unify **unsupported abstain phrasing** with evaluator patterns **or** fix pattern escaping in generalization JSON (document-only vs evaluator — not “weakening” intent).
4. Target **over-abstention** on table 1.1 / kit facts (mass regression in generalization).
5. **Routing:** door-close 60 min vs N2 menu; fan +1 RH card priority.
6. **Retrieval** for §1.2.2 N2 block without hardcoding 17 answers.

---

## 15. Result table

| Check | Result |
|-------|--------|
| Task 27 re-verified (Task 29) | **No** — 32 × infra (missing eval creds in agent env) |
| Task 27 authoritative | **32/32** (historical) |
| Abstain failures explained | **17/17** (with trace limits) |
| Abstain “RAG wrong” vs “evaluator pattern” | **~8** substantive / **~9** pattern mismatch |
| Retrieval (proven) | **0** layer fails; **hypothesis** B/C for N2/alarms |
| Generation / policy | **Majority** of answer-case fails |
| Extract routing | **At least 1** strong case (`close-door-timer` → N2) |
| Document/golden | Volume L, pattern gaps |
| Unknown | **0** abstain IDs unclassified; chunk-level **unknown** |
| Production RAG changed | **No** |

---

## 16. Confirmed vs inferred

| Confirmed (from v3 JSON) | Inferred / hypothesis |
|--------------------------|------------------------|
| 41/66/3/0 counts | Exact retrieval miss without traces |
| 17/17 abstain overall fail | All alarm card paths broken in pipeline |
| 9 abstain + «не указан» template vs regex | |
| 28/49 answer fails abstain-like | |
| 0 infra on v3 | Task 27 on current code without your shell creds |

---

**Stop:** Task 29 complete. **Task 30 not started.**
