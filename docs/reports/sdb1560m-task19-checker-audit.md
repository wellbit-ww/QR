# Task 19 — Freeze Task 18 Evidence and Checker Regression Audit

**Date:** 2026-10-29  
**Branch:** `backup/sova-portal`  
**Git HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged; dirty working tree preserved)

**Scope:** Read-only verification of HTTP artifacts, eval-runner tests, and `hasConflictingAlternateNumeric` / `isEquipmentModelDesignatorNumeric` behavior. No production RAG changes, no baseline overwrites, no HTTP re-run, no Git commit/reset/clean/stash.

---

## 1. Frozen Task 18 HTTP evidence

**Primary artifact directory (immutable for this task):**

`logs/baseline-task18/http-verify-20261029-r3/`

| File | Role |
|------|------|
| `manifest.json` | Run metadata, runner version |
| `report.json` | Per-case layers + embedded manifest copy |
| `SUMMARY.md` | Human summary |

### Manifest / report checks

| Requirement | Value in artifact |
|-------------|-------------------|
| `run.mode` | **`http`** |
| `run.allowHttp` | **`true`** |
| `run.dryRun` | **`false`** |
| `run.authMode` | **`eval_login`** |
| `skipReasons` | **`[]`** |
| `evalRunnerLibVersion` | **`1.4-task18`** |
| `summary.total` | **6** |
| `summary.pass` | **6** |
| `summary.fail` | **0** |
| `summary.blocked` | **0** |
| `summary.infrastructure_error` | **0** |
| `summary.not_run` | **0** |
| `summary.not_evaluable` | **0** |

**Cases executed (all `overall.status: pass`):**

1. `num.mass.verified` — preview: `**Масса** шкафа SDB1560NM — **260 кг** (табл. 1.1).`
2. `num.dry-power-base.verified`
3. `mode.regen-shutdown.verified`
4. `maint.desicc-interval.verified`
5. `alarm.beep-door.verified`
6. `para.mass-colloquial.verified` — preview includes **260 кг** and **SDB1560М**

**Captured at:** `2026-10-29T08:05:11.473Z` (manifest and SUMMARY agree).

**Source code version at audit time:** `scripts/sdb1560m-eval-runner-lib.js` exports `EVAL_RUNNER_LIB_VERSION = "1.4-task18"` (matches frozen HTTP manifest).

---

## 2. Historical baselines — preservation

The following directories were **not modified** during Task 19 (read-only inspection only):

- `logs/baseline-task9/`
- `logs/baseline-task15/`
- `logs/baseline-task16/`
- `logs/baseline-task17/`
- `logs/baseline-task18/http-verify-20261029-r3/`

Task 17 artifacts remain scored with **`1.3-task13`** (including the checker false positive on direct mass). Task 18 r3 is the **authoritative pass** record for runner **`1.4-task18`**.

---

## 3. Automated test execution

| Command | Exit code |
|---------|-----------|
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **0** |
| `node scripts/test-sdb1560m-eval-runner-counterexamples.js` | **0** |

### Unit coverage relevant to Task 18 fix

| Test | Intent |
|------|--------|
| `testB2MassModelDesignatorNotConflictingKg` | HTTP-shaped contextual extract + colloquial **SDB1560…** + **260 kg** → **pass**; dual wrong mass string with **156 kg** and **260 kg** → **fail** |
| `testB2Contradiction` | `260 кг, также указано 180 кг` → **fail** / `contradiction` |
| `testB2Negation` | `не 260 кг, а 180 кг` → **fail** |
| `testB2NumericCapMaximum` | **SDB1560М** in dry-power sentence + **40 Вт** cap → **pass** (power path unchanged) |

### Counterexample coverage (synthetic)

| Area | Examples |
|------|----------|
| Mass pass/fail | plain **260 кг**; negated swap to **280 кг**; dual **260 … 280 кг**; wrong unit (фунты) |
| Power + model token | Task 9/15 baseline dry-power string with **SDB1560М** + **не более 40 Вт** → **pass** |
| Case-level | forbidden **180**; retrieval/chunk contradictions |

**Gap (documented, not fixed in Task 19):** Neither unit nor counterexample files contain an explicit assertion for the user-requested phrase **`Масса 260 кг и 156 кг`**. Ad-hoc probe below shows the checker **does fail** it; a **minimal follow-up** would add one line to `testB2MassModelDesignatorNotConflictingKg` or `sectionA_numbers` in counterexamples (see §6).

---

## 4. Checker logic audit (`1.4-task18`)

### Change under review

In `hasConflictingAlternateNumeric`, alternate numbers equal to the required claim are skipped; additionally, digit runs matching **`isEquipmentModelDesignatorNumeric`** are skipped before the unit-proximity conflict test.

```166:171:scripts/sdb1560m-eval-runner-lib.js
function isEquipmentModelDesignatorNumeric(text, matchIndex, matchLen) {
  const start = Math.max(0, matchIndex - 4);
  const end = Math.min(text.length, matchIndex + matchLen + 4);
  const local = text.slice(start, end);
  return /SDB[\s-]*\d+(?:NM|M|М|nm|m)?/iu.test(local);
}
```

**Design intent:** Only **`SDB` + digits + optional NM/M/М suffix** in a tight local window — not arbitrary numbers in prose.

### Ad-hoc probes (Task 19, read-only Node)

All use `evaluateRequiredFact({ claimPattern: "260", unit: "kg" }, …)`:

| Scenario | Expected | Observed |
|----------|----------|----------|
| Contextual extract answer (`SDB1560NM … 260 кг`) | pass | **pass** |
| `Шкаф SDB1560M: масса 260 кг` | pass | **pass** |
| `SDB1560М … 260 кг` (Cyrillic М) | pass | **pass** |
| `Масса 260 кг и 156 кг` | fail | **fail** (`contradiction`) |
| `Масса 260 кг, но фактически 180 кг` | fail | **fail** (`missing_or_negated` on required **260**) |
| `260 кг, также указано 180 кг` | fail | **fail** (`contradiction`) |
| `Вес 156 кг` (no **260**) | fail | **fail** (`missing_or_negated`) |
| `260 кг. Другой источник: 1560 кг` (no **SDB** prefix on **1560**) | fail | **fail** (`contradiction`) |

**Conclusion:** Model designator skip **does not** suppress real dual-mass or wrong-only answers. Plain **`1560 кг`** without **`SDB`** still conflicts when **260 kg** is asserted.

---

## 5. Model-designator boundary behavior

| Behavior | Result |
|----------|--------|
| Skip **`1560`** inside **`SDB1560NM` / `SDB1560M` / `SDB1560М`** when scanning alternates | **Yes** — fixes Task 18 false positive |
| Skip **`1560 кг`** in normal text without **`SDB`** | **No** — still fails (correct) |
| Skip wrong **`156 кг`** when **`260 kg`** also present | **No** — **`156`** is not matched inside **`1560`** due to bounded digit regex; standalone **`156 кг`** triggers fail |
| Prefix required | **`SDB`** (case-insensitive **`i`**) — not generic “1560” mentions (e.g. lathe **1560** in off-topic gate is unrelated to this function) |
| Local window | **`matchIndex - 4`** … **`+ matchLen + 4`** — sufficient for observed portal answers; **residual risk** if a future answer put **>4** characters between **`SDB`** and digits (not seen in baselines) |

Power facts (**40 W**) with **SDB1560М** in the same sentence remain **pass** (regulatory **не более** handling unchanged; **1560** skip applies only inside **`hasConflictingAlternateNumeric`**, which runs for mass **`unit: kg`**).

---

## 6. Coverage gaps and minimal follow-up (no code in Task 19)

| Gap | Risk | Proposed minimal addition (future task) |
|-----|------|----------------------------------------|
| No committed test string **`Масса 260 кг и 156 кг`** | Low — behavior verified ad-hoc | One `assert.equal(..., "fail")` in `testB2MassModelDesignatorNotConflictingKg` |
| Colloquial suite case still lacks **`unit: "kg"`** | Eval asymmetry — colloquial would pass even without Task 18 fix if only **260** digit checked | Suite change **only if authorized** (out of checker scope) |
| Checker is heuristic, not semantic | Unusual phrasing / ranges / multi-unit answers | Keep counterexamples; extend when new false pass/fail seen |

---

## 7. Residual risks and limitations

1. **Deterministic checker ≠ semantic truth** — HTTP **6/6** means required layers passed heuristics, not PDF chunk grounding (`chunkTextCount: 0` in reports).
2. **Designator heuristic is SDB-specific** — other equipment families would need parallel rules if added to the suite.
3. **Forward-only 32-char unit window** for alternates remains; Task 18 fix only excludes **SDB** model tokens from alternate scan.
4. **Dirty tree at HEAD `8523954…`** — artifacts note uncommitted runner/RAG changes; interpret as “portal + runner at capture time,” not a single clean commit.

---

## 8. Task 19 verdict

| Item | Status |
|------|--------|
| Task 18 HTTP evidence frozen and verified | **OK** (`1.4-task18`, 6/6 HTTP) |
| Checker fix does not hide dual-mass conflicts (probed) | **OK** |
| Model token false positive resolved for **260 kg** answers | **OK** (confirmed in artifact + tests) |
| Unit + counterexample suites | **Green** (exit 0) |
| Code changes in Task 19 | **None** (audit only) |

**Overall:** Task 18 evidence is **frozen and consistent**. Checker regression coverage is **adequate** for the identified defect; one **optional** explicit **`260 кг и 156 кг`** test is recommended but not required for correctness.
