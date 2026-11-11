# Task 16 — Restart Verification and Targeted Mass Regression

**Date:** 2026-10-29  
**Branch:** `backup/sova-portal`  
**Git HEAD (before/after):** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged)

**Confirmation:** No commit, destructive git ops, RAG/pipeline/suite/`.env`/DB/index changes, or credential logging. Task 9 / Task 15 baselines not overwritten. **Operator HTTP run** recorded in §12 (`logs/baseline-task16/http-mass-20261029/`). Agent did not restart the portal.

---

## 1. Git and working tree

| Item | Value |
|------|--------|
| Branch | `backup/sova-portal` |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Tree | Dirty (pre-existing modifications + untracked files preserved) |

Task 12 wiring confirmed: `sdb1560mProfile.classifyPreGate` → `classifySdb1560mMessage(..., { equipmentChatScoped: true })` in `src/equipment/profiles/sdb1560m.js`.

---

## 2. Task 15 mass failure — artifact evidence (confirmed)

**Path:** `logs/baseline-task15/http-run-20261029/`  
**Manifest:** `capturedAt` `2026-10-29T07:38:12.118Z`, `evalRunnerLibVersion` **`1.3-task13`**, `authMode` **`eval_login`**, mode `http`.

### `num.mass.verified`

| Field | Value |
|-------|--------|
| Query | `Какой вес шкафа SDB1560M?` |
| **answerPreview** | `Я отвечаю только по шкафу SDB1560NM и его руководству. Задайте вопрос по эксплуатации, ТТХ, режимам, неисправностям или безопасности этого шкафа.` |
| **overall** | `fail` / `factual` |
| **factual** | `fail` — `missing_or_negated` for `260` + `kg` |
| **retrieval** | `fail` — expected PDF not in `sources[]` (`weakSourceListOnly: true`) |
| **grounding** | `not_evaluable` |
| **evidenceUsed.sourceDocs** | `[]` |
| **chunkTextCount** | `0` |
| **hasDebugTrace** | `true` (trace payload **not** embedded in `report.json`) |

### Identity with Task 11 refusal template

**Confirmed:** Task 15 `answerPreview` is **byte-for-byte identical** to Task 9 mass preview and to the `OFF_TOPIC` `reply` string in current `sdb1560m-chat-gate.js` (line 56).

**Confirmed:** Same case in Task 9 (`logs/baseline-task9/http-run-20261029-r2/`) — identical preview and layer pattern.

**Unavailable in artifact:** Full HTTP response body beyond `answerPreview` (320-char cap); `ragTrace` / gate action fields not serialized in saved report.

---

## 3. Current gate source — focused tests (confirmed)

Task 12 split: `matchesOffTopic(text, equipmentChatScoped)` — `sdb1560|1560` only when **not** scoped.

**Command:**

```text
node -e "…"  (Task 16 focused gate assertions — 6 positive/negative cases)
```

**Exit code:** **0** (`task16 gate focused: OK`)

| Query (scoped) | Expected | Local result |
|----------------|----------|--------------|
| `Какой вес шкафа SDB1560M?` | IN_SCOPE | **IN_SCOPE** |
| `Какой вес?` | IN_SCOPE | **IN_SCOPE** |
| `Тяжёлый? вдвоём поднимем?` | IN_SCOPE | **IN_SCOPE** |
| `Напиши программу on Python` | OFF_TOPIC | **OFF_TOPIC** |
| `Как приготовить борщ?` | OFF_TOPIC | **OFF_TOPIC** |
| `Где купить Wattsan sdb1560 …` | OFF_TOPIC | **OFF_TOPIC** |

For mass query with scoped flag, local classifier **does not** return the refusal reply (`reply` undefined on IN_SCOPE).

**Full profile suite:** **Not rerun** in Task 16 (prior failure at line 143 unrelated to gate). Prior result: exit **1** (RH% deterministic assertion).

---

## 4. Running portal process (confirmed facts + likely explanation)

| Observation | Value |
|-------------|--------|
| Listener | `127.0.0.1:3000` |
| **PID** | **66980** |
| **Command line** | `node scripts/start-portal.js` |
| **Process start (local)** | **2026-10-29 10:06:53** |
| **`sdb1560m-chat-gate.js` LastWriteTime** | **2026-10-29 10:26:09** (+03:00) |
| Task 15 HTTP run (local) | **~10:38:12** (+03:00, from manifest UTC) |

**Confirmed fact:** Gate file was modified **~19 minutes after** the portal process started.

**Likely explanation (high confidence, not directly observed in-process):** Node.js loaded the **pre–Task 12** gate module at startup and kept it in memory; HTTP at 10:38 still executed **old** `OFF_TOPIC_RE` behavior matching the refusal text, while **on-disk** source and **fresh** `require()` in a new CLI process use Task 12 logic.

**Unverified hypothesis:** No memory dump or module source inspection of PID 66980 was performed.

**Agent restart:** **Did not occur.** Controlled restart requires operator (see §6).

---

## 5. HTTP regression — agent vs operator

| Phase | Status |
|-------|--------|
| Agent session | **Not executed** (no `EVAL_*` in agent shell) |
| **Operator run** | **Executed** — see **§12** |

Single-case runner flag remains **not supported**; operator ran full `verified` partition (6 cases).

---

## 6. Operator procedure (restart + regression)

1. **Stop** portal in the terminal running `npm start` (**Ctrl+C**). Confirm PID **66980** (or current listener) is gone.
2. **Start** fresh: `npm start` from repo root (loads current `sdb1560m-chat-gate.js`).
3. **Same PowerShell** as credentials:

```powershell
cd C:\Users\SOVAI\Documents\Work\QR
$env:EVAL_BASE_URL = "http://127.0.0.1:3000"
# … EVAL_LOGIN / EVAL_PASSWORD as in Task 15 …

node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --out=logs/baseline-task16/http-mass-20261029
```

Use a **new suffix** if directory exists. Inspect **`num.mass.verified`** in `report.json` only for acceptance (six cases will run).

**Acceptance:** Mass answer must **not** be the deterministic scope refusal; ideally contains **260 kg** with unit. **Not claimed fixed in Task 16** until that HTTP artifact exists.

---

## 7. Response interpretation rules (for post-restart run)

| Class | Criteria |
|-------|----------|
| **A — 260 kg** | Refusal gone; checker factual pass likely; grounding still **not_evaluable** without chunks |
| **B — Same refusal** | Investigate wrong process, wrong equipment route, or gate not scoped — compare to local `classifySdb1560mMessage` |
| **C — Other answer** | Gate likely passed; diagnose retrieval/generation from trace if available |
| **D — Infra** | Separate from product quality |

---

## 8. Regression checks (executed)

| Command | Exit code |
|---------|-----------|
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **0** |
| `EVAL_RUNNER_LIB_VERSION` | **`1.3-task13`** |

**Frozen artifacts:** Task 9 and Task 15 directories not modified by this task.

---

## 9. Before/after comparison (Task 15 vs Task 16 mass case)

| | Task 15 (`http-run-20261029`) | Task 16 (`http-mass-20261029`) |
|---|-------------------------------|--------------------------------|
| **answerPreview** | Scope refusal boilerplate | **`Вес шкафа SDB1560M составляет 156 кг.`** |
| Gate refusal gone? | No | **Yes (confirmed)** |
| **260 kg** required | No | **No** (156 kg — wrong) |
| **factual** | fail | fail |
| **retrieval** | fail (no PDF in sources) | **pass** (weak; golden + PDF in `sourceDocs`) |
| **sourceDocs** | `[]` | golden + PDF |

**Same run, colloquial mass (`para.mass-colloquial.verified`):** **260 kg** — **pass** (Task 16 preview confirms correct mass on paraphrase).

**Interpretation (Task 16 §7 class C):** Gate allowed the direct mass query through; RAG ran. Failure is **product quality** (wrong numeric answer), not pre-gate scope. **Likely** conflation of model token **1560** with mass **156 kg** — **medium** confidence; chunk text not in artifact to confirm grounding.

**Stale-process hypothesis:** **Supported** by refusal disappearing after operator restart + Task 16 HTTP; not re-proven by PID inspection on post-restart process.

---

## 10. Recommended next action

1. **Gate (Task 12):** Treat as **verified** for scoped chat after restart — do **not** widen `OFF_TOPIC_RE` again without new evidence.
2. **Direct mass query:** New scoped task — diagnose **156 vs 260** (generation, prompt, retrieval context, model-number anchoring); compare successful colloquial path in same `report.json`.
3. Optional: runner `--case-id=` for single-case HTTP; persist `ragTrace.gateAction` in eval artifacts for future gate regressions.

---

## 11. Fact vs hypothesis summary

| Statement | Status |
|-----------|--------|
| Task 15 mass preview = Task 11 OFF_TOPIC template | **Confirmed** |
| On-disk gate classifies mass + scoped as IN_SCOPE | **Confirmed** |
| Portal PID started before gate file mtime (pre-restart) | **Confirmed** (§4) |
| Stale Node module caused Task 15 mass refusal | **Likely** → **supported** by Task 16 refusal disappearing |
| Deterministic scope refusal gone after restart | **Confirmed** (Task 16 HTTP) |
| Direct mass returns verified **260 kg** | **Not met** — **156 kg** in Task 16 |
| Runner pass = semantic correctness | **No** — colloquial pass vs direct fail in one run |

---

## 12. Operator post-restart HTTP baseline (addendum)

**Command (operator, terminal with credentials):**

```powershell
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --out=logs/baseline-task16/http-mass-20261029
```

**Exit:** process completed; summary printed **pass 5 / fail 1**.

### Artifact identity

| Field | Value |
|--------|--------|
| Path | `logs/baseline-task16/http-mass-20261029/` |
| `capturedAt` | `2026-10-29T07:47:16.760Z` |
| `evalRunnerLibVersion` | **1.3-task13** |
| `authMode` | **eval_login** |
| Suite SHA-256 | `5bab36e3114852d3154fec6182b53352e0700650e396e4a439d8e25a40afe695` |
| Summary | pass **5**, fail **1**, infra **0**, blocked **0** |

### `num.mass.verified` (primary acceptance)

| Field | Value |
|-------|--------|
| Query | `Какой вес шкафа SDB1560M?` |
| **answerPreview** | `Вес шкафа SDB1560M составляет 156 кг.` |
| **overall** | `fail` / `factual` |
| **factual** | fail — missing **260** (`missing_or_negated`) |
| **forbiddenLeakage** | pass |
| **retrieval** | pass (weak — source list only) |
| **grounding** | not_evaluable |
| **sourceDocs** | `golden-facts-sdb1560m.md`, `Руководство SDB1560NM.pdf` |
| **hasDebugTrace** | true (body not in report) |

**Task 16 primary criterion (refusal gone):** **Met.**  
**Ideal criterion (260 kg):** **Not met** — classify as **generation / factual answer error**, not gate.

### Other five cases (same run)

| Case ID | Overall | Notes |
|---------|---------|--------|
| `num.dry-power-base.verified` | pass | «не более 40 Вт» (unchanged vs Task 15) |
| `mode.regen-shutdown.verified` | pass | Regeneration prohibition |
| `maint.desicc-interval.verified` | pass | 36 months |
| `alarm.beep-door.verified` | pass | Door beep norm |
| `para.mass-colloquial.verified` | pass | **260 kg** in preview |

### Task 16 completion (updated)

| Criterion | Status |
|-----------|--------|
| Document verification + blockers | **Yes** |
| Post-restart HTTP artifact | **Yes** (`logs/baseline-task16/…`) |
| Gate refusal removed on direct mass | **Confirmed** |
| Full mass fact correct on direct query | **No** — follow-up RAG task |

**Frozen baselines:** `logs/baseline-task9/http-run-20261029-r2/` and `logs/baseline-task15/http-run-20261029/` unchanged.
