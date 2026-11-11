# SDB1560M — спецификация надёжного eval-контура (Задача 2)

**Дата:** 2026-10-29  
**Предпосылки:** [`sdb1560m-facts-and-eval-audit.md`](sdb1560m-facts-and-eval-audit.md), [`sdb1560m-eval-plan-proposed.json`](sdb1560m-eval-plan-proposed.json), PDF-доказательства в [`sdb1560m-audit-pdf-pages/`](sdb1560m-audit-pdf-pages/).  
**Git (из Задачи 1):** ветка `backup/sova-portal`, commit `8523954fadcc4f31b92305f81b8dfc09f3e61a14`, незакоммиченные изменения сохранены.

**Ограничения этапа:** `server.js`, `src/rag/**`, существующие JSON-наборы live/ad-hoc, `evaluateHttpCase`, ingest, `.env`, БД — **не изменялись**. Тесты с provisioning **не запускались**.

**Новые артефакты (не перезаписывают Task 1):**

| Файл | Назначение |
|------|------------|
| [`sdb1560m-eval-contour-spec.md`](sdb1560m-eval-contour-spec.md) | этот документ |
| [`sdb1560m-eval-case-schema-v1.json`](sdb1560m-eval-case-schema-v1.json) | JSON Schema черновик кейса |
| [`sdb1560m-eval-suite-draft-v1.json`](sdb1560m-eval-suite-draft-v1.json) | пример набора сценариев |

---

## Этап A. Существующие тесты — интерфейсы и побочные эффекты

### A.1 Общая библиотека HTTP

**Файл:** `scripts/sdb1560m-http-test-lib.js`

| Экспорт | Назначение |
|---------|------------|
| `parseCliFlags()` | `--strict`, `--runs=N` |
| `minPassCount(total, strict)` | strict → ceil(90%×N) |
| `provisionEvalUser(label)` | **INSERT** пользователя в Postgres (`createPortalUser`) |
| `sessionLogin(login, password)` | POST `/api/auth/login` → cookie |
| `chat(cookie, equipmentId, message, history?)` | POST `/api/chat` |
| `evaluateHttpCase(c, payload, suite)` | Regex pass/fail + PDF abstain audit |
| `sourcesIncludeManual(payload)` | PDF в `sources[].sourceDoc` |
| `isAbstainTemplateAnswer(answer)` | STRICT_ABSTAIN + hedging regex |
| `appendAbstainAudit(entry)` | **append** `logs/sdb1560m-abstain-with-pdf-audit.jsonl` |

**Что реально проверяет `evaluateHttpCase`:**

1. `mustMatch[]` — regex по **только тексту ответа** (без grounding в chunk).
2. `mustNotMatch[]` — инверсный regex.
3. `requireManualSource` — PDF **в списке sources**, не в теле чанка.
4. Если PDF в sources и **нет** `allowAbstainWithPdf` — ответ не должен быть abstain-template (включая STRICT_ABSTAIN).

**Чего не проверяет:** корректность факта, соответствие ответа chunk-тексту, retrieval recall, утечку другой модели (кроме случайных regex), различие «правильный abstain» vs «ошибочный abstain» при пустом контексте.

**Побочные эффекты при запуске:** создание portal-user; рост audit JSONL; запись логов результатов (см. ниже).

**Env (только в процессе node-теста, не server):** скрипты выставляют `RAG_HONEST_EQUIPMENT`, `RAG_PURE` — **сервер должен совпадать**, иначе смысл прогона другой.

---

### A.2 Live regression

**Команда:** `npm run test:sdb1560m:live-regression` → `node scripts/test-sdb1560m-live-regression.js [--strict] [--runs=3]`

| Параметр | Значение |
|----------|----------|
| Dataset | `data/live-user-regression-sdb1560m.json` (20 кейсов) |
| Output | `logs/live-user-regression-sdb1560m.json` |
| Auth | **always** `provisionEvalUser("live_reg")` |
| Exit | non-strict: fail если не 20/20; strict: fail если run < 90% |

**Проверяет:** см. A.1 + anti-abstain при PDF для большинства ТТХ с `requireManualSource: true`.

**Известные слабости:** `(2|4)` полки; объёмы 896/2070 без verified PDF; `pure-loud-beep` запрещает STRICT_ABSTAIN; follow-up с фиктивной историей.

---

### A.3 Ad-hoc probe

**Команда:** `npm run test:sdb1560m:ad-hoc-probe` → `node scripts/test-sdb1560m-ad-hoc-probe.js`

| Параметр | Значение |
|----------|----------|
| Dataset | `data/ad-hoc-probe-sdb1560m.json` (~30 кейсов) |
| Output | `logs/ad-hoc-probe-sdb1560m.json` |
| Blocking | **всегда** ≥90% (27/30) |
| Auth | `provisionEvalUser("adhoc_probe")` |

**Отличие от live:** нет `requireManualSource` на большинстве кейсов; `(40|415)` на «без опций»; один кейс `allowAbstainWithPdf: true` (vendor sensor).

---

### A.4 Honest smoke (+ CI wrapper)

**Команды:** `npm run test:sdb1560m:honest-smoke` / `:honest-smoke:ci` (CI: `HONEST_SMOKE_REQUIRE_HTTP=1`, `RAG_PURE=1`)

**Файл:** `scripts/test-sdb1560m-honest-smoke.js`

| Фаза | Зависимости | Проверки |
|------|-------------|----------|
| In-process | Postgres + Ollama + **runPipeline** | honest не deterministic shelf; PDF in sources; top source not card; shelf `(2\|4)` or STRICT_ABSTAIN (pure) |
| HTTP (optional) | Server :3000 + **provisionEvalUser** | post-gate trace; no «параметр не указан»; shelf soft rules |

**Побочные эффекты:** PG user при HTTP; in-process **читает/пишет через RAG pipeline** (не меняет ingest, но нагружает PG/Ollama).

**Не проверяет:** полный regression; метрики abstain/grounding раздельно.

---

### A.5 Profile unit test (legacy deterministic)

**Команда:** `npm run test:sdb1560m` → `scripts/test-sdb1560m-profile.js`

**Проверяет:** `tryDeterministicSdb1560mAnswer`, chat-gate, prompt rules, **legacy** post-gate — **не** HTTP honest path. Эталоны встроены в код (в т.ч. **2 полки**, **415 W** для 1560 с опциями — расходится с PDF audit).

**Побочные эффекты:** нет PG user; только Node assert.

---

### A.6 Прочие eval (не 1560-specific, но в repo)

| Команда | Побочные эффекты |
|---------|------------------|
| `npm run eval:rag` / `eval:sdb1560m:cards` | HTTP; `EVAL_AUTO_LOGIN=1` → **provision**; другие datasets |
| `npm run ingest:knowledge` | **Перезапись индекса** |
| `npm run eval:sdb1560m:phase6-tail` | см. скрипт (может HTTP) |
| `npm run uat:sdb1560m:api` | HTTP |

---

### A.7 Отчёты и логи (read-only артефакты)

- `logs/live-regression-run-latest.log`, `logs/live-user-regression-sdb1560m.json`
- `logs/ad-hoc-probe-sdb1560m.json`
- `docs/reports/sdb1560m-accuracy-90-2026-10-28.md`, `sdb1560m-rag-pure-2026-10-28.md`

Сравнивать прогоны **только** с одинаковым git SHA, env сервера и версией индекса.

---

## Этап B. Схема eval-кейса (v1)

Полная схема: [`sdb1560m-eval-case-schema-v1.json`](sdb1560m-eval-case-schema-v1.json).

### B.1 Совместимость с legacy JSON

| Legacy (`live-user-regression`) | Новое поле |
|-----------------------------------|------------|
| `id` | `id` |
| `message` | `message` |
| `history` | `history` |
| `mustMatch` | `legacyCompat.mustMatch` **или** `requiredFacts[].claimPattern` |
| `mustNotMatch` | `forbiddenClaims[].pattern` |
| `requireManualSource` | **не** переносить 1:1 → `retrievalExpectations` + `abstentionRules.forbiddenAbstainWhen` |
| `allowAbstainWithPdf` | `abstentionRules` + `expectedOutcome.mode` |

### B.2 Ключевые поля

- **`resolutionStatus`**
  - `ready` — можно оценивать `answer_factual_accuracy`.
  - `blocked_pending_source_resolution` — **нет** `requiredFacts`; только leakage / abstention / routing.
  - `informational_only` — поведенческие кейсы без числового эталона.

- **`expectedOutcome.mode`**
  - `must_answer` — достаточные доказательства должны быть в контексте (retrieval) и ответ должен содержать `requiredFacts`.
  - `must_abstain` — корректный отказ (unsupported / нет данных).
  - `either_abstain_or_answer_if_grounded` — для blocked/conflict: runner не считает factual pass/fail.

- **`requiredFacts`** — только verified fact ids; **без выдуманных чисел** для blocked.

- **`forbiddenClaims`** — для leakage и hedging (в т.ч. с `leakageModel`).

- **`retrievalExpectations`** — отдельно от генерации; `mustNotRelyOnSourceAlone: true` по умолчанию.

### B.3 Заблокированные fact ids (не в factual accuracy)

Из реестра фактов: `F-SHELF-KIT`, `F-DESICC-KIT`, `F-DOORS-COUNT`, `F-VOL-INT`, `F-VOL-FULL`, `F-PWR-DRY-OPT` — см. `suiteMeta.blockedFactIds` в draft suite.

---

## Этап C. Сценарии по категориям

Примеры в [`sdb1560m-eval-suite-draft-v1.json`](sdb1560m-eval-suite-draft-v1.json). Ниже — что проверяется и какие доказательства нужны.

| # | Категория | Что проверяется | Доказательства для pass |
|---|-----------|-----------------|-------------------------|
| 1 | **numeric_spec** | Число + единица; не соседняя строка таблицы | Chunk содержит значение **и** маркер SDB1560M; verified fact id |
| 2 | **kit_completeness** | Состав поставки | Табл. 1.2 с подпунктом модели; **blocked** до C1/C2 |
| 3 | **operating_mode** | Режимы, запреты (регенерация) | Раздел РЭ; формулировка «Запрещается» |
| 4 | **maintenance** | Периодичность ТО | Табл. 3.1 / 36 месяцев в chunk |
| 5 | **alarm_troubleshooting** | Штатный сигнал / п. 3.2 | П. 1.1.4.3.4 или 3.1.4 в context; abstain только если нет |
| 6 | **unsupported_by_manual** | Wi‑Fi, vendor sensor… | `must_abstain`; не требовать PDF в sources |
| 7 | **foreign_model** | SDB1106NM в чате 1560 | Отказ / scope; **нет** 260↔180 подмены |
| 8 | **paraphrase** | Тот же fact id, другая формулировка | Те же `requiredFacts`, что base case |
| 9 | **dialog_followup** | Rewrite/history | Routing + grounded answer; factual blocked если fact blocked |
| 10 | **contradictory_context** | Poisoned assistant turn | Ответ не должен blindly повторять history без RE |

**Принципы (из требований):**

- PDF в `sources` **не** implies pass.
- Низкий score **не** implies must abstain, если chunk-текст содержит span факта (оценивается отдельно в `answerable_abstention_rate` vs `retrieval_recall_at_k`).

---

## Этап D. Метрики (раздельно)

### D.1 `retrieval_recall_at_k`

| | |
|--|--|
| **Числитель** | Кейсы `resolutionStatus=ready`, где ≥1 chunk в top-k (или prompt chunks) matches `retrievalExpectations.mustIncludeChunkPatterns` **или** contains all tokens from `sourceHint` |
| **Знаменатель** | Все `ready` кейсы с непустым `retrievalExpectations` |
| **Неопределено** | Нет экспорта chunk text в HTTP response (сегодня — **нужен** `ragTrace` / session log) |
| **Не смешивать** | Не зависит от текста ответа |

### D.2 `answer_factual_accuracy`

| | |
|--|--|
| **Числитель** | `ready` + `must_answer` + все `requiredFacts.claimPattern` match answer |
| **Знаменатель** | `ready` + `must_answer` **минус** cases с `blocked` fact ids |
| **Неопределено** | Кейс `either_abstain_or_answer_if_grounded` |
| **Не смешивать** | Игнорировать retrieval pass при PDF-only legacy rule |

### D.3 `grounded_claim_rate`

| | |
|--|--|
| **Числитель** | Существенные claims (extracted или regex from answer) with substring in **union of prompt chunk texts** |
| **Знаменатель** | Число существенных claims в answer для `must_answer` ready cases |
| **Неопределено** | Без chunk text в trace — metric **N/A** |
| **Не смешивать** | Factual wrong but grounded → низкая accuracy, высокий grounded (отдельные сигналы) |

### D.4 `correct_abstention_rate`

| | |
|--|--|
| **Числитель** | `must_abstain` cases where answer matches `allowedAbstainPatterns` and no forbidden fact patterns |
| **Знаменатель** | All `must_abstain` |
| **Неопределено** | — |

### D.5 `answerable_abstention_rate` (ошибочный отказ)

| | |
|--|--|
| **Числитель** | Abstain-template **или** STRICT_ABSTAIN when `forbiddenAbstainWhen.chunkContainsPatterns` satisfied |
| **Знаменатель** | Cases where retrieval recall = 1 (доказательства **были** в контексте) |
| **Неопределено** | Recall unknown → exclude from denominator |
| **Legacy pitfall** | `requireManualSource` + PDF in sources treated as «answerable» — **слишком слабое** доказательство; новый контур требует chunk span |

### D.6 `cross_model_leakage_rate`

| | |
|--|--|
| **Числитель** | Answer matches any `forbiddenClaims` with `leakageModel` or known foreign numerics (180, 18, 415 as 1560-with-options, etc.) |
| **Знаменатель** | All executed cases (including blocked — leakage testable without gold value) |
| **Неопределено** | — |

### D.7 `regression_pass_rate`

| | |
|--|--|
| **Числитель** | Cases passing **runner’s** composite verdict (per-layer AND, not single regex) |
| **Знаменатель** | Executed cases excluding `informational_only` optional skips |
| **Неопределено** | Blocked factual cases contribute only non-factual sub-scores |

**Рекомендуемый composite (будущий runner, не CI gate):**

```
pass = (retrieval_ok OR must_abstain) 
  AND (factual_ok OR blocked OR must_abstain) 
  AND NOT leakage 
  AND NOT answerable_abstain
```

---

## Этап E. Воспроизводимость

### E.1 Manifest каждого прогона (`eval-run-manifest.json`)

Обязательные поля (снимок **без секретов**):

```json
{
  "capturedAt": "ISO-8601",
  "git": { "branch": "...", "commit": "...", "dirty": true, "dirtyFilesCount": 0 },
  "serverEnvFingerprint": {
    "RAG_HONEST_EQUIPMENT": "sdb1560m",
    "RAG_PURE": "1",
    "OLLAMA_MODEL": "<name-only>",
    "EMBEDDING_MODEL": "bge-m3",
    "note": "Read from server /health or pre-flight API — not from test process env alone"
  },
  "indexFingerprint": {
    "method": "max(updated_at) from knowledge_chunks WHERE equipment_id=sdb1560m OR ingest git note",
    "value": "TBD — requires read-only SQL or ingest metadata file"
  },
  "datasets": [{ "path": "...", "sha256": "..." }],
  "suiteSchemaVersion": "1.0-eval-contour"
}
```

### E.2 Согласование server vs client

| Проблема | Мера |
|----------|------|
| Test sets `RAG_PURE` locally; server old | Pre-flight: GET/POST probe или documented `npm start` + echo env в server log |
| Разные commits | Manifest git SHA; **не сравнивать** прогоны |
| Flaky Ollama | Отдельный код `infra_error` — не считать model failure |

### E.3 Auth без implicit provisioning

| Режим | Описание |
|-------|----------|
| **Recommended** | `EVAL_LOGIN` + `EVAL_PASSWORD` fixed test user (создан вручную один раз) |
| **Legacy** | `provisionEvalUser` — явно помечать в manifest `authMode: "provision"` |
| **Запрет для нового runner** | Default **no provision**; `--allow-provision` opt-in |

### E.4 Изолированная тестовая БД (отдельное требование, не создавать автоматически)

- Отдельный `POSTGRES_URL` (например `equipment_rag_eval`) + restore from `backups/equipment_rag.dump` **вручную**.
- Фиксированный ingest hash после restore.
- Portal users только eval-учётки.

### E.5 Безопасные команды (read-only / no provision)

| Команда | Безопасность |
|---------|--------------|
| `node scripts/test-sdb1560m-profile.js` | OK (unit, no HTTP PG user) |
| Чтение `logs/*.json` | OK |
| `npm run test:sdb1560m:live-regression` | **PG user + HTTP + audit append** |
| `npm run test:sdb1560m:ad-hoc-probe` | то же |
| `npm run test:sdb1560m:honest-smoke` | PG+Ollama pipeline; HTTP optional provision |
| `npm run ingest:knowledge` | **Меняет индекс** |

**Предлагаемый будущий entrypoint (не реализован):**  
`node scripts/run-sdb1560m-eval-v1.js --manifest --no-provision --dataset docs/reports/sdb1560m-eval-suite-draft-v1.json`  
→ пишет `logs/eval-runs/<timestamp>/` (results + manifest), **не** exit 1 on blocked factual denominator.

---

## 1. Что уже есть и что реально проверяют (кратко)

| Suite | Слой | Суть проверки |
|-------|------|----------------|
| live-regression | HTTP + regex | Substrings + PDF in sources + anti-abstain |
| ad-hoc-probe | HTTP + regex | Шире перефразы; 90% gate; слабее source rules |
| honest-smoke | Pipeline + HTTP | Один вопрос (полки); path/trace; `(2\|4)` |
| profile.js | Unit legacy | Deterministic FAQ эталоны (не honest pure) |

**Надёжно отличать 6 типов из цели — сегодня нельзя** одним `evaluateHttpCase`.

---

## 2. Какие метрики можно считать достоверно **сейчас**

| Метрика | Достоверность с текущим HTTP API |
|---------|----------------------------------|
| `cross_model_leakage_rate` | **Частично** — по forbidden regex в answer |
| `regression_pass_rate` (legacy) | **Да** — но это regex pass, не factual accuracy |
| `answer_factual_accuracy` | **Только** verified subset (mass, IP, 36 mo, 40W base, regen forbid…) |
| `retrieval_recall_at_k` | **Нет** — нет chunk bodies в standard payload |
| `grounded_claim_rate` | **Нет** |
| `correct_abstention_rate` / `answerable_abstention_rate` | **Нет** — PDF in sources ≠ chunk grounding |

---

## 3. Сценарии, заблокированные до разрешения конфликтов

Не включать в **точный** `answer_factual_accuracy` (status `blocked_pending_source_resolution`):

- Полки в комплекте (C1)
- Число осушителей (C2)
- Внутренний / полный объём (C4)
- Двери — 4 шт. (unverified)
- Мощность осушения **с** опциями — 810 vs 415 (C3)

Для них в draft suite оставлены **leakage** и **abstention** sub-metrics.

---

## 4. Изменения для безопасного внедрения eval (будущие задачи)

1. **Runner v1** (новый скрипт + lib, не ломая legacy): schema validator, manifest, layered verdict, `--no-provision`.
2. **Trace export:** расширить test client или chat session log consumer для `promptChunks` / `retrievalContext` hash (без изменения RAG logic — только read log если уже пишется).
3. **Datasets:** перевести verified cases из draft → `data/sdb1560m-eval-verified-v1.json`; blocked — отдельный файл.
4. **Документация:** после ответов документовладельца — обновить fact registry → снять `blocked` → включить в accuracy denominator.
5. **CI:** не подключать draft suite as merge gate; legacy live-regression оставить до явного решения команды.
6. **Не делать на этом этапе:** правки `evaluateHttpCase`, live JSON, `src/rag/**`.

---

## 5. Команды с побочными эффектами (справочник)

| Команда | PG users | Index | Logs append | Ollama/HTTP |
|---------|----------|-------|-------------|-------------|
| `test:sdb1560m:live-regression` | create user | — | audit jsonl + results json | да |
| `test:sdb1560m:ad-hoc-probe` | create user | — | audit + results | да |
| `test:sdb1560m:honest-smoke` | create user (HTTP) | — | — | pipeline + optional HTTP |
| `test:sdb1560m:honest-smoke:ci` | то же | — | — | HTTP required |
| `test:sdb1560m` (profile) | — | — | — | — |
| `ingest:knowledge` | — | **rewrite** | — | embed |
| `eval:sdb1560m:cards` | auto login option | — | eval output | да |
| `stack:start` / `docker:db` | — | — | — | infra |

---

## Связь с Задачей 1

- Эталонные **числа** для blocked facts — только после ответов из §3 [`sdb1560m-facts-and-eval-audit.md`](sdb1560m-facts-and-eval-audit.md).
- [`sdb1560m-eval-plan-proposed.json`](sdb1560m-eval-plan-proposed.json) остаётся; draft suite v1 — расширение с категориями и `scoring.countsToward`.

**Качество RAG на этом этапе не заявлялось и не измерялось** — подготовлен контур и метрики для последующего внедрения.
