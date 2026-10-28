# SDB1560M honest restore — фаза 4 (2026-10-28)

## Цель

Убрать ложные abstain на numeric TTX из‑за **SDB1106 golden guardrails**; «Сколько полок?» → **«2 полки»** из PDF/context extract; HTTP smoke green после restart.

## Изменения

### Guardrails / validation (honest)

- `validateGrounding` + `validateForProfile`: профиль **`sdb1560`** → `validateSdb1560mAnswerAgainstContext` (**без** `golden_numeric_mismatch` из 1106).
- `applyHonestRagPostGate`: `honestRag`, `skipGoldenFacts` на numeric TTX.
- `shouldDeferGuardrailsToPostGate`: для honest снова **defer** → один проход guardrails на server post-gate (не двойной abstain в pipeline).

### Contextual extract

- `src/rag/honest-contextual-extract.js`: `tryHonestContextualNumericFact` — для `kit_shelf_count` парсит **PDF / табл. 1.2**, формат как в РЭ.
- `run-pipeline.js`: после LLM / при defer — подстановка extract, trace `CONTEXTUAL_FACT_FALLBACK` + `honestContextExtract`.

### Rerank

- Honest numeric: **demote** `golden-facts-sdb1560m.md` в `honestManualSpecBoost` (−0.12).

### Smoke

- Soft warn, если только `STRICT_ABSTAIN`; **`HONEST_SMOKE_REQUIRE_HTTP=1`** — hard fail без HTTP.
- После restart: **`http: { ok: true }`**, ответ «2 полки», top source PDF.

## Прогоны

### `npm run test:sdb1560m:honest-smoke` (после restart server)

| Проверка | Результат |
|---|---|
| Ответ | `В шкафу SDB1560NM предусмотрено **2 полки**.` |
| Top source | `Руководство SDB1560NM.pdf` |
| HTTP | `ok: true` |
| `RAG_DETERMINISTIC` | нет |

### `eval:sdb1560m:cards` (`RAG_HONEST_EQUIPMENT=sdb1560m`, live `/api/chat`)

| Метрика | Legacy (ф.0, ~) | Honest ф.4 |
|---|---:|---:|
| **avgScore** | 0.78 | **0.81** |
| questions | 100 | 100 |
| `live-shelves` | часто abstain / card | **score=1**, «2 полки» |
| forbiddenViolations | 1 | 6 |

**Топ провалов (score=0, фрагмент):**

1. `live-set-rh` — «параметр не указан» на порог RH  
2. `spec-volume` / `spec-full-volume` / `spec-mass` — ТТХ abstain  
3. `spec-power-storage` / `spec-ip`  
4. `proc-open-door` — STRICT_ABSTAIN  
5. `proc-modes` — partial / keyword miss  

*(Полный список: `data/eval-sdb1560m-cards-wave-results.json`, 20 строк с score &lt; 1.)*

## Golden-facts в PG

**Решение:** **`golden-facts-sdb1560m.md` оставить в ingest (3 chunks)** как справочный слой, но **demote при honest numeric TTX** в rerank; guardrails/validation для honest **не** используют 1106 golden mismatch. Исключение из ingest не требуется на ф.4.

## Критерии приёмки ф.4

| Критерий | Статус |
|---|---|
| Smoke «полки» → «2 … полк…» | ✅ |
| eval-cards ≥ 80% | ✅ (0.81) |
| HTTP smoke green (после restart + env) | ✅ |

## UAT gate (operational)

Перед UAT на стенде:

```powershell
taskkill /PID <pid_3000> /F   # без угловых скобок в PowerShell
$env:RAG_HONEST_EQUIPMENT="sdb1560m"
node server.js
# другой терминал:
$env:RAG_HONEST_EQUIPMENT="sdb1560m"
npm run test:sdb1560m:honest-smoke
# CI/UAT:
$env:HONEST_SMOKE_REQUIRE_HTTP="1"
```

## Фаза 5 (идеи)

- Расширить `tryHonestContextualNumericFact` на объём/массу/IP (сейчас главный win — полки).
- Снизить «параметр не указан» на оставшихся spec-* (см. топ провалов eval).
