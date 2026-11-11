# Task 33 — Dry-power grounding diagnosis (Stage 1)

Source HTTP: `logs/baseline-task32/task27-regression-http-v7/report.json`

## Cases

- `exp.num.pwr-dry-base-40`
- `exp.para.dry-no-options`

## Document source

**Golden facts / РЭ §1.1** (табличная строка):

`| Мощность в режиме осушения (группа 1106/1560) | не более 40 Вт | Раздел 1.1 |`

PDF: п. **1.1.2.7** (мощность в режиме осушения без опций).

## Present in retrieved chunks?

**Yes.** Eval diagnostics show `golden-facts-sdb1560m.md` chunk with table 1.1 rows (`chunkTextCount: 10`). Paraphrase case also includes the same golden table chunk among 10 sources.

## Why Task 32 grounding failed

**Not missing retrieval.** Factual layer **passed** (answer contains «не более 40 Вт»).

**Grounding matcher defect:** On the single table line, `hasConflictingAlternateNumeric` treated catalog tokens **`1106`** and **`1560`** in «(группа 1106/1560)» as alternate **W** values because «40 Вт» appears within the **32-character unit window** after those model-group numbers.

Classification: **grounding matcher limitation** (model-group catalog numerics vs spec value on same markdown row).

## Task 33 fix

`isModelGroupCatalogNumeric()` in `scripts/sdb1560m-eval-runner-lib.js` — skip `\d{3,4}/\d{3,4}` and «группа …» catalog numbers in alternate-numeric conflict checks. **Does not** inject facts into evidence; only corrects false conflicts on real source lines.

## Verification (local)

After fix, `evaluateRequiredFact({ claimPattern: "40", unit: "W" }, tableLine)` → **pass**; `evaluateCaseLayers` with that line as sole chunk → grounding **pass**.
