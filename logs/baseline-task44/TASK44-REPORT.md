# Task 44 — HTTP verification and regression check

**Статус:** **COMPLETE** (HTTP + honest smoke CI)  
**Дата обновления отчёта:** 2026-11-11  
**Репозиторий:** `C:\Users\SOVAI\Documents\Work\QR`

---

## 1. Executive summary

Task 43 (**evaluator `1.11-task43-r1`**) подтверждён **реальным HTTP**:

| Прогон | Результат |
|--------|-----------|
| Pressure 4 | **4/4** PASS |
| Priority B | **10/10** |
| RH above 30 | **1/1** |
| Task 27 canonical v2 | **32/32** |
| Task 28 full | **74/110**, leakage **0/20**, infra **0** |
| Honest smoke CI | **PASS** (`npm run test:sdb1560m:honest-smoke:ci`) |

Ключевой кейс **`gen.env.pressure-kpa-min`**: ответ **«84,0 кПа»**, **factual pass**, **grounding pass** (раньше fail на `1.10-task42-r1`).

Task 28 vs Task 42: **73 → 74** (+1 только pressure kpa-min; остальные 32 fail — прежние, не Task 43/44).

Первый прогон агента без creds сохранён: `targeted-http-pressure-4/` (4× infra) — **не перезаписан**.

---

## 2. Git branch / HEAD / dirty

| Поле | Значение |
|------|----------|
| Branch | `backup/sova-portal` |
| HEAD | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Dirty | yes (manifest `dirtyLineCount` ~168) |
| Commit | нет |

---

## 3. Evaluator version

Во всех успешных manifest: **`evalRunnerLibVersion`: `1.11-task43-r1`**.

---

## 4. Preflight (на момент пользовательских прогонов)

| Компонент | Статус |
|-----------|--------|
| Portal `:3000` | использовался (HTTP auth ok) |
| Runner | `authMode: eval_login` в manifest r2 |
| Honest RAG | `RAG_HONEST_EQUIPMENT=sdb1560m`, `RAG_PURE=1` (из manifest) |

Снимок агента (до creds): `logs/baseline-task44/preflight.json`.

---

## 5. Pressure 4-case HTTP

**Артефакт:** `logs/baseline-task44/targeted-http-pressure-4-r2/`  
**capturedAt:** 2026-11-10T10:05:11Z · **summary:** 4 pass, 0 fail, 0 infra

| Case | Overall | Factual | Grounding | Answer (preview) |
|------|---------|---------|-----------|-------------------|
| `gen.env.pressure-kpa-min` | **pass** | **pass** | **pass** | «… **84,0 кПа**» |
| `gen.env.pressure-kpa-max` | pass | pass | pass | 106,7 kPa |
| `gen.env.pressure-mmhg-min` | pass | pass | pass | 630 mmHg |
| `gen.env.pressure-mmhg-max` | pass | pass | pass | 800 mmHg |

**Task 43 критерий:** `84,0` принимается как эквивалент `84` — **выполнен**.

Сравнение Task 42 (`1.10`, `targeted-http-pressure-4-verified`): было **3/4**, kpa-min **fail**.

---

## 6. Priority B 10-case

**Артефакт:** `logs/baseline-task44/targeted-http-priority-b-10/`  
**10/10**, infra 0.

Сравнение Task 42: **10/10** — без регрессии.

---

## 7. RH above 30

**Артефакт:** `logs/baseline-task44/targeted-http-rh-above30/`  
**1/1**, infra 0.

Task 42: **1/1** — без регрессии.

---

## 8. Task 27 canonical v2

**Артефакт:** `logs/baseline-task44/task27-suite-v2-32/`  
**Dataset:** `docs/reports/sdb1560m-eval-suite-expanded-v2.json`, partition **`verified`**  
**32/32**, infra 0 · capturedAt 2026-11-11T05:41:13Z

Эталон Task 27 (2026-11-02): `logs/baseline-task27/http-verified-20261102-v2/` — также 32/32.

---

## 9. Task 28 generalization

**Артефакт:** `logs/baseline-task44/task28-generalization-http/`  
**capturedAt:** 2026-11-10T11:27:44Z

| Метрика | Task 42 | Task 44 | Δ |
|---------|---------|---------|---|
| pass / total | 73/110 | **74/110** | **+1** |
| fail | 33 | 32 | −1 |
| not_evaluable | 4 | 4 | 0 |
| infrastructure_error | 0 | 0 | 0 |
| leakage (SUMMARY) | 0/20 | **0/20** | 0 |

**+1** — ожидаемо **`gen.env.pressure-kpa-min`** (evaluator fix, не RAG).

Pressure в full suite (Task 44): kpa-min **pass**, остальные три pressure — **pass** (как в Task 42).

---

## 10. Honest smoke

**Команда:** `npm run test:sdb1560m:honest-smoke:ci`  
**Результат:** **PASS** (exit без ошибки, `SDB1560M honest smoke OK`).

| Проверка | Итог |
|----------|------|
| In-process pipeline + post-gate | **2 полки** (`answerPreview`) |
| HTTP `/api/chat` (`HONEST_SMOKE_REQUIRE_HTTP=1`) | **`http.ok: true`** |
| PDF в sources (HTTP) | по логике скрипта — assert выполнен |
| Guardrails | `pass_strict` |
| topSource (HTTP) | `golden-facts-sdb1560m.md` |

**Лог:** `logs/baseline-task44/honest-smoke-ci-log.txt` (выписка из terminal).

*Примечание:* в runbook иногда пишут «smoke 3/3» — фактически CI-скрипт **один**, внутри: pipeline, post-gate и обязательный HTTP.

---

## 11. Regression comparison

| Suite | Task 42 HTTP | Task 44 HTTP |
|-------|--------------|--------------|
| Pressure 4 | 3/4 @ 1.10 | **4/4 @ 1.11** |
| Priority B | 10/10 | 10/10 |
| RH | 1/1 | 1/1 |
| Task 27 v2 | не запускался | **32/32** |
| Task 28 | 73/110 | **74/110** |
| Smoke CI | — | **PASS** |

Production RAG в Task 44 **не менялся** (verification-only).

---

## 12. Артефакты

```
logs/baseline-task44/
  preflight.json
  TASK44-REPORT.md
  targeted-http-pressure-4/          # agent: 4× infra (история)
  targeted-http-pressure-4-r2/     # user: 4/4 PASS
  targeted-http-priority-b-10/
  targeted-http-rh-above30/
  task27-suite-v2-32/
  task28-generalization-http/
  honest-smoke-ci-log.txt
```

---

## 13. Критерии закрытия Task 44

| Критерий | Статус |
|----------|--------|
| Pressure 4/4 HTTP, kpa-min factual+grounding | **Да** |
| Priority B / RH | **Да** |
| Task 27 v2 canonical | **Да** |
| Task 28 фактический результат | **Да** |
| Infra vs quality | **0 infra** на всех HTTP |
| Honest smoke CI | **Да** |
| Commit | **Нет** |

**Итог:** Task 44 **полностью закрыта** (HTTP + smoke).

---

## 14. Параллельный проект `rag_system` — мешаем ли друг другу?

**Код и репозитории** не пересекаются — отдельные папки, отдельный git.

**Общие ресурсы на одной машине** (здесь возможны помехи):

| Ресурс | Риск |
|--------|------|
| **Ollama `:11434`** | **Общий** для всех клиентов. Два тяжёлых прогона одновременно → очередь, задержки, реже **429** на `/api/chat` портала. На **уже записанные** артефакты Task 44 это не влияет. |
| **Портал QR `:3000`** | Один процесс Node. Eval должен бить **именно QR**; второй веб-сервис `rag_system` на другом порту — **ок**. |
| **Postgres `equipment_rag`** | Конфликт только если `rag_system` использует **тот же** `POSTGRES_URL`/контейнер. Иначе — **нет**. |
| **GPU** | Если Ollama грузит **одну** видеокарту, а `rag_system` грузит **другую** — inference может идти параллельно **если** это настроено (`CUDA_VISIBLE_DEVICES`, отдельные инстансы Ollama). **По умолчанию** один Ollama = одна очередь, карты «на глаз» не делят автоматически. |
| **CPU/RAM** | Параллель только замедляет; редко портит pass/fail, если нет таймаутов. |

**Практика:** для чистых baseline не гонять два полных suite на **одном** Ollama в один момент. Твои Task 44 прогоны уже завершены — параллельный `rag_system` **не отменяет** их валидность. Следующий прогон QR — лучше без пиковой нагрузки на Ollama/VRAM.

**«Всё на разных картах»** — ок **только если** реально два независимых inference-процесса (два Ollama / два backend’а на разных GPU). Один Ollama на 11434 — **общая** очередь независимо от проекта.
