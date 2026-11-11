# Независимый аудит eval-runner SDB1560M (Task 4)

**Дата:** 2026-10-29  
**Объект:** `run-sdb1560m-eval-v1.js`, `sdb1560m-eval-runner-lib.js`, `sdb1560m-eval-http-client.js`, unit-тесты, документация, `package.json`.  
**Метод:** статический разбор кода, транзитивные `require`, мысленные/unit-сценарии метрик. **HTTP, Ollama, PostgreSQL, provisioning, ingest не запускались.** Выполнено: `node scripts/test-sdb1560m-eval-runner-unit.js` → OK.

---

## Резюме для принятия решения

| Вопрос | Вывод |
|--------|--------|
| **Безопасность (изоляция, provisioning, БД, индекс)** | Транзитивные зависимости ограничены Node stdlib + локальный `fetch` в HTTP-клиенте. Provisioning/ingest/`src/rag` в цепочке runner **не обнаружены**. HTTP-режим — только POST `/api/auth/login` и POST `/api/chat`. |
| **Достоверность метрик качества RAG** | **`answer_factual_accuracy` — это доля regex-попаданий по тексту ответа**, не семантическая factual accuracy и не grounding. **`regression_pass_rate` завышается** из‑за логики `deriveCaseStatus` (см. блокирующие замечания). |
| **Можно ли доверять runner перед изменениями RAG?** | **Для измерения качества RAG — пока нет** (только ограниченный сигнал по verified regex + leakage). **Для smoke/инфраструктуры** (валидация suite, manifest, безопасный сбор ответов, layered JSON) — **да, с явными оговорками по метрикам и manifest**. |

---

## 1. Изоляция и пути выполнения CLI

### 1.1 Транзитивные зависимости

| Модуль | `require` / вызовы | Риск |
|--------|-------------------|------|
| `run-sdb1560m-eval-v1.js` | `fs`, `path`, `./sdb1560m-eval-runner-lib`, `./sdb1560m-eval-http-client` | Нет legacy test lib |
| `sdb1560m-eval-runner-lib.js` | `crypto`, `fs`, `path`, `child_process.execSync` (git) | Нет PG, нет `pg`, нет ingest |
| `sdb1560m-eval-http-client.js` | (нет require) | Только `fetch` к двум URL |

**Вывод:** отсутствие запрещённых строк в одном файле **подкреплено** отсутствием импортов `sdb1560m-http-test-lib`, `portal-users`, `ingest-knowledge`, `run-pipeline` и т.п.

### 1.2 Трассировка режимов

| Сценарий | Путь | Сеть | Запись на диск |
|----------|------|------|----------------|
| `npm run eval:sdb1560m:v1` (`--dry-run`) | validate suite → `prepareCases` → `buildRunManifest` → `runEvalDry` → `writeRunOutput` | **Нет** (кроме локального `git` в manifest) | `logs/eval-runs/sdb1560m-<ts>/` или `--out=` |
| CLI без флагов | `dryRun: args.dryRun \|\| !args.allowHttp` → **true** → тот же dry path; `mode: "validate-only"` + `skipReasons` | **Нет HTTP** | То же |
| `--allow-http` | `fetchPayloads` → login 1×, chat N× → `runEvalWithPayloads` | **Да** (login + chat) | Отчёт всегда пишется |
| Нет credentials + `--allow-http` | `getAuthConfig` fail → все payload `_infraError` → `infrastructure_error` на кейс | **Нет** (login не вызывается) | Отчёт с infra |
| Неверный dataset (нет файла) | exit 2 до `writeRunOutput` | Нет | **Нет** |
| Невалидный suite (schema lib) | exit 2 до `writeRunOutput` | Нет | **Нет** |
| Пустая партиция | exit 2 (`cases.length === 0`) | Нет | **Нет** |
| Сервер недоступен | `sessionLogin` throw → все кейсы `_infraError: login failed: …` | Попытка login | Отчёт |
| Ошибка chat на кейс | per-case `_infraError` | Chat для остальных | Отчёт |
| HTTP 200, но пустой/без `answer` | `evaluateCaseLayers` с `answer: ""` | Был chat | Отчёт (см. метрики) |

**Dry-run:** не вызывает `fetch`, не импортирует HTTP-клиент для запросов (импорт есть, но `fetchPayloads` не вызывается). Пишет **только** в каталог отчёта (по умолчанию `logs/eval-runs/…`); это предусмотренное поведение, не «тихая» запись вне контура.

**Побочный эффект dry-run:** `buildGitManifest()` → `git rev-parse` / `git status --porcelain` (локально, не БД).

### 1.3 Provisioning и опасные режимы CLI

- `noProvision` **всегда true** в `parseArgs`; флаг `--no-provision` только подтверждает. **Нет CLI-флага**, который отключил бы `noProvision` (проверка `if (!args.noProvision)` — защита «на будущее», сейчас недостижима).
- **Нет** `--allow-provision`, **нет** `EVAL_AUTO_LOGIN` в runner.
- Ошибка авторизации: **одна** попытка login; при fail — `_infraError` на все кейсы, **без** повторного создания пользователя (создание и так отсутствует в коде).
- `npm run eval:sdb1560m:v1:http` → `--allow-http` без dry-run: **существенный UX-риск** случайного HTTP при наличии credentials в shell (не provisioning).

**HTTP-режим:** только JSON `{ login, password, equipment }` на login и `{ equipmentId, message, history }` на chat — других endpoint’ов в клиенте нет.

---

## 2. Валидность метрик (сценарии и ложные `pass`)

Ниже: мысленные сценарии через `evaluateCaseLayers` + `deriveCaseStatus` + `computeMetrics` (при необходимости подтверждены вызовом lib в unit-стиле, без HTTP).

| # | Сценарий | Ожидание (контур spec) | Фактическое поведение | Ложный `pass`? |
|---|----------|------------------------|------------------------|----------------|
| S1 | Пустой набор после партиции | exit до прогона | exit 2, отчёт не создаётся | N/A |
| S2 | Все кейсы `blocked` | factual accuracy N/A | denominator 0, `value: null` | Нет |
| S3 | Все `infrastructure_error` | метрики без «100%» | factual/leakage/regression denominators 0 → `null` | Нет |
| S4 | Правильное число, **неверная единица** (`260 lb`, этalon `260` kg) | fail factual | `requiredFacts[].unit` **не используется**; pattern `260` → **factual pass** | **Да** |
| S5 | Число только в **отрицании** («не 260, а 180») | fail | regex по всему ответу → **260 match** → factual pass | **Да** |
| S6 | Верный факт + противоречие («260 кг, также 180») | fail (leakage/fact) | forbidden `180` → **fail** leakage | Нет |
| S7 | Запрещённая модель (`\b18\b` в ответе) | fail | forbiddenLeakage fail → overall fail | Нет |
| S8 | Нет обязательного факта | fail | factual fail | Нет |
| S9 | `sources[]` есть, **chunk text нет** | grounding N/A; не «grounded pass» | grounding `not_evaluable`; retrieval может **pass** по `mustIncludeSourceDocPatterns` (weak), **не влияет на overall** | overall может **pass** при factual pass **без** grounding |
| S10 | `must_abstain`, **нет** `allowedAbstainPatterns` (draft: `foreign.sdb1106-mass`) | abstention scored / fail if answers | abstention `not_evaluable`; `deriveCaseStatus` → **`pass`** при `factual not_applicable` + leakage ok | **Да** (ответ с фактом без forbidden) |
| S11 | `must_abstain` с rules, ответ **не** abstain-like | fail | abstention fail → overall fail | Нет |
| S12 | `must_answer`, **нет** `requiredFacts` (`leak.neg-1106-shelf-18`) | leakage-only | factual `not_applicable`; без forbidden → **overall pass** при любом «обычном» ответе | **Да** (by design leakage-only, но regression считает pass) |
| S13 | Pattern `40` в ответе «**140** W» | fail | подстрока `40` → factual **pass** | **Да** |
| S14 | Dry-run / not_run | не в знаменателях | excluded | Нет |

**Именование:** метрика `answer_factual_accuracy` **не является** factual accuracy в смысле реестра фактов/PDF — только **доля кейсов, где все `requiredFacts.claimPattern` совпали с текстом ответа (regex, флаг `iu`)**.

**`scoring.countsToward` в dataset игнорируется** — метрики считаются по жёстким правилам в `computeMetrics`, не по полям кейса.

**Не реализовано из schema:** `abstentionRules.forbiddenHedgingPatterns`, `forbiddenAbstainWhen`, `requiredFacts.unit`, `mustNotRelyOnSourceAlone` (только комментарий в retrieval detail).

---

## 3. Семантика статусов и знаменателей

### 3.1 Итоговый verdict кейса (`deriveCaseStatus`)

Порядок (упрощённо):

1. `infraError` → `infrastructure_error`
2. `blocked_pending_source_resolution` → `blocked` (или `fail` если forbidden leakage)
3. `forbiddenLeakage === fail` → `fail`
4. `factual === fail` → `fail`
5. `factual === pass` → `pass`
6. `must_abstain` + abstention pass/fail
7. `factual not_applicable` + forbidden pass → **`pass`**
8. **default → `pass`** («no failing layers»)

**Слои `retrieval` и `grounding` не участвуют** в overall status.

### 3.2 Метрики

| Метрика | Числитель | Знаменатель (фильтр `overall`) | blocked | not_run | infra | Примечание |
|---------|-----------|----------------------------------|---------|---------|-------|------------|
| `answer_factual_accuracy` | `layers.factual === pass` | `ready` + `must_answer` + `requiredFacts.length > 0`, status ∉ {not_run, infra} | Исключены (не попадают в eligible) | Исключены | Исключены | **Не** исключает `informational_only`; кейсы `either_*` с `ready` редки — factual layer blocked для `either` mode |
| `cross_model_leakage_rate` | forbidden fail | `forbiddenClaims.length > 0`, status ∉ {not_run, infra} | **Включены** | Исключены | Исключены | Соответствует идее «leakage без gold» |
| `regression_pass_rate` | `overall === pass` | status ∉ {blocked, not_run, infra} | Исключены | Исключены | Исключены | **Включены** `informational_only`, `must_abstain` без abstention rules → завышение |
| `retrieval_recall_at_k` | — | — | — | — | — | **всегда `value: null`** |
| `grounded_claim_rate` | — | — | — | — | — | **всегда `value: null`** (агрегат) |

**Нулевой знаменатель:** `value: null`, в SUMMARY — `n/a (den=0)` — корректно, не 100%.

**Расхождение с contour-spec §D.7:** spec предполагает composite с retrieval/abstention; runner **не** реализует composite — только упрощённый `deriveCaseStatus`.

---

## 4. Manifest и воспроизводимость

| Поле | Источник | Риск misinterpretation |
|------|----------|------------------------|
| `git.commit`, `dirty`, `dirtyLineCount` | локальный git | При `dirty: true` note предупреждает; **нет** списка изменённых файлов / patch hash — **нельзя однозначно** восстановить полное дерево исходников |
| `serverEnvFingerprint.*` | **`process.env` клиента runner** | **Не** env работающего сервера (spec §E.1 рекомендует health/pre-flight). Значения `RAG_PURE=1` в shell **не доказывают** конфигурацию portal |
| `OLLAMA_MODEL`, `EMBEDDING_MODEL` | client env или `unknown` | То же |
| `indexFingerprint` | `EVAL_INDEX_FINGERPRINT` или `unknown` | Не читает БД; **не** подтверждает индекс |
| `dataset.sha256` | файл dataset | Надёжно для **файла сценариев** |
| `run.mode`, `authMode` | runner | После HTTP прогона `authMode` обновляется (`missing_credentials`, `login_failed`, `eval_login`) |

**Секреты:** пароли/логины не пишутся (unit-тест подтверждает) — **OK**.

**Ошибка:** manifest **не** утверждает, что server env подтверждён, но поле названо `serverEnvFingerprint` — **может читаться как серверный снимок** (существенный риск интерпретации).

---

## 5. Замечания по уровням

### 5.1 Блокирующие (достоверность результатов для оценки качества RAG)

| ID | Файл / функция | Сценарий | Ожидание | Факт | Риск | Влияние на достоверность |
|----|----------------|----------|----------|------|------|---------------------------|
| B1 | `sdb1560m-eval-runner-lib.js` / `deriveCaseStatus` | `must_abstain` без `allowedAbstainPatterns`; ответ — развёрнутый **неправильный** факт, forbidden не сработал | `fail` или `not_evaluable` overall | **`pass`** (ветка `not_applicable` + default) | Высокий | `regression_pass_rate` и summary pass **не отражают** качество abstention |
| B2 | `sdb1560m-eval-runner-lib.js` / `evaluateCaseLayers` + метрика `answer_factual_accuracy` | S4, S5, S13 — единицы, отрицание, подстрока | семантически корректный fact check | **regex pass** | Высокий | **Нельзя** использовать метрику как «factual accuracy RAG» |
| B3 | `sdb1560m-eval-runner-lib.js` / `deriveCaseStatus` | default `pass` при непроверенных слоях (retrieval fail, grounding fail, abstention not_evaluable) | fail или explicit inconclusive | **pass** если forbidden/factual не fail | Высокий | Завышение `regression_pass_rate` |

### 5.2 Существенные

| ID | Файл / функция | Сценарий | Ожидание | Факт | Риск | Влияние |
|----|----------------|----------|----------|------|------|---------|
| M1 | `buildRunManifest` | Сравнение прогонов «при одинаковом RAG_PURE» | fingerprint **сервера** | только env **клиента** | Средний | Ложные выводы о причинах регрессий |
| M2 | `computeMetrics` / draft suite | `scoring.countsToward` в JSON | учёт весов/метрик | **игнорируется** | Средний | Dataset обещает больше, чем runner считает |
| M3 | `validateSuiteDocument` vs JSON Schema | `equipmentId` required на кейс в schema | строгая валидация | lib **не требует** поле на кейсе | Низкий–средний | Draft suite без per-case `equipmentId` проходит |
| M4 | `evaluateCaseLayers` | `retrievalExpectations` + sources без chunks | weak pass не должен влиять на regression | retrieval pass **не** влияет на overall; metric recall null | Средний | Иллюзия «retrieval ok» в layer при пустом grounding |
| M5 | `run-sdb1560m-eval-v1.js` | `--allow-http` + exit code | infra fail vs model fail | exit 1 при **любом** fail/infra в HTTP mode | Средний | CI/скрипты не различают «среда» vs «модель» |
| M6 | `package.json` | `eval:sdb1560m:v1:http` | явный opt-in | one-liner без dry-run | Средний | Случайный HTTP (безопасность данных/нагрузка, не provisioning) |
| M7 | contour-spec vs runner | `informational_only` в regression | optional exclude | **в знаменателе** regression | Средний | Завышение pass rate |
| M8 | `cross_model_leakage_rate` | название «cross_model» | только forbidden regex | не все leakageModel отдельно | Низкий–средний | Ограниченный сигнал, но честный note в metric |

### 5.3 Косметические

| ID | Файл | Замечание |
|----|------|-----------|
| K1 | `run-sdb1560m-eval-v1.js` | После `validation.ok` exit 2 недостижим (строки 174–176) |
| K2 | `sdb1560m-eval-runner.md` | «factual accuracy» без явного «regex-only» в заголовке таблицы |
| K3 | unit-тест `testNoProvisioningInRunnerSources` | regex по исходникам — полезный guard, **не** замена review транзитивных deps |
| K4 | `SUMMARY.md` | не показывает count `infrastructure_error` / `not_run` |

---

## 6. Unit-тесты runner (что покрыто / не покрыто)

**Выполнено:** `test-sdb1560m-eval-runner-unit.js` — OK.

**Покрыто:** blocked в factual denominator, zero denominator, manifest secrets, dry report shape, retrieval/grounded metrics null, базовая deriveCaseLayers.

**Не покрыто (пробелы аудита):** B1/B3 (must_abstain false pass), S5/S13 (regex false positive), `deriveCaseStatus` + retrieval fail, HTTP paths (намеренно), соответствие `scoring.countsToward`.

---

## 7. Ответ на главный вопрос

**Можно ли использовать текущий runner для измерения качества RAG?**

- **Нет — как источник одной «главной цифры» качества** (`answer_factual_accuracy`, `regression_pass_rate` в текущей семантике). Regex, ложные pass на abstention и default `pass` делают эти метрики **несопоставимыми** с целями contour-spec и с риском **переоценить** RAG после правок.
- **Да — с ограничениями:**
  - **Smoke / gate инфраструктуры:** валидация dataset, manifest (git + dataset hash), безопасный HTTP-сбор без provisioning.
  - **Узкий сигнал:** verified-подмножество с **ручной** интерпретацией ответов в `report.json`; **`cross_model_leakage_rate`** по явным forbidden patterns — **частично** достоверен при HTTP.
  - **Dry-run** — только готовность контура, **не** качество модели.

**Рекомендация перед изменениями production RAG:** использовать runner для **воспроизводимых прогонов и архивации ответов**; метрики в SUMMARY **не** использовать как KPI без переименования (например «regex_match_rate») и без исправления B1–B3 (отдельная задача, не Task 4).

---

## 8. Подтверждение ограничений Task 4

- Production-код, legacy наборы, `.env`, БД, индекс **не изменялись** в ходе этого аудита.
- Создан только этот отчёт: `docs/reports/sdb1560m-eval-runner-independent-audit.md`.
- HTTP/Ollama/PostgreSQL/provisioning/ingest **не запускались**.
