# RAG policy (SDB1560M pilot)

## Одна дорога для ответов пользователю

При **`RAG_HONEST_EQUIPMENT=sdb1560m`** и **`RAG_PURE=1`**:

1. **Pre-gate (whitelist only):** дым, поддержка, serial, чужая модель — `honest-rag-deterministic.js` / chat-gate. Без FAQ direct-facts для ТТХ.
2. **Retrieval:** hybrid + rerank; PDF **Руководство SDB1560NM.pdf** не вытесняется карточками на общих вопросах; в prompt уходит **≥ 8** чанков; follow-up учитывает **1 прошлый user turn** (rewrite + enrich).
3. **Synthesis:** `runPipeline` → LLM с полным retrieval context. При hedged/off-topic ответе — **grounding contract** (`sdb1560-grounding-contract.js`): до 3 повторных **LLM extract** из **тех же** чанков (golden slice → widen → alias), **без** подстановки FAQ из кода. **`honest-contextual-extract.js` не в hot path**.
4. **Post-gate:** grounding по context, validation + on-topic rescue; **без golden FAQ recovery**. Whitelist deterministic только pre-gate (дым, unsupported replacement, контакты, serial).

Ответ пользователю: **факты из CONTEXT (РЭ)** или **`Информация отсутствует в документации.`** — не шаблон «параметр не указан», если manual уже в retrieval.

## Что не является архитектурой

- Парсинг таблиц и подстановка чисел из extract — **не** production-path при RAG PURE.
- Прогон eval с целью avgScore 0.85 — **не** критерий приёмки пилота.
- Rollout на SDB702 / SOVA API — вне scope этого документа.

## Проверки

- `npm run test:sdb1560m:live-regression` — HTTP `/api/chat`, 20 кейсов; **`--strict --runs=3`** → ≥90% каждый прогон.
- `npm run test:sdb1560m:ad-hoc-probe` — ~30 paraphrase-кейсов; blocking **≥27/30**; PDF в sources → без abstain-шаблонов.
- `npm run test:sdb1560m:honest-smoke:ci` — unit + HTTP smoke.
- Audit: `logs/sdb1560m-abstain-with-pdf-audit.jsonl`.

## Data truth

См. **`docs/RAG_DATA_TRUTH.md`** (PDF vs golden, ingest, полки 2/4).

## Переменные окружения

| Переменная | Значение | Смысл |
|------------|----------|--------|
| `RAG_HONEST_EQUIPMENT` | `sdb1560m` | Honest pilot для модели |
| `RAG_PURE` | `1` | Embed+LLM only, без extract hot path |

См. также `.env.example`, `docs/RAG_SDB1560M_HONEST_RESTORE.md`, runbook `docs/RUNBOOK_EQUIPMENT_PORTAL.md`.
