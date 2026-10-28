# SDB1560M honest restore — фаза 5 CLOSE (2026-10-28)

**Решение заказчика:** вариант **B** (waiver eval ≥ 0.85 → **≥ 0.83** + UAT + smoke + forbiddenOk).

**Статус:** ф.5 **закрыта** на стенде QR.

---

## Gates (ф.5)

| Gate | Результат | Артефакт |
|------|-----------|----------|
| avgScore ≥ 0.83 (honest HTTP) | ✅ **0.83** | `logs/eval-sdb1560m-honest-phase5-r2.log` |
| forbiddenOk ≥ 98/100 | ✅ **98/100** (2 hit tokens) | тот же лог |
| Smoke CI | ✅ | `npm run test:sdb1560m:honest-smoke:ci` (после restart) |
| UAT API 8/8 | ✅ | `logs/sdb1560m-uat-api-traces.json` |
| UI UAT 8/8 | ✅ | `logs/sdb1560m-ui-uat-phase5-close.json` + spot в браузере `#1` |

Eval waiver и backlog ф.6: [`RAG_SDB1560M_HONEST_RESTORE.md`](../RAG_SDB1560M_HONEST_RESTORE.md).

---

## Eval (факт)

- **Прогон:** `eval:sdb1560m:cards`, `RAG_HONEST_EQUIPMENT=sdb1560m`, HTTP `:3000`
- **avgScore:** 0.83 (baseline ф.4: 0.81)
- **forbiddenOk:** 98/100 — `opt-n2`, `n50-volume-liters` (dataset, не safety)

---

## UI UAT 8/8 (2026-10-28)

Канал: `/chat?equipment=sdb1560m` (тот же `POST /api/chat`, что и UI). Пункт 1 дополнительно проверен в браузере (Cursor browser).

| # | Вопрос | ✅/❌ | Одна строка ответа |
|---|--------|------|---------------------|
| 1 | Сколько полок в комплекте? | ✅ | В шкафу SDB1560NM предусмотрено **2 полки**. |
| 2 | Какой внутренний объём? | ✅ | **Внутренний объём** SDB1560NM — **1 896 л**. |
| 3 | Как начать работу с шкафом? | ✅ | Шаги включения: 220 В, тумблер/панель, настройка параметров (из РЭ). |
| 4 | Влажность не снижается что делать | ✅ | Чеклист п. 2.2.2 / табл. 3.2 (уплотнители, двери, осушитель). |
| 5 | Красный индикатор мигает что это | ✅ | Мигающий красный + зелёный — режим «Осушения», штатно. |
| 6 | Кто производитель датчика влажности | ✅ | В документации параметр не указан (abstain). |
| 7 | Из шкафа идёт дым, что делать? | ✅ | Немедленно отключить питание (п. 2.4), без проверок до обесточивания. |
| 8 | Сколько полок в SDB702? | ✅ | Scope: только SDB1560 M (FOREIGN_MODEL), без «7 полок». |

Полные `ragTrace` по каждому пункту: [`logs/sdb1560m-ui-uat-phase5-close.json`](../../logs/sdb1560m-ui-uat-phase5-close.json).

---

## Operational (стенд)

- Один процесс **`:3000`**
- **`.env` / процесс:** `RAG_HONEST_EQUIPMENT=sdb1560m` (см. `.env.example`)
- После деплоя кода extract — **restart** server

**Ops fix при закрытии:** golden-file fallback в `corpusForExtract` всегда для honest 1560 (без ложного «896» в чанках) — стабильный volume на HTTP.

---

## Backlog ф.6 (не блокер ф.5)

| id | Заметка |
|----|---------|
| `spec-volume` | eval score 0 при OK UAT — format/keywords/session |
| `spec-full-volume` | 2070 vs `2 070` в keyword score |
| `live-set-rh` | «параметр не указан» на full eval |
| `spec-power-storage` | 8 Вт — inject+extract на eval-хвосте |

Опционально: eval JSON — 2× forbiddenOk (`opt-n2`, `n50-volume-liters`).

Runbook: слой **document extract (PDF/table)**, не `sdb1560m-direct-facts.js`.

---

## Не делали

Mass extract до 0.85, rollout 702/1106, SOVA API, re-ingest PDF, ослабление safety guardrails.
