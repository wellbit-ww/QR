# Фаза 6 — бриф для агента (QR equipment portal)

**Репозиторий:** `C:\Users\SOVAI\Documents\Work\QR`  
**Контекст:** ф.0–5 honest RAG для **SDB1560M** закрыты (вариант B). Close: `docs/reports/sdb1560m-honest-restore-phase5-close-2026-10-28.md`.

---

## Цели ф.6

1. **Качество (backlog):** дожать eval-хвост и/или зафиксировать результат; опционально eval JSON forbiddenOk.
2. **Runbook:** один **полный гайд** для человека — запуск/остановка стека без агента.
3. **Ops-скрипты:** `stop` + `start` (PowerShell), по желанию `health-check`.
4. **Финал:** **выключить все фоновые процессы**, которые агент поднимал; в отчёте — «чистая машина» + ссылка на гайд.

**Не делать:** rollout honest на 702/1106, SOVA API, re-ingest PDF без смены РЭ, ослабление safety guardrails.

---

## Часть A — eval / extract (1 итерация, не блокер runbook)

### Backlog id

| id | Направление |
|----|-------------|
| `spec-volume` | format ответа + eval keywords / normalize |
| `spec-full-volume` | `2070` / `2 070` |
| `live-set-rh` | extract SET/порог, inject humidity UI |
| `spec-power-storage` | 8 Вт из табл. 1.1 |

Опционально: `data/eval-sdb1560m-cards-wave.json` — `opt-n2`, `n50-volume-liters` (forbiddenOk).

### Критерий (мягкий)

- Перезапуск `:3000` + один `npm run eval:sdb1560m:cards` → avgScore **≥ 0.85** **или** в отчёте ф.6: «осталось X id, факт Y» (не блокирует закрытие ф.6, если runbook готов).

### Артефакт

`docs/reports/sdb1560m-honest-restore-phase6-YYYY-MM-DD.md`

---

## Часть B — runbook (обязательно)

Создать **`docs/RUNBOOK_EQUIPMENT_PORTAL.md`** — пошагово для Windows, PowerShell.

### Стек (что должно работать)

| Компонент | По умолчанию | Проверка |
|-----------|--------------|----------|
| Docker Postgres | `npm run docker:db` → `equipment-rag-postgres` healthy | `docker ps` |
| Ollama | embed **bge-m3** `:11434/api/embed`; chat models из `.env` / `config.js` | `ollama list`, curl embed |
| Node portal | `server.js` **:3000** | `http://127.0.0.1:3000/` |
| Honest pilot | `.env` **`RAG_HONEST_EQUIPMENT=sdb1560m`** | smoke CI |

### Разделы runbook (обязательные)

1. **Prerequisites:** Node ≥22, Docker Desktop, Ollama, `copy .env.example .env`, правки SESSION_SECRET / POSTGRES_URL.
2. **Первый запуск / после reboot:** порядок команд (docker → ollama pull → ingest если пусто PG → server).
3. **Ежедневный запуск** (короткий чеклист, 5–7 шагов).
4. **Остановка** (короткий чеклист).
5. **Проверка здоровья:** `npm run test:sdb1560m:honest-smoke:ci`, опционально `uat:sdb1560m:api`.
6. **Типичные проблемы:** порт 3000 занят, два `node server.js`, eval обрыв timeout (360s), нет чанков → `ingest:knowledge`.
7. **Учётки портала:** `npm run user:menu` / `user:create`.
8. **Что НЕ трогать:** legacy deterministic для моделей **без** `RAG_HONEST_EQUIPMENT`.

### Скрипты (создать в `scripts/`)

**`scripts/stop-equipment-stack.ps1`**

- Остановить процессы на портах **3000** (node server), по возможности без убийства чужих node.
- **Не** останавливать Docker/Ollama по умолчанию (флаг `-All` опционально: docker compose down, hint ollama stop).
- Вывести таблицу: порт → PID → stopped/skipped.

**`scripts/start-equipment-stack.ps1`**

- `docker compose up -d`, wait healthy.
- Проверить Ollama reachability (11434 embed).
- Напомнить: `RAG_HONEST_EQUIPMENT` из `.env`.
- Запуск **`node server.js`** в foreground **или** инструкция «откройте второй терминал» (не оставлять скрытый процесс без логов, если пользователь просил «сам запускать»).
- Опционально `-Smoke` → honest-smoke:ci после старта.

Добавить в `package.json`:

```json
"stack:stop": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-equipment-stack.ps1",
"stack:start": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-equipment-stack.ps1"
```

---

## Часть C — финал агента (обязательно)

1. Выполнить **`npm run stack:stop`** (или свой stop) — убить **свои** `node server.js`, eval-хвосты на :3000.
2. Не оставлять фоновые `node scripts/eval-rag.js`, лишние вкладки с дублирующим server.
3. В **`docs/reports/sdb1560m-honest-restore-phase6-YYYY-MM-DD.md`** секция **«Handoff»**:
   - «Все процессы агента остановлены»
   - Ссылка на **`docs/RUNBOOK_EQUIPMENT_PORTAL.md`**
   - Одна команда старта / одна остановки для пользователя

4. Обновить **`docs/RAG_SDB1560M_HONEST_RESTORE.md`**: журнал **ф.6 ✅**, ссылка на runbook + phase6 report.

---

## Document extract runbook (короткая секция в restore doc или phase6)

Новый spec для honest-модели:

1. `focusParameter` + hints в `sdb1560m-rag-priority.js` (или профиль модели).
2. inject в `retrieval.js` / unified-retriever.
3. парсер в `honest-contextual-extract.js`.
4. smoke/eval id — **не** `direct-facts.js`.

---

## Приёмка ф.6

- [ ] `docs/RUNBOOK_EQUIPMENT_PORTAL.md` полный и проверен (агент сам один раз start → smoke → stop).
- [ ] `stack:stop` / `stack:start` работают.
- [ ] Phase6 report + журнал ф.6.
- [ ] **Нет** висящего server на :3000 после handoff (пользователь стартует сам по гайду).

---

## Для SOVA (после ф.6)

Агент сообщает путь к runbook; ревьюер обновит `sova_rag_system/docs/QR_SDB1560M_HONEST_RAG_PILOT.md` (ф.6 ✅ + ссылка на RUNBOOK).
