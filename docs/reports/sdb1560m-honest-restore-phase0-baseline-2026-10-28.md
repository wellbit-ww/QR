# SDB1560M honest RAG — фаза 0 baseline

**Дата:** 2026-10-28  
**Режим:** legacy (до `RAG_HONEST_EQUIPMENT`) — deterministic FAQ + post-gate на сервере.

## Стек

| Проверка | Результат |
|----------|-----------|
| `docker compose up -d` | `equipment-rag-postgres` — **Up (healthy)** |
| `POSTGRES_URL` | задан (`127.0.0.1:5432/equipment_rag`) |
| Ollama embed | **bge-m3:latest** (дефолт `config.js`) |
| Ollama chat (факт в trace) | процедура: **llama3.1:8b**; rewrite: **qwen2.5:32b-instruct** |
| HTTP `:3000` | отвечает (200 на `/`) |
| `npm run dev` / UI | не фиксировался в этой сессии; baseline traces — через `runPipeline` + pre-gate |

## PostgreSQL: `knowledge_chunks` для `sdb1560m`

**Всего: 92 чанка** (ingest актуален).

| source_doc | n |
|------------|--:|
| Руководство SDB1560NM.pdf | 72 |
| golden-facts-sdb1560m.md | 3 |
| retrieval-cards/* (16 файлов) | 17 |
| portal-contact-support.md | 1 |

По `chunkKind` (metadata): procedure 40, general 27, troubleshooting 12, spec 8, safety 4, table 1.

Повторная проверка: `node scripts/sdb1560m-phase0-pg-stats.js`

## `knowledge/sdb1560m/` (18 файлов на диске)

- `golden-facts-sdb1560m.md`
- `portal-contact-support.md`
- `Руководство SDB1560NM.pdf` (~1.6 MB)
- `retrieval-cards/`: ambient-temp, door-close-dry, fan-restart-1rh, feet-wheels, heating-case, humidity-time, nitrogen-option, no-cooling, power-on, red-lamp, rh-below-setpoint, set-menu, setpoint-vs-ambient, temp-contrast, yellow-and-w.md

## Trace «до» (3 сценария)

**Файл:** [logs/sdb1560m-honest-restore-baseline-traces.json](../../logs/sdb1560m-honest-restore-baseline-traces.json)  
**Скрипт:** `node scripts/sdb1560m-phase0-baseline-traces.js`

| # | Вопрос | Путь | `ragTrace.mode` / ключевое |
|---|--------|------|----------------------------|
| 1 | Сколько полок в комплекте? | `runPipeline` → deterministic | **RAG_DETERMINISTIC**, LLM не вызывался, ответ «**2 полки**» |
| 2 | Как начать работу с шкафом? | `runPipeline` → retrieval + LLM | **LLM_GENERATE**, 15 чанков, post-gate deferred на server |
| 3 | Поддерживает ли шкаф Wi-Fi? | `classifyPreGate` | **SCOPE_GATE** / `UNSUPPORTED_SPEC`, «параметр не указан» |

Примечание: полный HTTP `/api/chat` для длинного RAG обрывал сокет (`fetch failed`); для baseline зафиксированы те же ветки через локальный pipeline (эквивалент server path до post-gate).

## Критерий фазы 0

- [x] Воспроизводимый старт PG + Ollama embed
- [x] Чанки в PG для `sdb1560m` > 0 (**92**)
- [x] Inventory knowledge + trace «до»

**Готовность к фазе 1:** да (ingest уже выполнен; при смене РЭ — `--force` re-ingest).
