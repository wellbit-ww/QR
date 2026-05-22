# RAG и Direct Context для SDB1106NM

Документ описывает, как устроен чат по шкафу **SDB1106NM**: два пути к одному руководству, защитные слои и способ измерять качество ответов.

## Назначение

- Один документ — одна модель (`sdb1106-nm`).
- Два режима генерации: **Direct Context** (полный PDF в промпт) и **RAG** (поиск чанков в Postgres).
- Цель: **паритет** — одинаково корректные ответы в обоих режимах на эталонном наборе вопросов.

## Схема пайплайна

```mermaid
flowchart TD
  user[Вопрос] --> pre[Pre-gate SDB1106NM]
  pre -->|OFF_TOPIC / FOREIGN_MODEL| stop[Фиксированный отказ]
  pre -->|SAFETY| safetyDet[Deterministic safety]
  pre -->|IN_SCOPE| mode{Режим}
  mode -->|Direct| direct[PDF + golden + LLM]
  mode -->|RAG| rag[Hybrid retrieval + LLM]
  direct --> det[TTX deterministic]
  rag --> det
  det --> post[Post-gate + validation]
  post --> answer[Ответ HTTP 200]
```

## Режимы: Direct vs RAG

| Условие | Режим |
|---------|--------|
| `POSTGRES_URL` не задан | **Direct** (авто для `sdb1106-nm`) |
| Галочка «без RAG» в чате | **Direct** |
| `POSTGRES_URL` задан, галочка выкл. | **RAG** |

Переменные: `POSTGRES_URL`, `OLLAMA_URL`, см. [`src/rag/config.js`](../src/rag/config.js).

## Источники знаний

Папка: [`knowledge/sdb1106-nm/`](../knowledge/sdb1106-nm/)

| Файл | Назначение |
|------|------------|
| `Руководство SDB1106NM.pdf` | Основной источник для инжеста и Direct |
| `golden-table-1.1-sdb1106nm.md` | Эталон ТТХ: 180 кг, 1204×1952×772 мм |
| `golden-table-1.2-sdb1106nm.md` | Комплектация: 10 полок и др. |

**Не использовать** для эталона: маркетинговые цифры из `equipment.json` (1028 л), `RAG_1106NM.pdf` (multi-model таблицы → путаница 56 кг).

## Инжест

```bash
npm run docker:db
$env:POSTGRES_URL = "postgresql://rag:rag_secret_change_me@127.0.0.1:5432/equipment_rag"
npm run ingest:knowledge
```

- Скрипт: [`scripts/ingest-knowledge.js`](../scripts/ingest-knowledge.js)
- Чанки с `equipment_id = 'sdb1106-nm'` — RAG видит только этот шкаф
- Спец-чанки: flattened табл. 1.1, §2.4, запреты «ЗАПРЕЩАЕТСЯ» — [`src/rag/chunking.js`](../src/rag/chunking.js)

## Pre-gate (до LLM)

Модуль: [`src/rag/sdb1106nm-chat-gate.js`](../src/rag/sdb1106nm-chat-gate.js)

- **OFF_TOPIC** — сварка, Python, общий чат → отказ без LLM
- **FOREIGN_MODEL** — SDB302, SDB702 → «только SDB1106NM»
- **SAFETY** — дым, регенерация+выключение → deterministic
- **IN_SCOPE** — вопросы по шкафу → генерация

История чата **не** разблокирует оффтоп после in-scope вопроса.

## Детерминизм и golden TTX

Модуль: [`src/rag/sdb1106nm-direct-facts.js`](../src/rag/sdb1106nm-direct-facts.js)

Примеры жёстких ответов:

| Вопрос | Ответ |
|--------|--------|
| Дым | Сначала отключить питание (п. 2.4) |
| Регенерация + выключение | ЗАПРЕЩАЕТСЯ |
| Мощность хранения (база) | 8 Вт |
| Мощность хранения (азот+подогрев) | 810 Вт |
| Масса | 180 кг |
| Объём в литрах | Не указан в РЭ |

## Post-gate

- [`src/rag/guardrails/guardrail-engine.js`](../src/rag/guardrails/guardrail-engine.js)
- [`src/rag/answer-validation.js`](../src/rag/answer-validation.js)
- [`src/rag/sdb1106nm-post-gate.js`](../src/rag/sdb1106nm-post-gate.js)

**Известная слабость (baseline):** wrong kg (56 вместо 180) может пройти, если «56» есть в контексте — закрывается в Шаге 2 (golden validation).

## Eval и регрессия (Шаг 1)

Датасет: [`data/eval-sdb1106nm-parity.json`](../data/eval-sdb1106nm-parity.json) (~30 кейсов)

```bash
npm run dev
npm run eval:parity
npm run eval:parity -- --save-baseline
npm run eval:parity -- --fail-under 0.95
npm run eval:parity -- --filter ttx-mass-cabinet
npm run eval:parity -- --direct-only
```

Проверки: `mustContain`, `mustNotContain` (подстроки), `mustMatchRegex`, `mustNotMatchRegex` — **без LLM-as-judge**. Каждый кейс ×2 (Direct + RAG). Критерий релиза: **parity ≥ 95%**.

**Экранирование в JSON:** в regex-полях слэш удваивается — `"180\\s*кг"` в файле → `\s` в RegExp; `"не\\s+соответств"` корректно. В `mustNotContain` — только литералы, не `\s`.

```bash
npm run validate:parity-json
```

Baseline сохраняется в `data/eval-sdb1106nm-baseline.json`.

**Текущий baseline (2026-05-22, после Шага 2):** Direct **100%**, RAG **100%**, parity **100%** (30/30). Цель ≥95% — достигнута.

Дополнительно: `npm run test:gate` — offline gate + несколько API-сценариев.

## Фаза E — UX и трассировка режима

### Индикатор режима в чате

- Бейдж **«Ожидается: Direct / RAG»** до отправки вопроса (галочка + `chatCapabilities` с `/api/equipment/:id`)
- После ответа — **«Ответ: …»** по полю `chatMode.label` из JSON (`Direct Context`, `RAG · deterministic`, `Scope gate` и т.д.)
- Подсказка, если Postgres не настроен: auto-fallback на Direct для `sdb1106-nm`

Файлы: [`public/chat.html`](../public/chat.html), [`public/chat.js`](../public/chat.js), [`public/styles.css`](../public/styles.css).

### API: `chatMode` и `chatCapabilities`

Каждый ответ `/api/chat` содержит:

| Поле | Смысл |
|------|--------|
| `chatMode.path` | `direct` \| `rag` |
| `chatMode.mode` | код трассировки (`RAG`, `DIRECT_CONTEXT_DETERMINISTIC`, …) |
| `chatMode.label` | человекочитаемая подпись |
| `chatCapabilities.ragAvailable` | задан ли `POSTGRES_URL` |
| `chatCapabilities.autoDirectForEquipment` | авто-Direct без Postgres (только `sdb1106-nm`) |

### Один проход guardrails для SDB1106NM (RAG)

Для `sdb1106-nm` пайплайн **не** вызывает `runGuardrails` — только post-gate на сервере ([`run-pipeline.js`](../src/rag/pipeline/run-pipeline.js), `deferred_to_server_post_gate` в `ragTrace.guardrails`).

Direct Context по-прежнему проходит post-gate в `server.js`.

### Предупреждение в `ragTrace`

При авто-Direct без Postgres в `ragTrace.warnings` добавляется явное сообщение; также `postgresConfigured: false`, `autoDirectFallback: true`.

## Отладка

- Логи сервера: строки `CHAT` в терминале `npm run dev`
- `ragTrace.mode`: `SCOPE_GATE`, `SAFETY_DETERMINISTIC`, `DIRECT_CONTEXT`, `DIRECT_CONTEXT_DETERMINISTIC`, RAG-маршруты
- `npm run debug:rag` — offline прогон пайплайна

## Ограничения

- Hardening (gate, deterministic, golden) — только `sdb1106-nm`
- Другие модели: RAG изолирован по `equipment_id`, но без parity-слоя
- Масштабирование на SDB2000 — Фаза F (profiles + generic runtime) после >95% на 1106

## Roadmap

| Шаг | Содержание |
|-----|------------|
| **1 (текущий)** | Eval parity + baseline + этот документ |
| **2** | Golden facts, deterministic в RAG, validation, inject табл. 1.1 — **выполнено** |
| **E** | UI режима, single post-gate guardrails, `chatMode` / `ragTrace.warnings` — **выполнено** |
| **3 (F)** | `equipment-runtime.js` + profiles → **SDB161NM** — **scaffold: sdb1106-nm profile** |
