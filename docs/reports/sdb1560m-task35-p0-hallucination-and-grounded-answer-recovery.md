# Task 35 — SDB1560NM P0 Hallucination Prevention & Grounded Answer Recovery

**Branch:** `backup/sova-portal`  
**HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14`  
**Eval runner:** `1.7-task33` (unchanged)  
**Baseline reference:** Task 33 HTTP v9/v10  
**Commit:** none (per task constraints)

**HTTP (operator):** Task 27 **32/32** (`task27-regression-http-v11`); Task 28 **58/110** (`task28-generalization-http-v12`); must_abstain **11/17**; leakage **0/20**; infra **0**.

## 1. Git / working tree

- Pre snapshot: `logs/baseline-task35/pre-task35-status.txt`
- Post snapshot: `logs/baseline-task35/post-task35-status.txt`
- Working tree remains **dirty**; no `reset` / `clean` / `stash`.

## 2. Confirmed failures addressed in code

| ID | Issue | Confirmed? | Fix |
|---|---|:---:|---|
| `gen.unsup.internal-volume-liters` | Asserted **1 896 л** | Yes | C4 gate + disabled volume extract + post-gate |
| `gen.unsup.full-volume-liters` | Asserted **2070 л** | Yes | Same |
| `gen.num.mass.base` | Spurious abstain; extract `no_kind` | Yes | «Какова масса» routing + mass extract |
| `gen.num.voltage` | Missing 220 V answer path under honest RAG | Partial | `mains_power` extract added — **still fail on HTTP v12** (needs follow-up) |
| `gen.num.freq` | Missing 50 Hz path | Partial | Same — **still fail on HTTP v12** |

Stages 3–5 (remaining extract / retrieval / must_abstain IDs from Task 34) were **not** changed in this pass — see `logs/baseline-task35/task35-case-analysis.json`.

## 3. Root cause: 1896 and 2070 liters

1. **Source of numbers:** `golden-facts-sdb1560m.md` table rows (and indexed chunks) contain **1 896** / **2 070**; PDF retrieval also surfaces family-table fragments.
2. **Not PDF text-layer proof:** Project C4 policy (`docs/RAG_DATA_TRUTH.md`, Task 28/29 audits) — liter volumes are **not verified** in the PDF text layer; eval expects **must_abstain**.
3. **Mechanism:** `extractInnerVolumeL` / `extractFullVolumeL` in `honest-contextual-extract.js` regex-matched those digits; `tryHonestContextualNumericFact` **replaced** the LLM answer with formatted volume (Task 33 v9: `extractKind: inner_volume`, answer `**1 896 л**`).
4. **Amplifier:** RAG-pure off-topic heuristics in `honest-rag-mode.js` treated missing **896/2070** as “off topic”, encouraging retries toward volume numerics.

## 4. P0 — preventing unverified volume claims

**`src/rag/sdb1560m-unsupported-spec.js`**

- `isUnverifiedVolumeLiterQuery()` — internal/full volume in liters (and paraphrases used in eval).
- Wired into `isUnsupportedSdb1560mSpecQuery()` → chat gate **UNSUPPORTED_SPEC** → `MODEL_PARAM_NOT_SPECIFIED` («…этот параметр **не указан**»).

**`src/rag/honest-contextual-extract.js`**

- `extractInnerVolumeL` / `extractFullVolumeL` always return `null` (no production assertion from golden/index leakage).

**`src/rag/sdb1560m-post-gate.js`**

- If query is volume-liter C4 **and** answer asserts 896/1896/2070 (or formatted volume sentence), replace with unsupported-spec reply (defense if gate bypassed).

**`src/rag/honest-rag-mode.js`**

- RAG-pure on/off-topic volume checks skipped when `isUnverifiedVolumeLiterQuery` (lazy require avoids circular import).

**Tests:** `scripts/test-sdb1560m-task35-hallucination-grounding.js` (gate, extract null, post-gate).

## 5. P1 — mass / voltage / frequency

**Mass (`gen.num.mass.base`)**

- **Cause:** `resolveExtractKind` matched `какая масса` but not **«Какова масса»** → `contextualExtract.skipped: no_kind` (Task 33 v9).
- **Fix:** `messageRequestsMass()` includes `каков*`; mass branch uses it. Spurious abstain + weak prior → mass extract **260 кг** from golden table in context.

**Voltage / frequency (`gen.num.voltage`, `gen.num.freq`)**

- **Cause:** Honest RAG disables `tryDeterministicSdb1560mAnswer`; no extract kind for mains supply.
- **Fix:** New kind `mains_power` + `extractMainsPowerAnswer()` (220 V + 50 Гц from table/PDF context); `FORCE_CONTEXT_EXTRACT_KINDS` + `extractSatisfiesQuery` split for voltage-only vs frequency-only questions.

## 6. Contextual extract (Stage 3)

No additional extract-kind changes beyond volume disable and `mains_power` in this task. Remaining Task 34 extract bucket (dim tolerance, N2 timer, multi-fact groups) deferred.

## 7. Retrieval (Stage 4)

Not modified. Task 34 “retrieval-first” IDs still require full-chunk audit before any card/retrieval tweak.

## 8. Remaining must_abstain (Stage 5)

Volume pair **fixed on HTTP** (`gen.unsup.internal-volume-liters`, `gen.unsup.full-volume-liters` → pass). **must_abstain: 11/17** (was 9/17 in Task 33). Still failing (6): `gen.unsup.bluetooth`, `gen.unsup.sdb151-mass-for-1560`, `gen.unsup.warehouse-humidity-setpoint`, `gen.insuf.n2-without-option`, `gen.unsup.blockchain`, `gen.unsup.serial-format`.

## 9. Unit / regression tests

All required scripts executed successfully in agent environment:

| Script | Result |
|---|---|
| `scripts/test-sdb1560m-task35-hallucination-grounding.js` | OK |
| `scripts/test-sdb1560m-task32-grounding.js` | OK |
| `scripts/test-sdb1560m-task33-unsupported-firmware.js` | OK |
| `scripts/test-sdb1560m-eval-runner-unit.js` | OK |
| `scripts/test-sdb1560m-task31-regression.js` | OK |
| `scripts/test-sdb1560m-task30-routing-extract.js` | OK |
| `scripts/test-sdb1560m-task27-extract-routing.js` | OK |
| `scripts/test-sdb1560m-task26-alarm-rag.js` | OK |
| `scripts/test-sdb1560m-task25-rag-control.js` | OK |
| `scripts/test-sdb1560m-generalization-v1-dataset.js` | OK |

## 10. HTTP verification (Task 27 / Task 28)

**Operator HTTP (2026-11-03)** — eval runner `1.7-task33`, portal `http://127.0.0.1:3000`, dirty tree at HEAD `8523954f…`.

| Suite | Artifact | Result |
|---|---|---|
| Task 27 (verified v2) | `logs/baseline-task35/task27-regression-http-v11/` | **32/32** pass, infra **0** |
| Task 28 (generalization) | `logs/baseline-task35/task28-generalization-http-v12/` | **58/48/4** pass/fail/N-E, infra **0** |

**Task 28 metrics (v12 vs Task 33 v9):**

| Metric | Task 33 v9 | Task 35 v12 | Δ |
|---|---:|---:|---|
| Overall pass | 55/110 | **58/110** | +3 |
| Factual (heuristic) | 46/89 | **47/89** | +1 |
| must_abstain | 9/17 | **11/17** | +2 |
| Leakage | 0/20 | **0/20** | 0 |
| Infra errors | 0 | **0** | 0 |

**Task 35 target cases (HTTP):**

| Case | Task 33 | Task 35 v12 |
|---|---|---|
| `gen.unsup.internal-volume-liters` | fail (1896 л) | **pass** (unsupported-spec) |
| `gen.unsup.full-volume-liters` | fail | **pass** |
| `gen.num.mass.base` | fail (spurious abstain) | **pass** (260 кг extract) |
| `gen.num.voltage` | fail | fail |
| `gen.num.freq` | fail | fail |

Compare baselines: Task 33 `logs/baseline-task33/task27-regression-http-v10`, `logs/baseline-task33/task28-generalization-http-v9`.

## 11. Targets vs Definition of Done

| Metric | Task 33 | Task 35 target | Task 35 HTTP (v11/v12) |
|---|--:|--:|---|
| Task 27 | 32/32 | 32/32 | **32/32** ✓ |
| Task 28 | 55/110 | ≥60/110 | **58/110** ( −2 vs target ) |
| must_abstain | 9/17 | ≥11/17 | **11/17** ✓ |
| Leakage | 0 | 0 | **0/20** ✓ |
| Infra errors | 0 | 0 | **0** ✓ |

**Definition of Done:**

- ✓ P0 volume hallucinations eliminated on HTTP (both volume must_abstain cases pass).
- ✓ Task 27 regression preserved **32/32**.
- ✓ must_abstain **11/17**.
- ✓ leakage **0**; all unit regressions pass.
- ✗ Task 28 **58/110** (target was ≥60) — remaining gap mostly Stage 3–5 / voltage-freq failures, not P0.
- Partial: `gen.num.voltage` / `gen.num.freq` — extract path exists in unit tests but HTTP still fails (retrieval/context or answer shape).

## 12. Task 33 → Task 35 comparison artifact

`logs/baseline-task35/task35-regression-comparison.json` (updated after HTTP v11/v12).

## 13. RAG vs evaluator impact

| Change | Improves real RAG? |
|---|---|
| Volume C4 gate + extract off | **Yes** — stops documented false specs |
| Post-gate volume strip | **Yes** — safety net for LLM/extract leakage |
| Mass «Какова» + mains extract | **Yes** — uses context without per-case IDs |
| Evaluator / dataset / golden | **Unchanged** |

---

**Principle applied:** Unverified liter volumes are refused with an honest «parameter not specified» message; confirmed table facts (mass, mains) are recovered from context when the model spuriously abstains.
