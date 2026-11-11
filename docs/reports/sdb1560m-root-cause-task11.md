# Task 11 — Independent Root-Cause Analysis (SDB1560M Baseline Failures)

**Date:** 2026-10-29  
**Scope:** Read-only diagnosis of the first authenticated production HTTP baseline.  
**Baseline directory:** `logs/baseline-task9/http-run-20261029-r2/`

**Confirmation:** No production HTTP requests, database writes, ingest, provisioning, environment or configuration changes, or modifications to RAG/runner/dataset code were performed for this task. Git working tree was inspected only (`git status -sb`, `git rev-parse HEAD`); HEAD remains `8523954fadcc4f31b92305f81b8dfc09f3e61a14` on branch `backup/sova-portal` (dirty, unchanged by this task). A local Node read of `classifySdb1560mMessage` / `evaluateRequiredFact` (no network) was used only to confirm code-path behavior against saved answer text.

---

## 1. Baseline identity (verified)

| Field | Value |
|--------|--------|
| Artifact path | `logs/baseline-task9/http-run-20261029-r2/` |
| Files present | `manifest.json`, `report.json`, `SUMMARY.md` |
| `capturedAt` | `2026-10-29T07:08:13.062Z` |
| `evalRunnerLibVersion` | `1.2-task6` |
| Dataset path | `docs/reports/sdb1560m-eval-suite-draft-v1.json` |
| Dataset SHA-256 | `5bab36e3114852d3154fec6182b53352e0700650e396e4a439d8e25a40afe695` |
| Partition | `verified` |
| `authMode` | `eval_login` |
| Cases executed | 6 (`total`: 6, `not_run`: 0, `infrastructure_error`: 0, `blocked`: 0) |
| Runner summary | pass 4, fail 2 |

**Case IDs in run (order in `report.json`):**  
`num.mass.verified`, `num.dry-power-base.verified`, `mode.regen-shutdown.verified`, `maint.desicc-interval.verified`, `alarm.beep-door.verified`, `para.mass-colloquial.verified`.

**Saved answer payload:** The runner persists **`answerPreview` only** (`truncateAnswer`, max 320 characters in `scripts/sdb1560m-eval-runner-lib.js`). There is no separate full `answer` field in `report.json`. For both failures, the preview is short enough that it matches the complete HTTP response text (byte-for-byte with the chat-gate template or a single-sentence spec answer). Chunk bodies are **not** stored (`_chunkTextCount`: 0 everywhere); `evidenceUsed.hasDebugTrace` is true but trace bodies are not embedded in the report.

---

## 2. Case-level findings

### 2.1 `num.mass.verified`

| Item | Detail |
|------|--------|
| Query | `Какой вес шкафа SDB1560M?` |
| `equipmentId` | `sdb1560m` (eval case config) |
| Expected | `must_answer`; required fact **260 kg** (`F-MASS`) |
| Saved response (`answerPreview`) | `Я отвечаю только по шкафу SDB1560NM и его руководству. Задайте вопрос по эксплуатации, ТТХ, режимам, неисправностям или безопасности этого шкафа.` |
| Runner overall | `fail` / `factual` |
| Factual layer | `missing_or_negated` for `260` + `kg` |
| Retrieval layer | `fail` — expected PDF not in `sources[]` (`weakSourceListOnly`: true) |
| `evidenceUsed.sourceDocs` | `[]` (empty) |
| `hasDebugTrace` | true (trace not serialized in report) |

**Comparison — passing `para.mass-colloquial.verified` (same fact, same run):**

| | Mass (fail) | Colloquial (pass) |
|--|-------------|-------------------|
| Message | `Какой вес шкафа SDB1560M?` | `Тяжёлый? вдвоём поднимем?` |
| Answer | Scope refusal (above) | `Масса Шкафа SDB1560М составляет 260 кг. …` |
| Factual | fail | pass |
| `sourceDocs` | none | `golden-facts-sdb1560m.md`, `Руководство SDB1560NM.pdf` |

**Code-path evidence (pre-RAG chat gate):**

- The refusal string is **identical** to `classifySdb1560mMessage` → `OFF_TOPIC` reply in `src/rag/sdb1560m-chat-gate.js` (lines 40–45).
- `OFF_TOPIC_RE` includes `(?:…|sdb1560|1560|…)` (line 11–12). The mass query contains **`SDB1560M`**, which matches **`sdb1560`** case-insensitively, so the gate returns `action: 'OFF_TOPIC'`, `reason: 'off_topic'` **before** RAG.
- Local invocation (no HTTP): `classifySdb1560mMessage('Какой вес шкафа SDB1560M?')` → `OFF_TOPIC` with that exact reply; `classifySdb1560mMessage('Тяжёлый? вдвоём поднимем?')` → `IN_SCOPE`.
- Equipment profile wires this as `classifyPreGate` in `src/equipment/profiles/sdb1560m.js` — not wrong API equipment routing, but **message-level scope misclassification**.
- Existing profile tests use **`Какой вес?`** without embedding `SDB1560M` in the user text (`scripts/test-sdb1560m-profile.js`), so this regression is **consistent with gate logic but not covered** by the eval case wording.

**Classification (Task 11 A–F):**

| Hypothesis | Verdict |
|------------|---------|
| A — equipment routing / identity normalization | **Supported (partial):** HTTP scope is `sdb1560m`, but **in-message** model token triggers `OFF_TOPIC` — scope/classification failure at pre-gate, not wrong equipment ID on the request. |
| B — retrieval failure | **Not supported as root cause:** empty sources and no chunks are **consistent with pre-gate short-circuit**, not proof that retrieval was attempted and missed mass evidence. |
| C — context selection | **Not supported:** pipeline did not reach context assembly for this message. |
| D — generation failure | **Not supported:** LLM was not required to produce the refusal; it is a deterministic gate reply. |
| E — post-gate | **Not supported:** failure occurs at **pre-gate** (`classifyPreGate`). |
| F — insufficient evidence | **Not needed** for primary cause; secondary gaps below. |

**Primary root cause (confirmed):** Pre-RAG **chat-gate `OFF_TOPIC` false positive** because `OFF_TOPIC_RE` treats substrings `sdb1560` / `1560` as off-topic, including legitimate in-scope equipment mentions.

**Confidence:** **High** (saved answer text + gate source + reproducible local classify + contrast with colloquial case in same baseline).

**Missing evidence (secondary):**

- Per-request `ragTrace` / retrieval payload not stored in `report.json` (would show `mode`/short-circuit explicitly).
- Chat session JSONL for pid `66980` did not yield grep hits for the mass query (logging format or timing not confirmed); not required to establish gate match.

---

### 2.2 `num.dry-power-base.verified`

| Item | Detail |
|------|--------|
| Query | `Мощность в режиме осушения без опций?` |
| `equipmentId` | `sdb1560m` |
| Expected | `must_answer`; **40 W** base dry mode (`F-PWR-DRY`) |
| Saved response (`answerPreview`) | `Максимальная потребляемая мощность Шкафа SDB1560М в режиме осушения без установленных систем подачи азота и подогрева воздуха не более 40 Вт.` |
| Runner overall | `fail` / `factual` |
| Factual layer | `missing_or_negated` for claim `40`, unit `W` |
| Forbidden leakage | pass |
| `evidenceUsed.sourceDocs` | `golden-facts-sdb1560m.md`, `Руководство SDB1560NM.pdf` |
| Retrieval / grounding layers | `not_evaluable` (no chunk text in artifact) |

**Fact registry (Task 1 audit):** `F-PWR-DRY` is **verified** in PDF as «SDB1560М: не более **40 Вт**» (`docs/reports/sdb1560m-facts-and-eval-audit.md`, table row F-PWR-DRY). The saved answer mirrors that regulatory wording (upper bound, not an exact equality claim).

**Checker behavior (confirmed):**

- `evaluateRequiredFact` for numeric patterns filters matches with `isNegatedAt` and **`isNonExactNumericContext`** (`scripts/sdb1560m-eval-runner-lib.js`, lines 207–220, 124–128).
- `isNonExactNumericContext` returns true when the 32 characters before the number match `/не\s+(?:превышает|более|менее)\s+$/iu` — i.e. **«не более »** immediately before **`40`**.
- All numeric matches are therefore excluded from `asserted`; the function returns **`missing_or_negated`** even though **`40 Вт`** is present.
- Local check on the saved answer string: `evaluateRequiredFact({ claimPattern: '40', unit: 'W' }, answer)` → **`fail` / `missing_or_negated`**.
- Task 6 counterexample audit documents the same design: «Масса **не превышает** 260 кг» → fail via `isNonExactNumericContext` (`docs/reports/sdb1560m-eval-runner-counterexample-audit.md`); «не более 40 Вт» is the same mechanism for **40**.

**RAG vs checker:**

| Layer | Assessment |
|-------|------------|
| RAG answer | **Factually acceptable** for the case intent: states base dry power cap **40 W** without forbidden **415** / **810**; aligns with PDF «не более 40 Вт». |
| Runner factual layer | **False negative** for this wording under current deterministic rules. |
| Runner overall `fail` | **Misleading** for production quality on this case; infrastructure and leakage layers do not contradict a good answer. |

**Classification:**

| Option | Verdict |
|--------|---------|
| A — genuine factual error | **Rejected** — answer matches manual upper-bound wording. |
| B — checker false negative | **Confirmed** |
| C — ambiguous / incomplete answer | **Low** — answer is explicit for the asked configuration (without N₂ / air heating options). |
| D — insufficient evidence | **Not needed** for checker; RAG path not fully traced without chunks. |

**Confidence:** **High** for checker false negative; **medium** that end-user quality for this case is **pass** (answer text + sources list; no chunk-level grounding in artifact).

---

## 3. Root-cause table

| case_id | Expected behavior | Actual behavior | Relevant saved evidence | Runner layer & reason | Suspected root cause | Confidence | Missing evidence | Recommended next task |
|---------|-------------------|-----------------|-------------------------|------------------------|----------------------|------------|------------------|------------------------|
| `num.mass.verified` | Answer **260 kg** for SDB1560M | Deterministic **scope refusal** (SDB1560NM-only boilerplate) | `answerPreview`; empty `sourceDocs`; pass on colloquial mass in same run | overall `fail` / factual `missing_or_negated`; retrieval `fail` (sources only) | **Pre-RAG chat gate:** `OFF_TOPIC_RE` matches `sdb1560`/`1560` in query text → no RAG | **High** | Trace JSON in report; chat log line | Narrow fix: adjust `OFF_TOPIC_RE` or gate order so in-scope equipment mentions on scoped chat are not `OFF_TOPIC`; add gate unit test for eval query string |
| `num.dry-power-base.verified` | Assert **40 W** base dry power | Answer states **«не более 40 Вт»**; runner marks fail | Full text in `answerPreview`; sources include PDF + golden | overall `fail` / factual `missing_or_negated` | **Eval heuristic:** `isNonExactNumericContext` rejects «не более» before required number | **High** (checker); **medium** (RAG OK) | Chunk text / trace for retrieval audit | Checker-only: treat PDF-style «не более N» as assertive cap for `must_answer` numeric facts, with counterexamples for true non-answers |

---

## 4. Checker vs RAG distinction

| Failure | Production RAG / gate behavior | Eval runner behavior |
|---------|-------------------------------|----------------------|
| Mass | **Real product issue:** wrong user-visible outcome (refusal instead of spec). | Correctly scores **fail** on missing 260 kg (runner aligns with user harm). |
| 40 W dry | **Likely correct RAG outcome** for the question asked. | **Incorrect fail** on factual layer due to «не более» handling — depresses `answer_factual_accuracy` and regression pass rate in baseline metrics without indicating a RAG regression. |

Baseline headline **66.7% (4/6)** therefore mixes one **true RAG/gate failure** and one **metric artifact**.

---

## 5. Recommended follow-up tasks (not implemented)

### Task 11a — Checker: PDF upper-bound wording (priority 1 if baseline metrics must reflect manual)

- **Scope:** `scripts/sdb1560m-eval-runner-lib.js` only — extend `isNonExactNumericContext` / numeric pass rules so «не более N» / «не превышает N» **with required unit** counts as assertive for `must_answer` cases whose source is PDF cap language; keep fails for «около N», ranges, and contradictions per Task 6 counterexamples.
- **Acceptance:** `evaluateRequiredFact({ claimPattern: '40', unit: 'W' }, saved dry-power answer)` → pass; existing counterexample suite still passes; new unit test for baseline answer string.
- **Regression risk:** Could pass answers that only give an upper bound when the case expects an exact nominal value — mitigate by case metadata or factId allowlist for cap-style facts (`F-PWR-DRY`, etc.).

### Task 11b — Chat gate: mass query with model name (priority 2 — user-facing)

- **Scope:** `src/rag/sdb1560m-chat-gate.js` — remove or narrow `sdb1560|1560` from `OFF_TOPIC_RE`, or skip `OFF_TOPIC` when `equipmentChatScoped` and message is equipment-relevant (eval case message must reach RAG).
- **Acceptance:** `classifySdb1560mMessage('Какой вес шкафа SDB1560M?', { equipmentChatScoped: true })` → `IN_SCOPE`; HTTP repro on `num.mass.verified` returns 260 kg (or abstain with trace), not scope boilerplate; off-topic probes (Python, borscht) still `OFF_TOPIC`.
- **Regression risk:** Weakening off-topic filter for Wattsan/laser spam if `1560` was intentional — need targeted patterns instead of bare model substring.

### Task 11c — Regression test: direct vs colloquial mass (priority 3)

- **Scope:** `scripts/test-sdb1560m-profile.js` or eval-runner unit — assert gate + optional pipeline stub: «Какой вес шкафа SDB1560M?» must not return `OFF_TOPIC` reply; align with eval suite wording.
- **Acceptance:** Fails on current gate; passes after 11b.
- **Regression risk:** Low if tied to scoped chat only.

---

## 6. Evidence gaps (remaining)

1. **No chunk-level retrieval record** in baseline artifacts — cannot rank retrieval vs generation for passing cases or dry-power beyond `sourceDocs` names.
2. **No persisted full HTTP trace** in `report.json` — gate short-circuit for mass is inferred from empty sources + reply template + code, not from a stored `ragTrace.mode` field in the artifact.
3. **Server env fingerprint** in manifest shows `RAG_HONEST_EQUIPMENT` / `RAG_PURE` as `unknown` (runner does not probe server env post-hoc); portal logs from the operator session are out of scope for this task.

---

## 7. Explicit non-actions (Task 11)

- Did **not** re-run baseline or alter `logs/baseline-task9/http-run-20261029-r2/`.
- Did **not** modify production RAG, prompts, datasets, tests, `.env`, DB, or index.
- Did **not** claim the RAG system is fixed or that quality improved — diagnosis only.
