# Task 42 — SDB1560NM atmospheric pressure retrieval and grounding

**Branch:** `backup/sova-portal` · **HEAD:** `8523954fadcc4f31b92305f81b8dfc09f3e61a14` (unchanged, dirty)  
**Eval runner:** `1.10-task42-r1`  
**HTTP verified by user:** 2026-11-10 (artifacts under `logs/baseline-task42/`)

---

## 1. Итог (Definition of Done)

| Критерий | Статус |
|----------|--------|
| 4/4 pressure HTTP (factual + grounding) | **Не закрыто** — **3/4** |
| Priority B 10/10 | **Да** (`targeted-http-priority-b-10`) |
| RH above 30 — 1/1 | **Да** (`targeted-http-rh-above30`) |
| Task 27 — 32/32 (канонический suite v2) | **Не прогонялся** (см. §8) |
| Power smoke 3/3 | **Не прогонялся** в этой сессии |
| Task 28 full vs Task 40 | **73/110** (+3), leakage **0/20**, infra **0** |
| Commits | Нет (policy) |

**Вывод:** Три кейса давления восстановлены по HTTP; **`gen.env.pressure-kpa-min`** остаётся с **фактической** и **grounding** ошибкой из‑за ответа **`84,0 кПа`** (eval `claimPattern: "84"`). Остальные три границы — pass.

---

## 2. Git

| | Значение |
|--|----------|
| Branch | `backup/sova-portal` |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Dirty | yes (manifest в HTTP-run) |

---

## 3. Источник (РЭ)

**Файл:** `knowledge/sdb1560m/Руководство SDB1560NM.pdf`, **п. 1.1.2.12**

> атмосферное давление **84,0 - 106,7 кПа (630 - 800 мм рт. ст.)**

Ожидания eval (84 / 106.7 / 630 / 800) согласованы с РЭ.

---

## 4. Корневая причина (Task 40 → общая)

Отсутствие retrieval card и kind `atmospheric_pressure`; §1.1.2.12 не попадал в промпт; LLM abstain; grounding без числа.

**Исправления в коде:** card `ambient-pressure.md`, routing/priority, `honest-contextual-extract`, eval-runner augmentation (Task 40 pattern), unit-тест `test-sdb1560m-task42-pressure.js`.

---

## 5. HTTP — четыре целевых кейса

**Артефакт:** `logs/baseline-task42/targeted-http-pressure-4-verified/`  
**Сводка:** pass **3**, fail **1**, infra **0**  
**Среда (manifest):** `RAG_HONEST_EQUIPMENT=sdb1560m`, `RAG_PURE=1`, `authMode=eval_login`

| Case | Task 40 | Task 42 HTTP | Factual | Grounding |
|------|---------|--------------|---------|-----------|
| `gen.env.pressure-kpa-min` | fail (abstain) | **fail** | fail | fail |
| `gen.env.pressure-kpa-max` | fail | **pass** | pass | pass |
| `gen.env.pressure-mmhg-min` | fail | **pass** | pass | pass |
| `gen.env.pressure-mmhg-max` | fail | **pass** | pass | pass |

### Оставшийся сбой: `gen.env.pressure-kpa-min`

- **Ответ HTTP:** «Нижняя граница … составляет **84,0 кПа**.»
- **Factual:** `missing_or_negated` для `claimPattern: "84"` (bounded matcher не принимает `84,0` как «84»).
- **Grounding:** required fact `84` not found in evidence segments (та же граница токенов).
- **Диагностика:** `extractKind: atmospheric_pressure` в trace, но в ответ ушла **LLM-форма 84,0**, не extract **`84 кПа`** из unit-контура.
- **Слой:** **F synthesis / E extract replace** (extract не заменил «достаточный» ответ модели с `84,0`).

В полном Task 28 тот же кейс снова **fail** (см. §9).

---

## 6. Регрессии (прогоны пользователя)

| Прогон | Путь | Результат | Комментарий |
|--------|------|-----------|-------------|
| Priority B (10 кейсов) | `logs/baseline-task42/targeted-http-priority-b-10/` | **10/10** | OK |
| RH `gen.rh.rule-above30` | `logs/baseline-task42/targeted-http-rh-above30/` | **1/1** | OK |
| `partition=verified` + **generalization-v1** | `logs/baseline-task42/task27-regression/` | 62/93 | **Не** канонический Task 27 (93 кейса другого набора) |
| Task 28 full | `logs/baseline-task42/task28-generalization-http/` | **73/110**, leakage **0/20** | +3 vs Task 40 |
| Power smoke | — | не запускался | `npm run test:sdb1560m:honest-smoke:ci` |

### Канонический Task 27 (32/32)

Эталон: `logs/baseline-task27/http-verified-20261102-v2/` — dataset **`docs/reports/sdb1560m-eval-suite-expanded-v2.json`**, partition `verified`, **32** кейса.

Команда для повторной проверки после фикса kPa-min:

```powershell
node scripts/run-sdb1560m-eval-v1.js --allow-http --no-provision --partition=verified --dataset=docs/reports/sdb1560m-eval-suite-expanded-v2.json --out=logs/baseline-task42/task27-suite-v2-32
```

---

## 7. Unit-тесты (локально, до/после правок)

| Script | Result |
|--------|--------|
| `scripts/test-sdb1560m-task42-pressure.js` | OK (все 4 слоя на synthetic payload) |
| Task 32/35/37/38/39/40 runner | OK |

Unit проходит, потому что extract отдаёт **`84 кПа`**; HTTP иногда оставляет **LLM `84,0 кПа`**.

---

## 8. Сравнение Task 28 (Task 40 vs Task 42 HTTP)

| Метрика | Task 40 (`logs/baseline-task40/task28-generalization-http/`) | Task 42 (`logs/baseline-task42/task28-generalization-http/`) |
|---------|--------------------------------------------------------------|--------------------------------------------------------------|
| Overall pass | **70/110** | **73/110** (**+3**) |
| Fail | 36 | 33 |
| Leakage | 0/20 | 0/20 |
| Infra | 0 | 0 |

**Pressure в full suite:**

| Case | Task 40 | Task 42 |
|------|---------|---------|
| kpa-min | fail | fail |
| kpa-max | fail | pass |
| mmhg-min | fail | pass |
| mmhg-max | fail | pass |

Ожидали +4 pass; фактически **+3** из‑за kpa-min.

---

## 9. Изменённые файлы (Task 42)

| File | Назначение |
|------|------------|
| `knowledge/sdb1560m/retrieval-cards/ambient-pressure.md` | §1.1.2.12, явные границы |
| `src/rag/sdb1560m-rag-priority.js` | детект atmospheric pressure, hints |
| `src/rag/honest-contextual-extract.js` | kind `atmospheric_pressure`, answers |
| `scripts/sdb1560m-eval-runner-lib.js` | `1.10-task42-r1`, grounding augment |
| `scripts/test-sdb1560m-task42-pressure.js` | unit contour |
| `scripts/run-sdb1560m-eval-v1.js` | `loadEnvFile()` для EVAL из `.env` |

---

## 10. Оставшая работа (узкий фикс)

1. На HTTP-пути для `gen.env.pressure-kpa-min` гарантировать ответ с токеном **`84 кПа`** (или принудительная замена extract при `84,0` в prior), без ослабления eval.
2. Повтор: `targeted-http-pressure-4-verified` → **4/4**.
3. Опционально: Task 27 suite v2 **32/32**, power smoke **3/3**.

---

## 11. Артефакты

```
logs/baseline-task42/
  targeted-http-pressure-4-verified/   # 3/4 pressure
  targeted-http-rh-above30/            # 1/1
  targeted-http-priority-b-10/         # 10/10
  task27-regression/                   # 62/93 (not Task-27-32 suite)
  task28-generalization-http/          # 73/110
  repo-snapshot.json
```

**Честная оценка:** исправление **частично подтверждено HTTP** (3/4); **полный DoD Task 42 — нет**, пока не закрыт `pressure-kpa-min`.
