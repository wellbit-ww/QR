# Task 18 — Task 17 HTTP Verification and Factual Checker Diagnosis

**Date:** 2026-10-29  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged; dirty tree preserved)

---

## 1. HTTP artifacts reviewed

Two operator runs exist under `logs/baseline-task17/` (same scoring; **r2** is the later capture):

| Directory | capturedAt (manifest) | Summary |
|-----------|------------------------|---------|
| `http-mass-20261029/` | 2026-10-29T08:01:27Z | 6 cases, **5 pass / 1 fail** |
| `http-mass-20261029-r2/` | 2026-10-29T08:02:28Z | 6 cases, **5 pass / 1 fail** |

### Manifest checks (both runs — identical run block)

| Field | Value |
|-------|--------|
| `run.mode` | **`http`** |
| `run.allowHttp` | `true` |
| `run.dryRun` | `false` |
| `run.authMode` | **`eval_login`** |
| `skipReasons` | `[]` |
| `evalRunnerLibVersion` | **`1.3-task13`** (frozen at capture time) |
| Cases in report | **6**, all executed (`not_run: 0` in summary) |

Credentials appear only as `(set)` in fingerprint — not stored in artifacts.

**Primary artifact for analysis:** `logs/baseline-task17/http-mass-20261029-r2/report.json` (+ sibling `manifest.json`, `SUMMARY.md`).

---

## 2. `num.mass.verified` — full answer preview and manual review

**Query:** `Какой вес шкафа SDB1560M?`

**answerPreview (320-char cap; full text fits):**

```text
**Масса** шкафа SDB1560NM — **260 кг** (табл. 1.1).
```

| Criterion | Assessment |
|-----------|------------|
| Mass value | **260** with unit **кг** — matches PDF table 1.1 / golden facts |
| Wrong **156 kg** | **Absent** (Task 17 product fix visible) |
| Source cue | **(табл. 1.1)** — aligns with manual, not invented |
| Model wording | Answer uses **SDB1560NM** (manual designation), not the literal token **SDB1560M** from the question |

**Product vs naming:** For scoped equipment chat (`sdb1560m`), NM in the manual is the documented type name; **M** in the user query is the portal model id. The answer is **factually correct on mass and unit** and grounded to table 1.1, but **does not echo “SDB1560M”** in text (contextual-extract template uses `SDB1560NM`). That is a **presentation / alias** issue, not a repeat of the Task 16 **156 kg** hallucination. No evidence the system answered for a foreign model (forbidden **180** kg leak check **pass**).

**Eval overall (1.3-task13):** `fail` / `factual` with `reason: contradiction` on **F-MASS** — **checker false negative**, not missing mass in text.

---

## 3. Direct vs colloquial mass (same HTTP run)

| Case | Message | answerPreview (abbrev.) | Factual (lib 1.3-task13) |
|------|---------|-------------------------|---------------------------|
| `num.mass.verified` | `Какой вес шкафа SDB1560M?` | `**Масса** шкафа SDB1560NM — **260 кг** (табл. 1.1).` | **fail** (`contradiction`) |
| `para.mass-colloquial.verified` | `Тяжёлый? вдвоём поднимем?` | `Масса Шкафа SDB1560М составляет 260 кг. …` | **pass** |

Both answers assert **260 kg** and cite the same source doc names (golden + PDF). Difference in eval outcome is **not** retrieval or HTTP — it comes from **suite + checker**, see §4.

---

## 4. Root cause of `contradiction` (checker, not product)

### Suite `requiredFacts`

**Direct (`num.mass.verified`):**

```json
{ "claimPattern": "260", "unit": "kg", "factId": "F-MASS" }
```

**Colloquial (`para.mass-colloquial.verified`):**

```json
{ "claimPattern": "260", "factId": "F-MASS" }
```

(no `unit` field)

### Checker logic (`sdb1560m-eval-runner-lib.js`, v1.3-task13)

For numeric claims with `unit: "kg"`, after accepting **260 кг**, `hasConflictingAlternateNumeric` scans **every** other number in the answer. For each alternate number it uses `hasUnitNear`, which looks **forward up to 32 characters** for a mass unit.

**Failure mechanism on both mass answers that include a model token before the mass:**

```text
… SDB1560NM — **260 кг** …
   ^^^^^
   digit run 1560
```

- Global number regex matches **`1560`** in `SDB1560NM` / `SDB1560М`.
- `1560 ≠ 260`, not negated.
- Forward window from `1560` includes **`260 кг`** → `hasUnitNear` returns **true**.
- Checker reports **`alternate numeric value with same unit`** → **`reason: contradiction`**.

**Reproduction (Node, lib 1.3-task13):**

```text
evaluateRequiredFact({ claimPattern: "260", unit: "kg" }, contextualExtractAnswer)
→ fail, reason: contradiction

evaluateRequiredFact({ claimPattern: "260" }, same colloquial answer)  // no unit
→ pass
```

So **`para.mass-colloquial.verified` passes** only because the suite omits `unit: "kg"`, which **disables** `hasConflictingAlternateNumeric` entirely — not because the colloquial answer avoids the `1560` token (it does not).

**Conclusion:** Task 17 HTTP mass is **product-correct**; Task 17 **eval fail** is a **checker false positive** when `unit: "kg"` is set and the answer mentions **SDB1560…** before **260 кг**. This is **not** the same as a real dual-mass contradiction (e.g. “260 кг … 180 кг”).

---

## 5. Fix applied (minimal, general)

**Do not weaken** numeric contradiction for genuine dual claims.

**Change:** In `hasConflictingAlternateNumeric`, skip digit runs that are part of an equipment model designator (`SDB` + digits + optional `NM` / `M` / `М`).

| File | Change |
|------|--------|
| `scripts/sdb1560m-eval-runner-lib.js` | `isEquipmentModelDesignatorNumeric()` + skip in conflict scan; **`EVAL_RUNNER_LIB_VERSION` → `1.4-task18`** |
| `scripts/test-sdb1560m-eval-runner-unit.js` | `testB2MassModelDesignatorNotConflictingKg()` — HTTP-shaped contextual extract + colloquial pass; still fails true dual wrong mass |

**Tests run (after fix):**

| Command | Exit |
|---------|------|
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **0** |

**Not changed:** eval suite JSON, `.env`, DB, index, historical baselines under `logs/baseline-task17/` (still record **1.3-task13** scoring).

**Operator:** Re-run HTTP into a **new** output dir to confirm **6/6** with runner **1.4-task18**:

```powershell
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --out=logs/baseline-task18/http-verify-20261029
```

---

## 6. Separation: product vs checker

| Layer | Task 17 direct mass | Task 18 verdict |
|-------|---------------------|-----------------|
| **Product (portal)** | **260 kg**, table 1.1, no 156 kg | **Fixed** (Task 17 grounding/extract) |
| **Model label in answer** | **SDB1560NM** vs question **SDB1560M** | Acceptable alias for same equipment; optional UX improvement later |
| **Eval runner (1.3-task13)** | Marks **contradiction** despite correct mass | **Bug** — fixed in **1.4-task18** |
| **Eval suite asymmetry** | Direct requires `unit: "kg"`; colloquial does not | Explains pass/fail split; aligning units is a **suite design** choice (out of scope unless authorized) |

---

## 7. Limitations

- HTTP reports store **answerPreview** (320 chars) and **source doc names**, not chunk bodies (`chunkTextCount: 0`).
- Baseline JSON under `logs/baseline-task17/` remains scored with **1.3-task13**; do not rewrite without authorization.
- Full `scripts/test-sdb1560m-profile.js` still fails on unrelated RH% deterministic assertion (pre-existing).

---

## Status

| Item | Status |
|------|--------|
| HTTP run validity | **Confirmed** (`eval_login`, 6 cases, real HTTP) |
| Mass **260 kg** in direct answer | **Confirmed** (manual review) |
| `contradiction` cause | **Checker false positive** (`1560` + forward kg window) |
| Checker fix + regression test | **Done** (`1.4-task18`) |
| HTTP **6/6 pass** with new lib | **Pending operator re-run** (not captured in repo yet) |

**Overall:** Product mass behavior **verified** on Task 17 HTTP artifacts; eval failure was **checker-only** — addressed in code, awaiting fresh HTTP artifact for closure.
