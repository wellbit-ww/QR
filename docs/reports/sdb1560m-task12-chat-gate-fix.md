# Task 12 — Minimal SDB1560M Chat-Gate Fix

**Date:** 2026-10-29  
**Git HEAD (unchanged):** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Branch:** `backup/sova-portal` (dirty working tree preserved; no commit, no destructive git ops)

**Confirmation:** No production HTTP baseline, `--allow-http` eval, ingest, provisioning, database/index mutation, `.env` changes, or RAG retrieval/generation/prompt changes. Eval runner (`sdb1560m-eval-runner-lib.js`) not modified.

---

## 1. Root cause and correction

**Root cause (Task 11):** `OFF_TOPIC_RE` included `(?:sdb1560|1560)`, so in equipment chat the query `Какой вес шкафа SDB1560M?` matched `sdb1560` and received the deterministic scope refusal before RAG.

**Correction:** Split off-topic detection in `src/rag/sdb1560m-chat-gate.js`:

- `OFF_TOPIC_ALWAYS_RE` — same patterns as before **except** `sdb1560|1560` (Python, borscht, Wattsan, laser, etc.).
- `OFF_TOPIC_UNSCOPED_EXTRA_RE` — `(?:sdb1560|1560)` applied **only when `equipmentChatScoped` is false**.
- `matchesOffTopic(text, equipmentChatScoped)` used from `classifySdb1560mMessage`.

Production path: `sdb1560mProfile.classifyPreGate` always passes `{ equipmentChatScoped: true }` (`src/equipment/profiles/sdb1560m.js`), so model-specific spec questions reach `IN_SCOPE`. Unscoped calls (rare tests/tools) keep the stricter rule for bare `sdb1560`/`1560`.

No hardcoded `260 kg` answer; no bypass of auth, retrieval, or post-gates.

---

## 2. Files changed

| File | Change |
|------|--------|
| `src/rag/sdb1560m-chat-gate.js` | Split regex; `matchesOffTopic`; wire `equipmentChatScoped` |
| `scripts/test-sdb1560m-profile.js` | Task 12 regression block (scoped positive/negative cases) |
| `docs/reports/sdb1560m-task12-chat-gate-fix.md` | This report |

---

## 3. Classifier results (after fix)

Context: `{ equipmentChatScoped: true }` unless noted.

| Query | action / reason |
|-------|----------------|
| `Какой вес шкафа SDB1560M?` | **IN_SCOPE** / `equipment_chat_scoped` (no scope refusal reply) |
| `Какой вес?` | **IN_SCOPE** |
| `Тяжёлый? вдвоём поднимем?` | **IN_SCOPE** |
| `Какие габариты шкафа SDB1560M?` | **IN_SCOPE** |
| `Напиши программу на Python` | **OFF_TOPIC** / `off_topic` |
| `Как приготовить борщ?` | **OFF_TOPIC** |
| `Где купить Wattsan sdb1560 для лазерной резки?` | **OFF_TOPIC** (via `wattsan` / laser patterns) |
| `Сколько стоит токарный станок 1560?` | **OFF_TOPIC** (via `токарн`) |
| `Какой вес шкафа SDB1560M?` **without** scoped flag | **OFF_TOPIC** (legacy unscoped behavior preserved) |

**Before fix (Task 11 baseline):** scoped mass-with-model → **OFF_TOPIC** with the SDB1560NM-only boilerplate reply.

**Defect reproduction:** Not reverted in git (would violate preserve-dirty-tree). Behavior before fix is documented in Task 11 and baseline `answerPreview` for `num.mass.verified`.

---

## 4. Commands and exit status

| Command | Exit code | Result |
|---------|-----------|--------|
| `node -e "…"` Task 12 gate regression block (isolated assertions) | **0** | OK |
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** | OK |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **0** | OK |
| `node scripts/test-sdb1560m-profile.js` | **1** | Fails at **line 143** (deterministic RH% answer vs regex `/RH%п \+ 1 RH%/u`) — **unrelated to chat gate**; predates this task’s edits (failure occurs before the new gate block at ~line 227). Not fixed in Task 12 per scope. |

---

## 5. Git / tree preservation

- `git rev-parse HEAD` → `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged).
- Pre-existing modified/untracked files untouched except the two intended paths above + this report.
- `git diff --stat` for Task 12 code: `sdb1560m-chat-gate.js` +19/−4 lines; `test-sdb1560m-profile.js` +26 lines.

---

## 6. Limitations and risks

1. **Unit tests ≠ HTTP:** Passing gate tests do **not** prove `num.mass.verified` passes a new baseline (RAG must still retrieve/generate 260 kg). Only the false refusal at pre-gate is removed.
2. **Unscoped API:** Callers that invoke `classifySdb1560mMessage` without `equipmentChatScoped: true` still treat `sdb1560`/`1560` as off-topic.
3. **Bare `1560` on scoped chat:** A message containing only unrelated `1560` (e.g. price) with no `токарн`/`wattsan`/recipe tokens may now be **IN_SCOPE** and reach RAG; mitigated by keeping `OFF_TOPIC_ALWAYS_RE` and counterexamples for laser/Wattsan/tokar.
4. **Full profile script:** Entire `test-sdb1560m-profile.js` does not exit 0 on current dirty tree due to an existing deterministic-answer assertion (line 143), not introduced by Task 12.

---

## 7. Recommended follow-up

- Re-run authenticated eval partition `verified` (or at least `num.mass.verified`) over HTTP when operator-ready — separate from Task 12.
- Task **11a** (eval checker «не более 40 Вт») remains outstanding.
