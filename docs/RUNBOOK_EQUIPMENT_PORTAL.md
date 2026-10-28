# Runbook — equipment support portal (Windows)

Репозиторий: `equipment-support-mvp` (`QR`). Пилот **honest RAG** для **SDB1560M**: `RAG_HONEST_EQUIPMENT=sdb1560m`.

---

## 1. Prerequisites

| Требование | Версия / примечание |
|------------|---------------------|
| **Node.js** | ≥ 22 (`package.json` engines) |
| **Docker Desktop** | для Postgres + pgvector |
| **Ollama** | локально, порт **11434** |
| **PowerShell** | для `stack:start` / `stack:stop` |

Модели Ollama (минимум):

```powershell
ollama pull bge-m3
ollama pull qwen2.5:32b-instruct
```

Конфиг приложения:

```powershell
cd C:\Users\SOVAI\Documents\Work\QR
copy .env.example .env
```

В `.env` обязательно:

- `POSTGRES_URL=postgresql://rag:rag_secret_change_me@127.0.0.1:5432/equipment_rag`
- `SESSION_SECRET=` — случайная строка ≥ 32 символов
- **`RAG_HONEST_EQUIPMENT=sdb1560m`** — honest-пилот 1560
- `AUTH_REQUIRED=1` (портал с входом)

---

## 2. Первый запуск / после reboot

1. Запустить **Docker Desktop**.
2. Запустить **Ollama** (tray / служба).
3. Из корня репозитория:

```powershell
npm run stack:start
```

4. **Второй терминал** — portal:

```powershell
cd C:\Users\SOVAI\Documents\Work\QR
$env:RAG_HONEST_EQUIPMENT="sdb1560m"
npm start
```

5. Если PG пустой (нет чанков RAG):

```powershell
npm run ingest:knowledge
```

6. Открыть: [http://127.0.0.1:3000/](http://127.0.0.1:3000/) → вход → карточка **SDB1560 M** → чат.

7. Проверка:

```powershell
$env:RAG_HONEST_EQUIPMENT="sdb1560m"
$env:HONEST_SMOKE_REQUIRE_HTTP="1"
npm run test:sdb1560m:honest-smoke:ci
```

---

## 3. Ежедневный запуск (коротко)

1. **Docker Desktop** + **Ollama** (tray).
2. **`npm start`** — поднимет Postgres (Docker), подгрузит `.env`, выставит **`RAG_HONEST_EQUIPMENT=sdb1560m`**, запустит портал.
3. Админка наклеек/учёток: **`npm run user:app`**
4. Браузер: `http://127.0.0.1:3000/`

Остановка portal: **Ctrl+C** → `npm run stack:stop` (освободить :3000).

---

## 4. Остановка

```powershell
cd C:\Users\SOVAI\Documents\Work\QR
npm run stack:stop
```

- В терминале с `npm start` — **Ctrl+C**.
- `stack:stop` освобождает **:3000** (node `server.js`).
- Docker и Ollama **не** останавливаются (Postgres остаётся для быстрого рестарта).

Полная остановка БД (редко):

```powershell
powershell -File scripts/stop-equipment-stack.ps1 -All
```

---

## 5. Проверка здоровья

| Команда | Назначение |
|---------|------------|
| `npm run test:sdb1560m:honest-smoke:ci` | Honest smoke + HTTP «2 полки», PDF top |
| `npm run uat:sdb1560m:api` | 8 сценариев UAT через API |
| `npm run eval:sdb1560m:cards` | Полный eval 100 (долго, ~7–15 мин) |
| `npm run eval:sdb1560m:phase6-tail` | 4 backlog-id (быстро) |

Docker:

```powershell
docker ps
# equipment-rag-postgres — healthy
```

Ollama:

```powershell
curl http://127.0.0.1:11434/api/tags
```

---

## 6. Troubleshooting

| Симптом | Действие |
|---------|----------|
| **EADDRINUSE :3000** | `npm run stack:stop`; не запускать два `node server.js` |
| **Login / session** | `SESSION_SECRET` в `.env`; `npm run user:menu` |
| **RAG abstain / нет фактов** | `npm run ingest:knowledge`; проверить `POSTGRES_URL` |
| **Eval обрыв / timeout** | дефолт socket **360000 ms**; один server на :3000; `RAG_HONEST_EQUIPMENT` на процессе server |
| **429 на eval** | лимит чата 100/15 мин; пауза или `EVAL_DELAY_MS` |
| **Honest не работает** | restart server после смены `.env`; env на **процессе** `node server.js` |
| **Ollama 500 / NaN embed** | укоротить текст; `EMBED_MAX_CHARS` в config |

---

## 7. Учётки портала

```powershell
npm run user:menu
# или
npm run user:create -- --help
```

Наклейки / GUI: см. `package.json` → `user:app`, `sticker:generate`.

---

## 8. Что не трогать (пилот)

- Модели **без** id в `RAG_HONEST_EQUIPMENT` — по-прежнему legacy deterministic / post-gate где настроено.
- **Не** расширять honest на 702/1106 без отдельного решения.
- Новые spec для **1560 honest**: слой **document extract (PDF/table)** — `honest-contextual-extract.js` + inject + focusParameter, **не** `sdb1560m-direct-facts.js`.

---

## 9. Одной строкой

| Действие | Команда |
|----------|---------|
| **Старт** | `npm start` |
| **Админка** | `npm run user:app` |
| **Стоп portal** | Ctrl+C + `npm run stack:stop` |

Подробный план honest restore: [`RAG_SDB1560M_HONEST_RESTORE.md`](RAG_SDB1560M_HONEST_RESTORE.md).
