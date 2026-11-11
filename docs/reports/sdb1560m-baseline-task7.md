# SDB1560M — baseline production RAG (Task 7)

**Дата:** 2026-10-29  
**Статус:** **HTTP baseline не выполнен** — блокер авторизации (см. §5). Выполнены preflight, выборка, фиксация окружения (dry-run), артефакты preflight.

---

## 1. Git

| | HEAD | Ветка | Рабочее дерево |
|---|------|-------|----------------|
| **До Task 7** | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` | `backup/sova-portal` | dirty (~58 файлов в porcelain) |
| **После Task 7** | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` | `backup/sova-portal` | dirty (без reset/checkout/clean/stash) |

Production-код (`server.js`, `src/rag/**`), `.env`, БД, индекс, legacy datasets, eval suite **не изменялись**. Provisioning и ingest **не запускались**.

---

## 2. Eval Runner и suite

| Параметр | Значение |
|----------|----------|
| Runner | `scripts/run-sdb1560m-eval-v1.js` |
| Lib version | **`1.2-task6`** (`evalRunnerLibVersion` в manifest) |
| Dataset | `docs/reports/sdb1560m-eval-suite-draft-v1.json` |
| SHA-256 suite | `5bab36e3114852d3154fec6182b53352e0700650e396e4a439d8e25a40afe695` |
| Partition baseline (план) | **`verified`** — только `ready` + `must_answer` + `requiredFacts` |

### Preflight (dry-run)

```text
node scripts/run-sdb1560m-eval-v1.js --dry-run --partition=verified
```

Результат: suite валиден, **6 кейсов**, все `not_run` (HTTP не вызывался).

Артефакты preflight (не перезаписывают Task 0–6):

- `logs/baseline-task7/preflight-manifest.json`
- `logs/baseline-task7/preflight-dry-run-report.json`
- `logs/baseline-task7/preflight-SUMMARY.md`

---

## 3. Выборка baseline vs запрос Task 7

Список фактов из задания сверен с реестром [`sdb1560m-facts-and-eval-audit.md`](sdb1560m-facts-and-eval-audit.md) и **текущим** draft suite (suite **не менялся**).

| Факт (Task 7) | fact_id | PDF verified в реестре | Кейс в draft suite (`ready`) |
|---------------|---------|------------------------|------------------------------|
| Масса 260 кг | F-MASS | да | `num.mass.verified`, `para.mass-colloquial.verified` |
| Габариты 1202×1693×1028 мм | F-DIMS | да | **нет** |
| IP55 | F-IP | да | **нет** |
| 220 В, 50 Гц | F-MAINS | да | **нет** |
| Выход на режим ≤ 3 ч | F-WARMUP | да | **нет** |
| Замена осушителя 36 мес | F-MAINT-DES | да | `maint.desicc-interval.verified` |
| Таймер N₂ 99,9 мин | F-N2-TIMER | да | **нет** |
| Осушение без опций 40 Вт | F-PWR-DRY | да | `num.dry-power-base.verified` |
| Регенерация 540 Вт | F-PWR-REG | да | **нет** (есть `mode.regen-shutdown.verified` — **другое**: запрет выключения при регенерации, не мощность) |

**План HTTP-прогона (6 case ID):**

1. `num.mass.verified` — 260 kg, must_answer, retrieval expectation на PDF  
2. `num.dry-power-base.verified` — 40 W, must_answer  
3. `maint.desicc-interval.verified` — 36 months, must_answer  
4. `mode.regen-shutdown.verified` — запрет выключения (текстовый pattern), must_answer  
5. `alarm.beep-door.verified` — штатный сигнал при открытой двери, must_answer  
6. `para.mass-colloquial.verified` — paraphrase массы 260  

**Пропущены намеренно (не verified partition / blocked / не тот факт):** все `blocked_*`, `leak.neg-*`, `unsupported.*`, `foreign.*`, и **7 фактов из списка Task 7 без кейсов** в suite.

**Пробел:** для полного покрытия списка Task 7 нужны **новые кейсы в отдельной задаче** (не Task 7 — suite не менялся).

---

## 4. Окружение (доступно без изменения конфигурации)

Источник: `preflight-manifest.json` + проверки процесса.

| Поле | Значение | Ограничение |
|------|----------|-------------|
| Git commit | `8523954…` | dirty tree — результат HTTP мог бы включать незакоммиченный код |
| `evalRunnerLibVersion` | `1.2-task6` | |
| Client `RAG_HONEST_EQUIPMENT` | `sdb1560m` | **env процесса runner**, не подтверждение сервера |
| Client `RAG_PURE` | `1` | то же |
| `OLLAMA_MODEL` / `EMBEDDING_MODEL` | `unknown` | runner не опрашивает сервер |
| `EVAL_BASE_URL` | `http://127.0.0.1:3000` | |
| `EVAL_LOGIN` / `EVAL_PASSWORD` | **missing** | см. блокер |
| Index fingerprint | `unknown` | нет `EVAL_INDEX_FINGERPRINT`, нет read-only DB |
| Portal probe | `GET /api/equipment` → **401** | сервер, похоже, слушает :3000; нужна сессия |

Секреты, cookies, пароли **не** записывались.

---

## 5. HTTP-прогон — блокер

### Условие Task 7

HTTP только через runner с `--allow-http` и **уже настроенными** `EVAL_LOGIN` / `EVAL_PASSWORD`. Provisioning запрещён.

### Факт

В среде выполнения Task 7:

- `EVAL_LOGIN` — **отсутствует**
- `EVAL_PASSWORD` — **отсутствует**

Runner **не** загружает `.env` автоматически (только `process.env`). Создание пользователя через legacy `provisionEvalUser` **не допускается**.

### Команда для будущего baseline (без секретов)

```text
set EVAL_LOGIN=<existing-user>
set EVAL_PASSWORD=<secret>
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --out=logs/baseline-task7/http-run-YYYYMMDD
```

Повторные прогоны отдельных кейсов **не выполнялись** (0 HTTP case runs).

### Следствие

- **Сырых ответов RAG, sources[], chunk text нет** в этом Task 7.
- Классификация A–E по кейсам **невозможна** без HTTP payload.
- Метрики runner **не** интерпретируются как KPI качества RAG.

---

## 6. Case-level таблица (план + фактический статус Task 7)

| case_id | Вопрос (кратко) | Ожидаемый факт (suite) | HTTP ответ | Runner overall | Источники / chunks | Диагностика A–E |
|---------|-----------------|------------------------|------------|----------------|--------------------|-----------------|
| `num.mass.verified` | Вес SDB1560M? | 260 kg | *не получен* | `not_run` | — | **insufficient_evidence** |
| `num.dry-power-base.verified` | Осушение без опций? | 40 W | *не получен* | `not_run` | — | **insufficient_evidence** |
| `maint.desicc-interval.verified` | Замена осушителя? | 36 months | *не получен* | `not_run` | — | **insufficient_evidence** |
| `mode.regen-shutdown.verified` | Выключить при регенерации? | запрет | *не получен* | `not_run` | — | **insufficient_evidence** |
| `alarm.beep-door.verified` | Пищит при открытой двери? | штатный сигнал | *не получен* | `not_run` | — | **insufficient_evidence** |
| `para.mass-colloquial.verified` | «Тяжёлый?» | 260 | *не получен* | `not_run` | — | **insufficient_evidence** |

После успешного HTTP: для каждой строки заполнить `answerPreview`, `evidenceUsed`, слои из `report.json`; **runner `pass` ≠ подтверждение фактической корректности** — обязательна ручная строка «нужна ручная проверка» для неоднозначных ответов.

### Ограничения runner для диагностики (штатно)

- Chunk bodies в ответе часто **отсутствуют** → grounding `not_evaluable`, категории B/C по контексту **ограничены**.
- PDF в `sources[]` **не** доказывает grounding.
- Post-gate / trace **не** экспортируются полностью в стандартный chat JSON → категория D часто **insufficient_evidence** без session logs.

---

## 7. Разделение проблем (после HTTP — шаблон)

| Категория | Когда использовать |
|-----------|-------------------|
| **A. Retrieval** | Нужный факт не в retrieved chunks (нужны chunk texts / trace) |
| **B. Context selection** | Факт в chunks, но не в prompt / перебит конфликтом |
| **C. Generation** | Контекст достаточен, ответ неверный / галлюцинация |
| **D. Post-gate** | Ответ изменён/заблокирован после генерации |
| **E. Insufficient evidence** | **Текущее состояние Task 7** для всех кейсов |

---

## 8. Метрики и KPI

До HTTP: все case-level метрики runner **не применимы** (denominator 0 для factual на executed cases).

Не использовать `answer_factual_accuracy` / `regression_pass_rate` из SUMMARY как доказательство качества RAG (heuristic, см. Task 6 audit).

---

## 9. Ручная проверка

| Статус Task 7 | Количество |
|---------------|------------|
| Кейсов запланировано (verified) | **6** |
| Кейсов с HTTP-ответом | **0** |
| Требуют ручной проверки после baseline | **6** (все запланированные) |
| Подтверждённые ошибки RAG по данным прогона | **0** (нет данных) |

---

## 10. Готовность к сравнительному эксперименту

| Критерий | Выполнено |
|----------|-----------|
| Окружение зафиксировано (насколько возможно) | **Да** — manifest + git + suite hash |
| Один воспроизводимый HTTP baseline | **Нет** — блокер credentials |
| Привязка к case ID | **Да** — план из 6 ID |
| Infra отделена от RAG | **Да** — infra не смешивалась (HTTP не было) |
| RAG не исправлялся | **Да** |

**Вывод:** baseline **не готов** к сравнению «до/после» изменений RAG до первого успешного `--allow-http` прогона с существующим portal-user. Preflight и документированная выборка **готовы** — повторить команду из §5 после установки `EVAL_LOGIN` / `EVAL_PASSWORD` в окружение **без** изменения `.env` в репозитории (export в shell или CI secret).

---

## 11. Связанные файлы

- Preflight: `logs/baseline-task7/`
- Dry-run source: `logs/eval-runs/sdb1560m-2026-10-29T06-55-26-822Z/`
- Runner docs: [`sdb1560m-eval-runner.md`](sdb1560m-eval-runner.md)
