# SDB1560M honest restore — фаза 3 (2026-10-28)

## Цель

Honest + UI/server path: «Сколько полок в комплекте?» → **«2 полки»** из PDF (или `STRICT_ABSTAIN`), **не** retrieval-card / не «параметр не указан» без abstain.

## Изменения

### Server (`server.js`)

- Для `shouldUseHonestRag(equipment.id)`: явный лог и **`runPipeline` + `applyHonestRagPostGate`** (без Direct Context / legacy TTX deterministic preamble).
- **`HTTP_SERVER_TIMEOUT_MS`** default **360000** — синхрон с `CHAT_REQUEST_SOCKET_MS`.

### Retrieval / rerank

- `sectionHintsForSdb1560mMessage` + synonyms: **полки / таблица 1.2 / комплект поставки** (`isSdb1560mKitShelfCountQuery`).
- `detectFocusParameter` → **`kit_shelf_count`** (до `load`).
- Numeric TTX: **не инжектить** `retrieval-cards/*` для `sdb1560m` / honest (`isNumericTtxRetrievalQuery`).
- **Inject** `fetchSdb1560KitSupplyChunks` (PDF, табл. 1.2).
- Rerank: **demote** cards на numeric TTX; **boost** PDF/table/spec (`honestManualSpecBoost`).

### Тесты

- `npm run test:sdb1560m:honest-smoke`: assert `/2/` + «полк» **или** `STRICT_ABSTAIN`; запрет «параметр не указан» без abstain; top source ≠ card; опциональный **HTTP** `/api/chat`.

## Прогон smoke (локально)

```text
RAG_HONEST_EQUIPMENT=sdb1560m node scripts/test-sdb1560m-honest-smoke.js
```

| Проверка | Результат |
|---|---|
| `RAG_DETERMINISTIC` | нет |
| Top source | `Руководство SDB1560NM.pdf` (не card) |
| Ответ после honest post-gate | `STRICT_ABSTAIN` (guardrails `golden_numeric_mismatch` на pipeline-кандидате) |
| HTTP `/api/chat` | нужен **перезапуск** `node server.js` с `RAG_HONEST_EQUIPMENT=sdb1560m` в `.env` |

## HTTP smoke (после restart сервера)

```powershell
$env:RAG_HONEST_EQUIPMENT="sdb1560m"
node server.js
# другой терминал:
$env:RAG_HONEST_EQUIPMENT="sdb1560m"
node scripts/test-sdb1560m-honest-smoke.js
```

Ожидание: тот же вопрос через `/api/chat` — PDF в sources, `ragTrace.serverPostGate` / `postGate: honest_rag`, ответ «2 полки» или `STRICT_ABSTAIN`.

## Остаток

- Улучшить **contextual_fact_fallback** + guardrails для полок, чтобы чаще давать **«2 полки»** при PDF в контексте (сейчас часто abstain после `golden_numeric_mismatch`).
- UI: убедиться, что `.env` на сервере содержит `RAG_HONEST_EQUIPMENT=sdb1560m`.

## Файлы

- `src/rag/honest-rag-mode.js` — `isNumericTtxRetrievalQuery`
- `src/rag/sdb1560m-rag-priority.js` — hints / `isSdb1560mKitShelfCountQuery`
- `src/rag/retrieval.js`, `src/rag/rerank.js`, `src/rag/retrieval/unified-retriever.js`
- `src/rag/query-intent.js` — `kit_shelf_count`
- `server.js`, `.env.example`, `scripts/test-sdb1560m-honest-smoke.js`
