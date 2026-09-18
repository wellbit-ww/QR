# Логи ручного тестирования чата

При запуске сервера в dev-режиме каждый вопрос/ответ записывается в **NDJSON**-файл (одна строка JSON на событие). В `NODE_ENV=production` файловый лог чата по умолчанию выключен.

## Где искать файл

После старта сервера в консоли будет строка:

```
INFO Лог чата для эксперта: C:\...\QR\logs\chat-session-2026-05-20T12-30-00_12345.jsonl
```

Имя по умолчанию:

```
logs/chat-session-<ISO-дата>_<PID>.jsonl
```

Пример полного пути:

```
c:\Users\SOVAI\Documents\Work\QR\logs\chat-session-2026-05-20T14-30-00_18452.jsonl
```

## Отключить запись

```powershell
$env:CHAT_LOG_FILE = "0"
npm run dev
```

## Включить в production вручную

```powershell
$env:CHAT_LOG_FILE = "logs/my-manual-test.jsonl"
npm start
```

Включайте это только для диагностики: файл содержит полные вопросы и ответы пользователей.

## Свой путь к файлу

```powershell
$env:CHAT_LOG_FILE = "logs/my-manual-test.jsonl"
npm run dev
```

## Блоки тестирования (5×10)

В URL чата добавьте параметры блока и номера вопроса:

```
http://127.0.0.1:3000/chat?equipment=sdb1106-nm&testBlock=1&testQ=1&testSession=manual-may20
```

Меняйте `testBlock` (1–5) и `testQ` (1–10) перед каждым вопросом — они попадут в лог в поле `testMeta`.

## Что отправить эксперту

1. Файл `logs/chat-session-....jsonl` целиком после всех 50 вопросов.
2. Кратко: Direct или RAG, был ли Postgres (`POSTGRES_URL`).

Файлы `*.jsonl` в git не коммитятся.
