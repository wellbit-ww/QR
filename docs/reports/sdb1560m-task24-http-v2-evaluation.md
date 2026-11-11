# Task 24 — Authoritative HTTP Evaluation on SDB1560NM Suite v2

**Date:** 2026-11-02  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Status:** **COMPLETE** — authoritative baseline on operator run **r2**; agent infra attempt retained separately.

**Production RAG / portal:** **not modified** in Task 24.

---

## 1. Objective and execution environment

Post–Task-23 HTTP baseline on **suite v2** + runner **1.5-task23**, same endpoint and operator auth as Task 22 r2 (`http://127.0.0.1:3000`, `eval_login`).

| Item | Value |
|------|--------|
| Authoritative artifact | `logs/baseline-task24/http-verified-20261102-v2-r2/` |
| Captured at (UTC) | `2026-11-02T05:34:08.587Z` |
| Infra-only artifact (agent) | `logs/baseline-task24/http-verified-20261102-v2/` — 32× `missing_credentials` |

---

## 2. Step A — Input verification (passed)

| Check | Expected | Result |
|-------|----------|--------|
| Suite v2 SHA-256 | `c628bf86d22405f4408f76e5c5a18ff720c44f395f1c72bee20f3183095b2f3a` | **Match** |
| Task 22 r2 report SHA-256 | `18d3b8ed350d400a9ce1fb62ea5edbfbb8b3e231b38f0559b4b0cef66611fa03` | **Match** (unchanged after Task 24) |
| Runner | `1.5-task23` | **Match** |
| Verified cases | 32 | **32** |

---

## 3. Step B — HTTP execution

### 3.1 Authoritative run (operator, terminal 43)

```powershell
node scripts/run-sdb1560m-eval-v1.js `
  --allow-http `
  --partition=verified `
  --dataset=docs/reports/sdb1560m-eval-suite-expanded-v2.json `
  --out=logs/baseline-task24/http-verified-20261102-v2-r2
```

| Field | Value |
|-------|--------|
| `authMode` | **`eval_login`** |
| `EVAL_BASE_URL` | `http://127.0.0.1:3000` |
| Process exit code | **1** (cases failed checker — expected) |
| `evalRunnerLibVersion` | `1.5-task23` |
| Dataset SHA-256 | `c628bf86…` |

### 3.2 Agent attempt (no credentials)

Same command with `--out=logs/baseline-task24/http-verified-20261102-v2` → **32 infrastructure_error**; preserved for audit only.

---

## 4. Step C — Aggregate metrics (authoritative r2)

| Metric | Task 24 r2 (v2 + 1.5) | Task 22 r2 (v1 + 1.4) |
|--------|----------------------:|----------------------:|
| Total | 32 | 32 |
| Infrastructure errors | **0** | **0** |
| Overall pass | **25 / 32 (78.1%)** | **21 / 32 (65.6%)** |
| Factual-layer pass | **25 / 32 (78.1%)** | **23 / 32 (71.9%)** |
| Failed (checker) | **7** | **11** |
| Leakage fails | **0 / 7 eligible** | 1 |

**Interpretation:** **+4 overall passes** vs Task 22 align with **four Task 23 eval fixes** (same HTTP answers on those cases; see §6). **Not** evidence of RAG improvement on the seven product failures — previews match Task 22 for six of seven.

**Limitations:** all cases **`chunkTextCount: 0`**; retrieval vs generation **undetermined**; `answerPreview` max 320 chars.

---

## 5. Failed cases (7) — authoritative r2

| Case ID | Question (short) | Failed layer | Assertion | Preview (trunc.) | Sources (names) | Chunks |
|---------|------------------|--------------|-----------|------------------|-----------------|--------|
| `exp.num.pwr-storage-8` | W in storage mode | factual | missing **8 W** | …хранения **810 Вт** | golden + PDF | 0 |
| `exp.num.rh-range` | RH range | factual | missing **0**, **80** | …не более **30%** | golden + PDF | 0 |
| `exp.para.warmup-plain` | warmup time | factual | abstain-like | «не указано» время | golden + PDF | 0 |
| `exp.env.temp-range` | room temp | factual | abstain-like | **+15 °C**; upper «не указана» | golden + PDF | 0 |
| `exp.alarm.red-lamp` | blinking red lamp | factual | abstain-like | «нет … информации» | golden + PDF | 0 |
| `exp.alarm.rh-rise-loading` | RH after load | factual | missing §/ventilator pattern | «Да, нормально…» | golden + PDF | 0 |
| `exp.alarm.w-display` | W on display | factual | abstain-like | denies error; no **подогрев** | golden + PDF | 0 |

**Classification:** all **factual / generation** from checker view; **not** retrieval-layer fails. **Pipeline stage:** **undetermined** (no chunk bodies in artifact).

---

## 6. Step D — Comparison with Task 22 r2

### 6.1 Four Task 23 evaluation-defect cases — **all pass on Task 24 r2**

| Case ID | Task 22 r2 | Task 24 r2 | Answer vs Task 22 | Cause of delta |
|---------|------------|------------|-------------------|----------------|
| `exp.num.mass.direct` | fail (retrieval) | **pass** | Same **260 kg** preview | **Eval** — source-doc regex fixed |
| `exp.num.rh-accuracy` | fail (factual) | **pass** | Same **± 1RH%** | **Eval** — claim regex fixed |
| `exp.num.n2-timer-99` | fail (factual) | **pass** | Same **99.9 min** | **Eval** — **99.9** + unit |
| `exp.num.pwr-storage-with-opt-810` | fail (forbidden) | **pass** | Same **810 W** line | **Eval** — bounded forbidden **8** |

Mass retrieval pattern behaves correctly. RH accuracy accepts documented ±1 RH%. N2 requires **99.9** with **min**. **810 W** does not false-trigger forbidden **8** (offline unit test still covers true **8 W** rejection).

### 6.2 Seven prior RAG failures

| Case ID | Task 24 r2 | vs Task 22 answer | Classification |
|---------|------------|-------------------|----------------|
| `exp.num.pwr-storage-8` | fail | **Same** preview (810 vs 8 W) | **Still failing** |
| `exp.num.rh-range` | fail | **Same** (30% vs 0–80) | **Still failing** |
| `exp.para.warmup-plain` | fail | **Same** abstain | **Still failing** |
| `exp.env.temp-range` | fail | **Same** (+15, no 35) | **Still failing** |
| `exp.alarm.red-lamp` | fail | Wording slightly different; still no **Осушен**/§ | **Still failing** |
| `exp.alarm.rh-rise-loading` | fail | **Same** gist; missing procedure cues | **Still failing** (partial semantics OK) |
| `exp.alarm.w-display` | fail | Wording slightly different; still no **подогрев** | **Still failing** |

**None resolved** on HTTP. **No** case passes checker due to RAG change between Task 22 and Task 24 runs.

### 6.3 Pass-rate delta summary

| Source of +4 overall passes | Count |
|----------------------------|------:|
| Eval/suite/checker (Task 23) | **4** |
| RAG product improvement | **0** |

Task 22 had **2** extra factual passes vs overall (factual 23 vs pass 21); Task 24 r2 **aligns** factual and overall at 25 — eval fixes removed false factual/retrieval/forbidden fails without changing answers.

---

## 7. Remaining evaluation limitations

- No chunk text or persisted `ragTrace` in `report.json`.
- Do not infer retrieval from `sourceDocs` filenames alone.
- Full answers not stored; abstain-like failures may depend on text beyond 320-char preview.

---

## 8. Step E — Integrity verification

| Artifact | SHA-256 |
|----------|---------|
| Suite v2 | `c628bf86d22405f4408f76e5c5a18ff720c44f395f1c72bee20f3183095b2f3a` (**unchanged**) |
| Task 22 r2 `report.json` | `18d3b8ed350d400a9ce1fb62ea5edbfbb8b3e231b38f0559b4b0cef66611fa03` (**unchanged**) |
| Task 24 r2 `report.json` | `b81fd4d1535a5a678c58e99309b66ac78f167dd0eaadf8abac0272b56140265e` |
| Task 24 infra `report.json` | `9a6ea39d81ffe28e6f184f496edbf8a5d65f99a6c0dec970490f417176c454b1` |

**Task 24 outputs:** `logs/baseline-task24/http-verified-20261102-v2-r2/` (authoritative), `…-v2/` (infra), this report.

**Untouched:** Task 18 / Task 9–21 baselines, suite v1/v2 content, eval runner, `src/rag/*`, credentials in artifacts.

---

## 9. Recommended next task

1. **RAG product task** — seven failing intents (storage **8 W** line, RH **0–80**, warmup **180 min**, env **15–35 °C**, red lamp / W symbol / load procedure depth).
2. Optional **eval observability** (Task 23 design) before blaming retrieval.
3. Optional suite hygiene — other v1 over-escaped regexes (warmup `3\s*ч`, alarm § patterns) not bulk-fixed in v2.

---

## 10. Verdict

| Question | Answer |
|----------|--------|
| Task status | **COMPLETE** (operator r2) |
| Authoritative v2 HTTP baseline | `logs/baseline-task24/http-verified-20261102-v2-r2/` |
| Overall pass | **25/32 (78.1%)** |
| Factual pass | **25/32 (78.1%)** |
| Infrastructure errors (r2) | **0** |
| Four eval-defect cases | **4/4 pass** (eval change only) |
| Seven RAG cases | **7/7 still fail** |
| Production RAG touched? | **No** |

Pass rate increase vs Task 22 is **explained by corrected evaluation**, not by measured RAG improvement on the seven known misses.
