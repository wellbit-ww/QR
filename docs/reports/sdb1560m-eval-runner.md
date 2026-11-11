# SDB1560M eval runner v1 (safe, no provisioning)

Отдельный контур оценки по схеме `docs/reports/sdb1560m-eval-case-schema-v1.json`. Не заменяет legacy-тесты и не меняет production RAG.

## Файлы

| Файл | Назначение |
|------|------------|
| `scripts/run-sdb1560m-eval-v1.js` | CLI |
| `scripts/sdb1560m-eval-runner-lib.js` | Валидация, слои, метрики, manifest, отчёт |
| `scripts/sdb1560m-eval-http-client.js` | HTTP login/chat только через `EVAL_LOGIN` / `EVAL_PASSWORD` |
| `scripts/test-sdb1560m-eval-runner-unit.js` | Изолированные unit-тесты (без HTTP/Postgres/Ollama) |

Датасет по умолчанию: `docs/reports/sdb1560m-eval-suite-draft-v1.json`.

## Безопасный запуск

**Рекомендуется по умолчанию — dry-run** (manifest + валидация, без HTTP):

```bash
npm run eval:sdb1560m:v1
# или
node scripts/run-sdb1560m-eval-v1.js --dry-run
```

Партиции набора (`--partition=`):

- `all` — все кейсы из датасета
- `verified` — `resolutionStatus=ready`, `must_answer`, есть `requiredFacts`
- `blocked` — `blocked_pending_source_resolution`
- `unsupported` — `unsupported_by_manual` или `must_abstain`
- `routing` — foreign model / leakage / contradictory context

Пример:

```bash
node scripts/run-sdb1560m-eval-v1.js --dry-run --partition=blocked
```

**HTTP-режим** (только при явном `--allow-http`):

- Нужны уже существующие учётные данные: `EVAL_LOGIN`, `EVAL_PASSWORD`, опционально `EVAL_BASE_URL`.
- **Не** используется `EVAL_AUTO_LOGIN=1`, **не** вызывается `provisionEvalUser`, **не** импортируется `sdb1560m-http-test-lib.js`.
- Без credentials все кейсы получают `infrastructure_error`, пользователь не создаётся.

```bash
set EVAL_LOGIN=...
set EVAL_PASSWORD=...
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified
```

Флаг `--no-provision` включён по умолчанию; запуск без него завершается с кодом 2.

Вывод: `logs/eval-runs/sdb1560m-<timestamp>/` — `manifest.json`, `report.json`, `SUMMARY.md`. Переопределение: `--out=...`.

## Layered verdict

На кейс: `pass` | `fail` | `blocked` | `infrastructure_error` | `not_run` | `not_evaluable`.

Слои: factual, forbiddenLeakage, abstention, retrieval, grounding — отдельные статусы (`pass` / `fail` / `blocked` / `not_evaluable` / `config_error` / …).

- **`must_abstain`**: без `abstentionRules.allowedAbstainPatterns` → слой `config_error`, overall **fail** (не pass).
- **Factual (`must_answer`)**: детерминированная проверка числа с границами и опциональной `unit` из кейса; **не** семантическая factual accuracy.
- **Overall `pass`**: только если все **обязательные для кейса** слои пройдены (в т.ч. retrieval, если задан `retrievalExpectations`; grounding — если в payload есть тексты чанков).

Кейсы `blocked_pending_source_resolution` **не входят** в знаменатель `answer_factual_accuracy`.

В manifest: `evalRunnerLibVersion` (сейчас `1.2-task6`).

## Метрики

| Метрика | Когда число достоверно |
|---------|-------------------------|
| `answer_factual_accuracy` | HTTP/mock; только `ready` + `must_answer` + `requiredFacts`; только кейсы с `layers.factual` **pass/fail** (не `not_evaluable`); **heuristic**, не semantic accuracy |
| `cross_model_leakage_rate` | Есть `forbiddenClaims` и ответ |
| `regression_pass_rate` | Кейсы с overall **pass/fail/not_evaluable** кроме blocked/not_run/infra; **not_evaluable исключён из знаменателя** |
| `retrieval_recall_at_k` | Всегда `null` без chunk-level evidence |
| `grounded_claim_rate` | `null`, пока в payload нет тел чанков |
| `correct_abstention_rate` | Не агрегируется автоматически |

При нулевом знаменателе `value: null` (не 100%).

## Unit-тесты

```bash
npm run test:sdb1560m:eval-runner
```

Проверяют: валидацию, исключение blocked из factual accuracy, manifest без секретов, отсутствие provisioning в исходниках runner.

## Связанные документы

- `docs/reports/sdb1560m-eval-contour-spec.md`
- `docs/reports/sdb1560m-facts-and-eval-audit.md`
