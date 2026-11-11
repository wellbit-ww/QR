# Task 25 — First Production RAG Quality Improvement for SDB1560NM

**Date:** 2026-11-02  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged)  
**Status:** **HTTP verified — improvement after portal restart** (**29/32**, **90.6%** factual accuracy).

**Authoritative baseline:** `logs/baseline-task25/http-verified-20261102-v2-r2/` · captured **2026-11-02T05:54:52Z** · infra **0**.

**Evaluator / suite:** **not modified** (remains v2 + `1.5-task23`).

---

## 1. Initial state

- Working tree was already dirty (pre-existing `src/rag/*`, docs, logs, etc.).
- Task 25 adds targeted production RAG changes only; no `git reset`, commit, or overwrite of Task 24 r2 / Task 18 baselines.

**Reference baseline (unchanged):** Task 24 r2 — `logs/baseline-task24/http-verified-20261102-v2-r2/` — **25/32 (78.1%)**, seven known RAG failures.

**Stale HTTP artifact (portal not restarted):** `logs/baseline-task25/http-verified-20261102-v2/` — **25/32**, identical to Task 24 r2 — **not** used for quality claims.

---

## 2. Root cause (evidence)

| Finding | Evidence |
|---------|----------|
| Honest mode **does not** use full `sdb1560m-direct-facts` TTX FAQ | `sdb1560m.js` → `tryHonestWhitelistedDeterministicAnswer` only (`honest-rag-deterministic.js`) |
| Wrong **810 W** on base storage question | Task 24 answer text; merged §1.1.2.7 context; no `ragPureSdb1560AnswerOffTopic` rule for 810 vs 8 W |
| **405 W** typo in direct-facts for 1560 optional storage | `sdb1560m-direct-facts.js` (corrected to **810 W** per PDF/golden) |
| RH / warmup / ambient / indicators fail post-gate | LLM hedging → eval `isAbstainLike`; weak **contextual extract** coverage for those query shapes |
| Warmup paraphrase missed | `isSdb1560mHumidityWaitQuery` did not match «выходит на влажность» |
| `chunkTextCount: 0` in eval | `extractSources()` omits chunk bodies — **artifact limit**, not proof of empty retrieval |
| Live code not loaded | Pre-restart HTTP run matched Task 24 r2 byte-for-byte on most controls |

**Hypothesis:** Reground via **honest contextual extract** + **off-topic detection** + **prompt/disambiguation** when LLM picks wrong tier or abstains despite golden/PDF in context.

---

## 3. Changes (production RAG)

| File | Change |
|------|--------|
| `src/rag/honest-contextual-extract.js` | New extract kinds: `rh_range`, `warmup`, `ambient_temp`, `indicator_drying`, `w_symbol`, `load_humidity`; stricter **8 W** storage extract; treat spurious abstain as weak prior; pass `message` into extract |
| `src/rag/honest-rag-mode.js` | `ragPureSdb1560AnswerOffTopic` / retry: **810 vs 8 W**, RH **0–80**, ambient **+35**, **W**/подогрев; fix warmup Cyrillic pattern |
| `src/rag/synthesis/sdb1560-grounding-contract.js` | `buildGoldenRetryFocusHint` for seven control themes |
| `src/rag/sdb1560m-rag-priority.js` | Broader **humidity wait** paraphrase |
| `src/rag/sdb1560m-prompt-rules.js` | Warmup prompt trigger paraphrase |
| `src/rag/sdb1560m-direct-facts.js` | **810 W** (not 405) for optional storage; **8 W only** rule for plain storage questions (non-honest / post-gate path) |
| `src/rag/prompts/index.js` | `resolveNormalIndicatorMode` for **SDB1560M**; **8 W** storage disambiguation block (like 1106) |

**Not changed:** eval runner, suite JSON, golden facts file, Qdrant, `.env`, portal auth.

---

## 4. Pipeline effect (summary)

1. **Retrieval** — unchanged indexing; existing section hints / golden boosters still apply.
2. **Generation** — stronger composition blocks for 1560 indicators and storage power.
3. **Post-gate / RAG PURE** — if answer is off-topic (e.g. **810 W** without **8 W**) or spurious abstain, **grounding contract** regrounds; **`tryHonestContextualNumericFact`** can **replace** LLM output with corpus-backed answers from golden + PDF text in context.

---

## 5. Tests

| Command | Exit |
|---------|------|
| `node scripts/test-sdb1560m-task25-rag-control.js` | **0** |
| `node scripts/test-sdb1560m-task23-eval-repair.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** |
| Counterexamples | **0** |

New: `scripts/test-sdb1560m-task25-rag-control.js` — seven control queries + 810 off-topic + direct **8 W**.

---

## 6. Seven control scenarios (offline expectation)

| Case ID | Offline extract / retry expectation |
|---------|-------------------------------------|
| `exp.num.pwr-storage-8` | Contextual **8 W**; off-topic **810** triggers reground |
| `exp.num.rh-range` | **0–80 %RH** extract |
| `exp.para.warmup-plain` | **180 min / 3 h** extract |
| `exp.env.temp-range` | **+15…+35 °C** extract |
| `exp.alarm.red-lamp` | **Осушение** / §1.1.4.3.3 extract |
| `exp.alarm.rh-rise-loading` | **1.1.4.4.1** / ventilator procedure extract |
| `exp.alarm.w-display` | **подогрев** / W symbol extract |

---

## 7. HTTP verification (operator runs)

### 7.1 Pre-restart (stale process)

**Artifact:** `logs/baseline-task25/http-verified-20261102-v2/` · **2026-11-02T05:49:37Z**

| Metric | Value |
|--------|------:|
| Pass / fail | **25 / 32** |
| vs Task 24 r2 | **No change** (same seven fails) |

**Conclusion:** Node had **not** loaded Task 25 modules. Preserved for audit only.

### 7.2 Post-restart (authoritative)

**Artifact:** `logs/baseline-task25/http-verified-20261102-v2-r2/` · **2026-11-02T05:54:52Z**

| Metric | Task 25 r2 | Task 24 r2 | Δ |
|--------|----------:|----------:|--:|
| Pass / fail | **29 / 32** | **25 / 32** | **+4 pass** |
| Factual accuracy | **90.6%** | **78.1%** | **+12.5 pp** |
| Infra | **0** | **0** | — |

**Seven control cases on HTTP (r2):**

| Case ID | Task 24 r2 | Task 25 r2 |
|---------|------------|------------|
| `exp.num.pwr-storage-8` | fail (**810 W**) | **pass** (8 Вт) |
| `exp.num.rh-range` | fail | **pass** |
| `exp.para.warmup-plain` | fail | **pass** |
| `exp.env.temp-range` | fail | **pass** |
| `exp.alarm.red-lamp` | fail | **fail** (abstain-like; no **Осушен**/§) |
| `exp.alarm.rh-rise-loading` | fail | **fail** (generic «нормально»; no **1.1.4.4.1** / ventilator) |
| `exp.alarm.w-display` | fail | **fail** (hedge; no **подогрев** in checker sense) |

**Remaining three failures (all alarm / troubleshooting):** only factual-layer fails in this run; leakage **0/7**.

---

## 8. Comparison with Task 24 (summary)

| | Task 24 r2 | Task 25 HTTP (r2) |
|--|------------|-------------------|
| HTTP pass rate | **25/32** | **29/32** |
| Seven controls pass | **0/7** | **4/7** |
| Production code | Unchanged | **RAG modules (§3)** |
| Evaluator | v2 + 1.5-task23 | Unchanged |
| Portal restart required | — | **Yes** (proven by v2 vs r2) |

---

## 9. Limitations

- Offline tests use **synthetic corpus** snippets; live retrieval must still deliver §1.1.2.x / §1.1.4.x text.
- **Alarm trio** still relies on LLM + weak extract for §1.1.4.3.3 / §1.1.4.4.1 / **W** symbol — reground or indicator extract not winning on HTTP for those shapes.
- Eval **chunkTextCount** stays **0** until runner/server expose source `content` (separate observability task).
- Pre-restart baseline **must not** be cited as Task 25 outcome.

---

## 10. Recommended next step

1. **Task 26 (or follow-up):** extend **honest contextual extract** + **off-topic / abstain reground** for:
   - `exp.alarm.red-lamp` — force **Осушение** / §1.1.4.3.3 from context;
   - `exp.alarm.rh-rise-loading` — **1.1.4.4.1** door/ventilator procedure, not generic RH reassurance;
   - `exp.alarm.w-display` — **подогрев** + **W** (not abstain-like hedge).
2. Re-run HTTP to a **new** `--out=` dir after changes; keep **r2** as Task 25 proof baseline.
3. Optional: one ad-hoc probe per failing ID with `ragTrace` before next full suite run.

---

## 11. Verdict

| | |
|--|--|
| Production RAG changed? | **Yes** (see §3) |
| Linked to Task 24 failures? | **Yes** — **4/7** controls fixed on HTTP after restart |
| HTTP pass rate vs Task 24 r2? | **29/32 (+4)** vs **25/32** |
| Seven controls on HTTP? | **4 pass, 3 fail** (alarm cases only) |
| Restart required? | **Yes** — without it, metrics stayed at 25/32 |
| User dirty tree preserved? | **Yes** (no reset/clean/commit) |

**Task 25 goal (first measurable RAG gain on verified HTTP):** **met** for numeric/env/paraphrase controls; **alarm troubleshooting** remains open work.
