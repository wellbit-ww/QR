# RAG data truth (SDB1560M)

Источник фактов для **RAG PURE** — только то, что попадает в retrieval context из ingested KB (PDF + curated markdown). Post-gate **не** подменяет ответы из golden FAQ.

## Канонические источники

| Источник | Роль |
|----------|------|
| `knowledge/sdb1560m/Руководство SDB1560NM.pdf` | Первичное РЭ (ingest → `knowledge_chunks`) |
| `knowledge/sdb1560m/golden-facts-sdb1560m.md` | Сводка для retrieval (не deterministic hot path при pure) |
| `knowledge/sdb1560m/retrieval-cards/*.md` | Подсказки retrieval; не заменяют PDF на ТТХ |

После правок KB: **`node scripts/ingest-knowledge.js --only=sdb1560m --force`**.

## Известные расхождения (не скрывать)

| Тема | golden-facts / legacy direct | PDF табл. 1.2 (семейная) |
|------|------------------------------|---------------------------|
| Полки в комплекте | **2 шт.** | п. 8.6 для SDB1560M: **4** перфорированные полки |
| Осушители | 1 в базе | п. 6.2: **2** осушителя для SDB1560M |

Приёмка HTTP-тестов для полок: **`(2|4)` + «полк»** до согласования с экспертами. Цель pure — ответ **из CONTEXT**, не extract.

## Anti-abstain при PDF

Если в **sources** есть `Руководство SDB1560NM.pdf`, ответ не должен совпадать с шаблонами отказа (см. `scripts/sdb1560m-http-test-lib.js`, audit `logs/sdb1560m-abstain-with-pdf-audit.jsonl`).

Допустимый честный отказ: **`Информация отсутствует в документации.`** (`STRICT_ABSTAIN`) — только когда факта нет в CONTEXT.

## Выключено при RAG PURE

- `honest-contextual-extract.js` — **не** в hot path (`shouldUseRagPure`).
- `tryDeterministicSdb1560mAnswer` для ТТХ — **не** в honest profile (`tryHonestWhitelistedDeterministicAnswer` only).

См. `docs/RAG_POLICY.md`.
