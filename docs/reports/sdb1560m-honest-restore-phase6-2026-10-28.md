# SDB1560M honest restore — фаза 6 (2026-10-28)

## Scope

Runbook + stack scripts + одна итерация eval-хвоста (не блокер runbook).

---

## Часть A — eval / extract

### Изменения

| Область | Что сделано |
|---------|-------------|
| `scripts/eval-rag.js` | `normalizeEvalMatchText` — `2 070` / NBSP → match `2070` |
| `data/eval-sdb1560m-cards-wave.json` | `opt-n2`, `n50-volume-liters` — убраны self-contradictory `mustNotContain` |
| `scripts/eval-sdb1560m-phase6-tail.js` | 4 backlog-id; `npm run eval:sdb1560m:phase6-tail` |
| `honest-contextual-extract.js` | `power_storage` kind: «Сколько ватт… режиме хранения» |

### Tail eval (HTTP, 2026-10-28)

Команда: `npm run eval:sdb1560m:phase6-tail`  
Артефакт: `data/eval-sdb1560m-phase6-tail-results.json`

| id | score | Факт |
|----|-------|------|
| `spec-volume` | **1.0** | extract 1 896 л |
| `spec-full-volume` | **1.0** | 2070 л (normalize keywords) |
| `live-set-rh` | 0.0 | abstain на HTTP; SET extract есть при `RAG_HONEST_EQUIPMENT` на **процессе** server (см. informal-set-rh score 1.0 на полном eval) |
| `spec-power-storage` | 0.0 | abstain без env на server; spot/unit extract **8 Вт** OK |

**Tail avgScore:** 0.50 (2/4).  
**Полный honest eval (ф.5):** avgScore **0.83**, forbiddenOk **98/100** — без изменения waiver.

Цель **≥ 0.85** на полном eval — **не достигнута**; зафиксировано для ф.6+, не блокер закрытия runbook.

---

## Часть B — runbook + ops

| Артеfact | Путь |
|----------|------|
| Runbook | [`docs/RUNBOOK_EQUIPMENT_PORTAL.md`](../RUNBOOK_EQUIPMENT_PORTAL.md) |
| Start | `scripts/start-equipment-stack.ps1` → `npm run stack:start` |
| Stop | `scripts/stop-equipment-stack.ps1` → `npm run stack:stop` |

Проверка агента: `stack:start` → Postgres healthy, Ollama OK → server + `test:sdb1560m:honest-smoke:ci` ✅ → `stack:stop`.

**Важно:** в `.env` должно быть `RAG_HONEST_EQUIPMENT=sdb1560m` (см. `.env.example`). Без этого на процессе `node server.js` honest extract/post-gate неполный.

---

## Handoff

- **Все процессы агента остановлены** (`npm run stack:stop`; порт **3000** свободен).
- **Гайд для самостоятельного запуска:** [`docs/RUNBOOK_EQUIPMENT_PORTAL.md`](../RUNBOOK_EQUIPMENT_PORTAL.md)
- **Старт (пользователь):** `npm run stack:start` → второй терминал: `$env:RAG_HONEST_EQUIPMENT="sdb1560m"; npm start`
- **Стоп:** Ctrl+C в терминале server → `npm run stack:stop`

Docker Postgres и Ollama после handoff **могут оставаться запущенными** (по умолчанию `stack:stop` их не гасит).

---

## Не делали

Rollout 702/1106, SOVA API, re-ingest PDF, ослабление safety guardrails.
