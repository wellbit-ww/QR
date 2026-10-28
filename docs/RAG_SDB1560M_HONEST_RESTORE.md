# Восстановление RAG для SDB1560M — пилот «честного» retrieval

**Статус:** зафиксированный план (тестовый пилот на одной модели)  
**Репозиторий:** `equipment-support-mvp` (`C:\Users\SOVAI\Documents\Work\QR`)  
**Стратегия:** вариант **B** — RAG остаётся в QR (PostgreSQL + hybrid + LLM), **без** golden/direct/post-gate для ТТХ и процедур; детерминизм только для узких исключений.  
**Не в scope пилота:** прокси в SOVA `rag_server` / Qdrant `sova_equipment`.

---

## Цель пилота

1. Ответы по **SDB1560M** идут из **retrieval + LLM + grounding**, с явным abstain, если в контексте нет опоры.
2. Портал (auth, equipment picker, support, emergency) не ломается.
3. Есть **измеримая** регрессия: live eval + ручной чеклист, не «зелёный» `test-sdb1560m-profile` на FAQ в JS.

---

## Исходное состояние (inventory)

| Компонент | Путь / команда | Роль сегодня |
|-----------|----------------|--------------|
| Каталог UI | `data/equipment.json` → `sdb1560m` | Карточка, `guideUrl`: `/manuals/SDB1560NM.pdf` |
| Профиль runtime | `src/equipment/profiles/sdb1560m.js` | Подключает chat-gate, direct-facts, post-gate, rag-priority |
| Deterministic FAQ | `src/rag/sdb1560m-direct-facts.js` | `tryDeterministicSdb1560mAnswer` — обход retrieval |
| Pre-gate | `src/rag/sdb1560m-chat-gate.js` | Классификация до RAG |
| Post-gate | `src/rag/sdb1560m-post-gate.js` | Подмена ответа LLM |
| Hints (оставить) | `src/rag/sdb1560m-rag-priority.js` | Section anchors, synonyms — **не** canned answers |
| Validation | `src/rag/sdb1560m-answer-validation.js`, `procedure-validation`, `prompt-rules` | Пост-проверки к LLM |
| Pipeline | `src/rag/pipeline/run-pipeline.js` | Целевой единый путь |
| Legacy в server | `server.js` | Дублирующие ветки + profile hooks |
| Ingest | `npm run ingest:knowledge` | `knowledge/<equipment_id>/` → PG |
| Unit FAQ test | `npm run test:sdb1560m` | **Привязан к deterministic** — переписать в фазе 4 |
| Live eval | `npm run eval:sdb1560m:cards` | `data/eval-sdb1560m-cards-wave.json` |

**Замечание для ревью:** в `sdb1560m-rag-priority.js` функция `isSdb1560mEquipment` включает `w-700` — при пилоте не расширять honest-режим на W-700 без отдельного решения.

---

## Контракт «честного» режима (только sdb1560m)

### Всегда deterministic (без LLM / без retrieval)

- Дым / emergency (`safety-query-scope`, профиль `buildSafetyDeterministicOrPrompt`).
- «Напишите в поддержку» / контакты портала.
- Серийный номер (где на шильде) — `equipment-serial-number-scope`.
- Чужая модель SDB → `foreignSdbModels` / redirect.
- Явный unsupported replacement — `unsupported-replacement-scope`.

### Всегда через `runPipeline` (или эквивалент в server после рефактора)

- ТТХ, комплектация, процедуры, неисправности, индикация, ТО, «купил шкаф / первый запуск».

### Env (добавить в `.env.example` в фазе 2)

```env
# Пилот honest RAG: список equipment id через запятую
RAG_HONEST_EQUIPMENT=sdb1560m

# Глобальный kill-switch legacy FAQ (позже default 1 для всех)
RAG_DETERMINISTIC=1

# Для пилота на 1560: deterministic FAQ выключен для id из RAG_HONEST_EQUIPMENT
# при RAG_DETERMINISTIC=1 остальные модели без изменений
```

Логика: `isHonestRagEquipment(equipmentId)` → не вызывать `tryDeterministicAnswer`, не применять post-gate подмену ТТХ; **оставить** hints из `rag-priority`.

---

## Фазы работ

### Фаза 0 — Baseline (0.5 дня)

**Сделать**

- [x] `docker compose up -d`, проверить `POSTGRES_URL`.
- [x] Ollama: embed `bge-m3`, chat-модель как в `.env` (см. `src/rag/config.js`).
- [ ] `npm run dev`, войти в портал, выбрать **SDB1560M** (UI не зафиксирован; traces через `runPipeline`).
- [x] Сохранить 3 trace/log примера: (1) вопрос с deterministic сегодня, (2) процедура, (3) «нет в мануале».

**Артефакты**

- [logs/sdb1560m-honest-restore-baseline-traces.json](../logs/sdb1560m-honest-restore-baseline-traces.json) — файл «до».
- [docs/reports/sdb1560m-honest-restore-phase0-baseline-2026-10-28.md](reports/sdb1560m-honest-restore-phase0-baseline-2026-10-28.md) — сводка фазы 0.
- Скрипты: `scripts/sdb1560m-phase0-pg-stats.js`, `scripts/sdb1560m-phase0-baseline-traces.js`.
- `knowledge/sdb1560m/` — **18 файлов** (PDF + golden + cards + support).

**Критерий готовности:** воспроизводимый старт стека; понятно, есть ли чанки в PG для `equipment_id = sdb1560m`. **✅ 92 чанка.**

---

### Фаза 1 — Knowledge & ingest (0.5–1 день)

**Сделать**

- [ ] Положить РЭ в `knowledge/sdb1560m/` (предпочтительно `.md`/`.docx`; PDF — через `scripts/pdf_to_markdown.py` при ingest).
- [ ] Убедиться, что `public/manuals/SDB1560NM.pdf` совпадает с ingested источником по версии.
- [ ] `npm run ingest:knowledge` (только sdb1560m или полный прогон).
- [ ] SQL/скрипт: число чанков и parent-child для `sdb1560m` > 0.

**Критерий готовности**

- Retrieval smoke: `node scripts/debug-rag-pipeline.js` (или API debug) на «внутренний объём 1896» возвращает чанк с числом из мануала, **без** deterministic.

**Ответственный агент (QR):** ingest + проверка PG.  
**Ревью (SOVA чат):** метаданные `equipment_id`, размер чанков, нет ли пустого ingest.

---

### Фаза 2 — Feature flag + профиль (1 день)

**Сделать**

- [x] Модуль `src/rag/honest-rag-mode.js` (или в `config.js`):
  - `parseHonestEquipmentIds()` из `RAG_HONEST_EQUIPMENT`;
  - `shouldUseHonestRag(equipmentId)`.
- [x] В `equipment-runtime` или профиле `sdb1560m.js`:
  - при honest: `tryDeterministicAnswer` → только whitelist (support, serial, smoke, foreign model) — делегировать в общие модули, **не** в `sdb1560m-direct-facts` для ТТХ;
  - `applyPostGate` → `applyHonestRagPostGate` (без deterministic recovery);
  - `deferGuardrailsToPostGate` → `false` через `shouldDeferGuardrailsToPostGate`.
- [x] `.env.example` + отчёт [phase2](reports/sdb1560m-honest-restore-phase2-2026-10-28.md).

**Не удалять** файлы `sdb1560m-direct-facts.js` — только вывести из hot path для honest id.

**Критерий готовности**

- При `RAG_HONEST_EQUIPMENT=sdb1560m` trace **не** `RAG_DETERMINISTIC` для «Сколько полок?»; smoke: `npm run test:sdb1560m:honest-smoke`. (Качество ответа / `contextual_fact_fallback` — доработка фаз 3–4.)
- SDB702 и др. без id в `RAG_HONEST_EQUIPMENT` — без изменений.

---

### Фаза 3 — Единая точка входа chat для 1560 (1–2 дня)

**Сделать**

- [ ] В `server.js` для сообщений с `equipment.id === sdb1560m` и honest mode:
  - приоритет **`runPipeline()`**;
  - убрать/обойти дубли: legacy `analyzeQuery` + deterministic preamble для 1560.
- [ ] `classifyPreGate` / `classifySdb1560mMessage`: оставить только safety routing (SAFETY_QA), не блокировать LLM path для обычных вопросов.
- [ ] Section hints из `sdb1560m-rag-priority` **передавать в retrieval** (уже задумано — проверить wire-up).

**Критерий готовности**

- Один код-path на запрос (grep по trace / логам).
- Latency: целевой ориентир **&lt; 30 с** на типовой ТТХ на вашем железе (без второго self-correct при необходимости `CHAT_SELF_CORRECT=0` для пилота).

---

### Фаза 4 — Тесты и eval (1 день)

**Сделать**

- [ ] Новый скрипт `scripts/test-sdb1560m-honest-rag.js` (или флаг `--honest`):
  - HTTP/live или pipeline integration;
  - проверка **substring из eval JSON / мануала**, не `tryDeterministicSdb1560mAnswer`.
- [ ] Разделить `npm run test:sdb1560m`:
  - legacy deterministic — `test:sdb1560m:deterministic` (opt-in);
  - honest — `test:sdb1560m:honest`.
- [ ] Прогон `npm run eval:sdb1560m:cards` с `RAG_HONEST_EQUIPMENT=sdb1560m`.
- [ ] Зафиксировать отчёт: `docs/reports/sdb1560m-honest-baseline-YYYY-MM-DD.md` (pass rate, провалы с цитатой чанка).

**Критерий приёмки пилота (согласовать с заказчиком)**

- ≥ **80%** вопросов eval-cards с grounding pass (или не хуже текущего live deterministic на **тех же** вопросах по фактам, без ложных «уверенных» ответов вне мануала).
- **0** регрессий на smoke / support / foreign model.
- Abstain на намеренно ловушечных вопросах («производитель датчика» и т.п.) — OK.

---

### Критерий eval ф.5 (принято 2026-10-28, вариант B)

Для закрытия пилота honest SDB1560M на стенде принят **waiver** по автоматическому eval:

- **avgScore ≥ 0.83** на `eval:sdb1560m:cards` (honest HTTP), вместо изначальных ≥ 0.85;
- обязательны: **UAT API 8/8**, **UI UAT 8/8**, **smoke CI**, **forbiddenOk ≥ 98/100**.

Хвост eval (не блокер стенда, ф.6): `spec-volume`, `spec-full-volume`, `live-set-rh`, `spec-power-storage`.

Цель 0.85 переносится в ф.6 как улучшение extract/format/eval keywords, без возврата deterministic FAQ.

#### Backlog ф.6 (extract / eval, не блокер ф.5)

| id | Заметка |
|----|---------|
| `spec-volume` | eval score 0 при OK spot/API — format/keywords/session |
| `spec-full-volume` | то же (2070 / 2 070) |
| `live-set-rh` | «параметр не указан» на full eval |
| `spec-power-storage` | 8 Вт / inject+extract |

Опционально eval JSON: 2× `forbiddenOk` (`opt-n2`, `n50-volume-liters` или как в последнем прогоне) — dataset, не safety.

---

### Фаза 5 — Ручной чеклист UAT (0.5 дня)

Проверить в UI (SDB1560M):

| # | Вопрос | Ожидание |
|---|--------|----------|
| 1 | Сколько полок? | 2, источник из РЭ |
| 2 | Внутренний объём? | 1 896 л |
| 3 | Как включить / первый запуск? | шаги из раздела эксплуатации |
| 4 | Влажность не снижается | процедура / таблица неисправностей, не общий FAQ |
| 5 | Красный индикатор мигает | grounded или уточнение |
| 6 | Производитель датчика влажности | abstain / «не указано в документе» |
| 7 | Дым из шкафа | emergency текст без выдумки |
| 8 | SDB702 при том же аккаунте | старое поведение (если не в honest list) |

---

### Фаза 6 — Runbook + ops (после пилота)

- [x] **Runbook:** [`RUNBOOK_EQUIPMENT_PORTAL.md`](RUNBOOK_EQUIPMENT_PORTAL.md) — start/stop, Docker, Ollama, `.env`, smoke, troubleshooting.
- [x] **Скрипты:** `npm run stack:start` / `npm run stack:stop` → `scripts/start-equipment-stack.ps1`, `scripts/stop-equipment-stack.ps1`.
- [x] Отчёт: [`reports/sdb1560m-honest-restore-phase6-2026-10-28.md`](reports/sdb1560m-honest-restore-phase6-2026-10-28.md).

**Document extract (PDF/table)** — не «deterministic FAQ». Новый spec → **extract + focusParameter + inject** в `honest-contextual-extract.js`, **не** `sdb1560m-direct-facts.js`.

Rollout 702/1106 / SOVA — **отдельное** решение.

---

## Роли

| Роль | Задача |
|------|--------|
| **Агент в QR** | Фазы 1–4, PR, eval-отчёт |
| **Ревью (SOVA / этот чат)** | Архитектура, чеклист фаз, разбор провалов eval, не расширять scope на SOVA API без решения |
| **Вы** | Merge, стенд, порог приёмки фазы 4 |

**Что присылать на ревью после каждой фазы:** diff, env, 1 страница отчёта (критерий фазы ✅/❌), 3 примера trace.

---

## Риски

| Риск | Митигация |
|------|-----------|
| Пустой / устаревший ingest | Фаза 1 gate; не включать honest без чанков |
| Post-gate скрывал ошибки LLM | Honest отключает подмену; усилить `validateAnswerAgainstContext` |
| `test:sdb1560m` падает | Split legacy vs honest tests |
| Расхождение карточки и РЭ (RH 1–50 vs тест «0–80») | Источник истины — ingested doc; поправить eval expectations |
| Нагрузка LLM | `CHAT_SELF_CORRECT=0`, умеренный `RETRIEVAL_TOP_K`, один embed batch |

---

## Связь с SOVA RAG (будущее)

Коллекция `sova_equipment` в `sova_rag_system` пока **не залита**. После успешного пилота в QR возможен **опциональный** экспорт чанков в JSON формат `docs_scoped/equipment/` — **не** блокер для фаз 0–5.

Ссылка на зеркало плана в корпоративном RAG-репо:  
`sova_rag_system/docs/QR_SDB1560M_HONEST_RAG_PILOT.md`

---

## Журнал выполнения

| Фаза | Дата | Исполнитель | Результат | PR / commit |
|------|------|-------------|-----------|-------------|
| 0 | 2026-10-28 | Agent | PG 92 chunks, baseline traces, отчёт phase0 | local |
| 1 | 2026-10-28 | Agent | ingest 92 chunks (ранее), smoke PG | local |
| 2 | 2026-10-28 | Agent | honest-rag-mode, smoke OK, отчёт phase2 | local |
| 3 | 2026-10-28 | Agent | runPipeline + honest post-gate, отчёт phase3 | local |
| 4 | 2026-10-28 | Agent | guardrails sdb1560, extract полки, avgScore 0.81 | local |
| 5 | 2026-10-28 | Agent | ✅ waiver B, UAT 8/8, smoke CI — [phase5-close](reports/sdb1560m-honest-restore-phase5-close-2026-10-28.md) | local |
| 6 | 2026-10-28 | Agent | ✅ runbook + stack scripts — [phase6](reports/sdb1560m-honest-restore-phase6-2026-10-28.md), [RUNBOOK](RUNBOOK_EQUIPMENT_PORTAL.md) | local |
