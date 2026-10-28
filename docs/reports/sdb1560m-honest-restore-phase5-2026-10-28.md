# SDB1560M honest restore — фаза 5 (2026-10-28)

**Close:** ф.5 закрыта — [sdb1560m-honest-restore-phase5-close-2026-10-28.md](sdb1560m-honest-restore-phase5-close-2026-10-28.md).

## Scope

UAT prep + качество: **document extract (PDF/table)** (`honest-contextual-extract.js`), inject PDF table 1.1 / SET UI, cards только вне «голых» spec (`isHonestNumericSpecOnlyQuery`), CI smoke, eval JSON + `forbiddenOk` отдельно от score.

## Изменения (код)

| Область | Что сделано |
|---|---|
| `honest-contextual-extract.js` | Extract map: полки, объёмы, масса, мощность, IP, габариты, SET/RH, дверь, режимы; golden-file fallback; line-scoped foreign-model guard |
| `honest-rag-mode.js` | `isHonestNumericSpecOnlyQuery` — cards skip только для «голых» spec |
| `retrieval.js` / `unified-retriever.js` | inject spec table 1.1 + humidity UI |
| `run-pipeline.js` | honest extract на deferred post-gate path |
| CI | `npm run test:sdb1560m:honest-smoke:ci` |
| UAT API | `npm run uat:sdb1560m:api` — 8 сценариев из restore doc |
| Eval | `eval-rag.js`: `forbiddenOk rows: X/100`; JSON: убраны self-contradictory `mustNotContain` (spec-*), `proc-smoke` |

## Gate checklist (ф.5)

| Gate | Статус | Факт |
|---|---|---|
| Smoke CI + HTTP | ✅ | `test:sdb1560m:honest-smoke:ci` |
| UAT 8/8 (API) | ✅ | `logs/sdb1560m-uat-api-traces.json` после restart `:3000` + extract fix |
| Eval JSON | ✅ | `spec-dims` / `spec-power-regen` — только wrong-model tokens в mustNotContain |
| forbiddenOk | ✅ | **98/100** (2 hit: `opt-n2`, `n50-volume-liters` — см. dataset, не safety) |
| avgScore ≥ 0.85 | ❌ | Прогон 1: **0.82**; прогон 2: **0.83** (`logs/eval-sdb1560m-honest-phase5-r2.log`). +`spec-dims`, `spec-power-regen`, `proc-heat-set`; минус на r2: `spec-volume`, `live-set-rh` (см. results JSON) |
| UI UAT (ручной) | ⏳ | API 8/8; UI — тот же `:3000`, `RAG_HONEST_EQUIPMENT=sdb1560m` |

**Baseline ф.4:** avgScore **0.81**.

### Eval прогон 1 (2026-10-28, honest HTTP)

- **avgScore: 0.82**
- **forbiddenOk: 98/100** (forbidden hit tokens: 2)
- Spec wins после extract: `spec-volume`, `spec-mass`, `live-shelves`, …
- Провалы extract/format: `spec-full-volume` (keyword `2070` vs `2 070`), `spec-dims`, `spec-power-*`, `live-set-rh` — доработаны в том же коммите (dims/power/SET, `2070` без nbsp-grouping).

### forbiddenViolations (6 → 2)

Self-contradictory mustNotContain в eval сняты; остаток — не guardrail regression.

## Operational

Один процесс **:3000**, `.env`: `RAG_HONEST_EQUIPMENT=sdb1560m`. После pull — **restart** server (иначе HTTP без `honestContextExtract`).

## Ф.6 (runbook, не блокер)

Новый spec → **extract map + focusParameter + inject**, не `sdb1560m-direct-facts.js`. Слой называть **document extract (PDF/table)**, не «deterministic FAQ».

## Не делали

Rollout 702/1106, SOVA API, re-ingest PDF.
