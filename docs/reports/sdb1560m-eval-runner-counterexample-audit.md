# SDB1560M eval-runner — аудит контрпримеров (Task 6)

**Дата:** 2026-10-29  
**Метод:** статический разбор `sdb1560m-eval-runner-lib.js` + синтетические counterexample-тесты (без HTTP/Ollama/PG).  
**Команда:** `node scripts/test-sdb1560m-eval-runner-unit.js` (включает `test-sdb1560m-eval-runner-counterexamples.js`).

---

## Git

| Момент | HEAD | Рабочее дерево |
|--------|------|----------------|
| **До Task 6** | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` | dirty (~56 строк `git status --porcelain`) |
| **После Task 6** | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (без reset/checkout/clean) | dirty; добавлены/изменены только файлы eval-runner и отчёты Task 6 |

Production RAG (`server.js`, `src/rag/**`), `.env`, legacy datasets, БД и индекс **не изменялись**. Сетевые вызовы **не выполнялись**.

---

## Контрпримерные тесты

Файл: `scripts/test-sdb1560m-eval-runner-counterexamples.js` (подключается из unit-runner).

| Секция | Что покрыто |
|--------|-------------|
| **A. Числа / единицы / отрицания** | 260 кг pass; «не 260, а 280» fail; «не превышает 260» fail; 140 vs 40 W; фунты; dual 260+280; 40+810/415 (forbidden + alternate numeric); decimal `260,5`; диапазон 250–270; цитата с 280 и 260 |
| **B. Отказ** | must_abstain без rules; STRICT_ABSTAIN; abstain+260 кг; hedging+факт; empty; must_answer+abstain |
| **C. Слои / overall** | retrieval required; PDF без chunks (grounding N/A); chunk 180 vs answer 260; blocked; unsafe text → not_evaluable |
| **D. Grounding / retrieval** | правильный ответ без source doc → fail; chunk с 260 и 280 → fail |
| **E. Метрики** | пустой массив; all blocked; all infra; not_run; mix pass/fail/ne/blocked — числители/знаменатели |
| **Compat** | `sdb1560m-eval-suite-draft-v1.json` проходит `validateSuiteDocument` |

---

## Выявленные дефекты и исправления (Task 6)

| Контрпример | До | Исправление (lib `1.2-task6`) |
|-------------|-----|-------------------------------|
| «Масса **не превышает** 260 кг» | мог дать **pass** | `isNonExactNumericContext` — число в не-точном контексте не засчитывается |
| «260 кг, но точное значение — **280** кг» | мог дать **pass** | `hasConflictingAlternateNumeric` — второе число с той же единицей |
| «40 Вт …; **810** Вт …» при факте 40 W | factual **pass**, только forbidden | alternate numeric + unit → factual **fail** |
| `must_answer` + abstain-template | factual мог быть не fail | empty / `isAbstainLike` → factual **fail** |
| Forbidden numeric без `matchStr` в negation | редкие ошибки | `isNegatedAt(text, idx, match)` в forbidden loop |
| `not_evaluable` в знаменателе regression | мог занижать pass rate | исключён из denominator `regression_pass_rate` |

---

## Результаты unit-тестов

```
node scripts/test-sdb1560m-eval-runner-unit.js
→ sdb1560m-eval-runner unit tests: OK
```

---

## Оставшиеся ограничения (известные, не silent pass)

| Сценарий | Поведение | Риск |
|----------|-----------|------|
| Комплектация «без опций / с опциями» в одном ответе | Runner **не** различает scope без `appliesWhenPattern` (поле добавлено в schema как **document-only**) | Для 40 W достаточно alternate-number heuristic; для спорных 810/415 **не** эталон — только forbidden/leakage |
| Семантика «правильно: 260» при скрытой ошибке в prose | Heuristic по числам/единицам | Ручная проверка сложных ответов |
| Grounding | Совпадение pattern в chunk text, **не** entailment | `not_evaluable`, если chunks нет; при chunks — heuristic pass/fail |
| `retrieval_recall_at_k`, aggregate `grounded_claim_rate` | **null** | Не KPI |
| Диапазоны, ±, kW↔W пересчёт | Частично fail / not_evaluable | Не полное покрытие |
| Галлюцинации без чисел/единиц из SUBSTANTIVE_CLAIM_RE | Могут пройти must_abstain, если совпали allowed patterns | Эвристика не ловит все hallucination |

**Silent `pass`:** по результатам контрпримерного набора **не выявлен** для перечисленных в Task 6 таблицах A–D после исправлений. Остаются сценарии вне детерминированной модели → **`not_evaluable` или `fail`**, не pass по умолчанию.

---

## Эвристики (не доказывают semantic correctness)

- Bounded numeric + `unit` + negation + non-exact qualifiers + alternate same-unit numbers  
- `forbiddenClaims` regex  
- Abstain: только explicit `allowedAbstainPatterns` / STRICT_ABSTAIN + `SUBSTANTIVE_CLAIM_RE`  
- Retrieval: имя PDF в `sources[]` (weak)  
- Grounding: те же numeric rules в `sources[].content`

---

## Метрики: диагностика vs KPI RAG

| Метрика | Диагностический сигнал | KPI качества RAG |
|---------|------------------------|------------------|
| `answer_factual_accuracy` | Тренд на ready `must_answer` с pass/fail factual | **Нет** — heuristic, без grounding semantics |
| `cross_model_leakage_rate` | Срабатывание forbidden | **Частично** — не все leakage |
| `regression_pass_rate` | Composite runner (strict post–Task 5/6) | **Нет** — без recall/abstention aggregate |
| `retrieval_recall_at_k`, `grounded_claim_rate`, abstention aggregates | — | **Нет** (null / не агрегируются) |

Знаменатели (после Task 6): blocked / not_run / infra / **not_evaluable** не завышают pass rate; нулевой знаменатель → `value: null`.

---

## Обратная совместимость

- Draft suite v1 **валидируется** без изменений JSON.  
- Поле `unit` **используется** для numeric `claimPattern`.  
- Кейсы `must_abstain` **без** `allowedAbstainPatterns` → **fail** (не pass).  
- Предложено опциональное `appliesWhenPattern` в schema — **без** реализации и без миграции legacy.

---

## Изменённые файлы (Task 6)

| Файл |
|------|
| `scripts/sdb1560m-eval-runner-lib.js` |
| `scripts/test-sdb1560m-eval-runner-counterexamples.js` (новый) |
| `scripts/test-sdb1560m-eval-runner-unit.js` |
| `docs/reports/sdb1560m-eval-case-schema-v1.json` (описание `appliesWhenPattern`) |
| `docs/reports/sdb1560m-eval-runner.md` (версия lib) |
| `docs/reports/sdb1560m-eval-runner-counterexample-audit.md` (этот файл) |

---

## Итоговый вывод

### 1. Готов ли runner для безопасного smoke и диагностического сбора?

**Да** — dry-run, manifest (`evalRunnerLibVersion`, dataset sha256, git dirty), HTTP только login/chat без provisioning; counterexample + unit suite зелёные.

### 2. Какие сценarios оцениваются достоверно (в рамках heuristic)?

- Verified numeric facts с `unit` и простым assertive текстом  
- Явный forbidden leakage (regex)  
- must_abstain с настроенными patterns и без substantive хвоста  
- Блокировка pass при failed retrieval (если задан в кейсе) и failed grounding (если есть chunk bodies)

### 3. Что требует ручной проверки?

- Kit-scoped / option-scoped факты (810 vs 415) до внедрения `appliesWhenPattern`  
- Длинные процедурные ответы, paraphrase без чисел  
- Любой claim без надёжного pattern → смотреть `report.json` case-level layers

### 4. Можно ли переходить к контролируемому эксперименту с production RAG?

**Да, с оговорками:** использовать runner для **воспроизводимых HTTP-прогонов и архивации ответов**; метрики SUMMARY — **диагностика**, не доказательство качества RAG; эксперименты сравнивать только при одинаковом dataset hash, `evalRunnerLibVersion` и зафиксированном server/index fingerprint (вне runner по-прежнему manual/`EVAL_INDEX_FINGERPRINT`).

**Не** интерпретировать зелёный unit-тест как подтверждение качества production RAG.
