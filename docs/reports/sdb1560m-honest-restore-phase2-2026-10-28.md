# SDB1560M honest RAG — фаза 2 (feature flag + профиль)

**Дата:** 2026-10-28  
**Env:** `RAG_HONEST_EQUIPMENT=sdb1560m`

## Реализовано

| Компонент | Путь |
|-----------|------|
| Feature flag | `src/rag/honest-rag-mode.js` — `parseHonestEquipmentIds()`, `shouldUseHonestRag()`, `shouldDeferGuardrailsToPostGate()`, `shouldAutoDirectWhenNoPostgres()` |
| Whitelist deterministic | `src/rag/honest-rag-deterministic.js` — support, serial, smoke/regen safety, unsupported replacement |
| Honest post-gate | `src/rag/honest-rag-post-gate.js` — guardrails + validation, **без** deterministic recovery |
| Профиль | `src/equipment/profiles/sdb1560m.js` — ветвление по `shouldUseHonestRag` |
| Pipeline | `src/rag/pipeline/run-pipeline.js` — guardrails in-pipeline при honest (не defer post-gate) |
| Server | `server.js` — honest отключает auto Direct Context; chat socket default **360000 ms** |
| Пример env | `.env.example` — `RAG_HONEST_EQUIPMENT`, таймауты |
| Smoke | `npm run test:sdb1560m:honest-smoke` |

Pre-gate `sdb1560m-chat-gate.js`: `EQUIPMENT` исправлен на `{ id: sdb1560m, name: SDB1560 M }` (был `w-700`).

## Критерии фазы 2

| Критерий | Результат |
|----------|-----------|
| «Сколько полок?» без `RAG_DETERMINISTIC` | ✅ `npm run test:sdb1560m:honest-smoke` — mode ≠ `RAG_DETERMINISTIC`, profile `tryDeterministicAnswer` → `null` |
| Sources / retrieval | ✅ 15 chunks, в sources есть **Руководство SDB1560NM.pdf** |
| SDB702 без honest | ✅ без изменений профиля 702; flag только по `RAG_HONEST_EQUIPMENT` |
| Legacy `test:sdb1560m` | ✅ проходит без `RAG_HONEST_EQUIPMENT` |

### Замечание по smoke (качество ответа)

При последнем прогоне smoke ответ: «В документации на данную модель этот параметр не указан» (top rerank — `retrieval-cards/nitrogen-option.md`), при этом PDF присутствует в sources. Это **не** deterministic FAQ; для фазы 3–4 имеет смысл улучшить ranking / contextual fact для ТТХ «2 полки».

Trace smoke (pipeline, honest):

- `deliveryMethod`: `contextual_fact_fallback` (не `rag_deterministic`)
- `deferredPostGate`: **false** (guardrails в pipeline)
- `llmUsed`: true

## Таймаут `/api/chat` (опционально)

- Дефолт **`CHAT_REQUEST_SOCKET_MS`** поднят с **180000 → 360000 ms** (6 мин) в `server.js`.
- **`HTTP_SERVER_TIMEOUT_MS`** по-прежнему default 180000 — для симметрии задайте в `.env` оба значения (см. `.env.example`).
- Длинные клиенты (eval/fetch) должны использовать достаточный timeout или `CHAT_REQUEST_SOCKET_MS=0` на сервере для отключения cap.

## Как включить на стенде

```env
RAG_HONEST_EQUIPMENT=sdb1560m
```

Перезапуск `npm start` / `npm run dev` после изменения `.env`.

## Проверки

```bash
set RAG_HONEST_EQUIPMENT=sdb1560m
npm run test:sdb1560m:honest-smoke
npm run test:sdb1560m
```
