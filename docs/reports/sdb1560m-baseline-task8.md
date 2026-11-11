# SDB1560M — baseline Task 8 (authentication + HTTP baseline)

**Дата:** 2026-10-29  
**Статус:** **BLOCKED — AUTHENTICATION REQUIRED**  
HTTP baseline production RAG **не выполнен**. Preflight и диагностика auth завершены.

---

## 1. Исходные условия и Git

| Поле | Значение |
|------|----------|
| Ветка | `backup/sova-portal` |
| HEAD (до/после) | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Рабочее дерево | **dirty** (~60 файлов porcelain); reset/checkout/clean/stash **не выполнялись** |
| Runner | `scripts/run-sdb1560m-eval-v1.js`, lib **`1.2-task6`** |
| Suite | `docs/reports/sdb1560m-eval-suite-draft-v1.json` |
| Suite SHA-256 | `5bab36e3114852d3154fec6182b53352e0700650e396e4a439d8e25a40afe695` (**совпадает** с Task 7) |
| Base URL | `http://127.0.0.1:3000` |

---

## 2. Файлы, просмотренные в Task 8

| Область | Путь |
|---------|------|
| Runner | `scripts/run-sdb1560m-eval-v1.js`, `sdb1560m-eval-http-client.js`, `sdb1560m-eval-runner-lib.js` |
| Документация | `docs/reports/sdb1560m-eval-runner.md`, `sdb1560m-eval-contour-spec.md`, `sdb1560m-eval-runner-counterexample-audit.md`, `sdb1560m-baseline-task7.md` |
| Auth (read-only) | `src/auth/auth-routes.js`, `src/auth/portal-users.js`, `public/login.js` |
| Конфиг (без значений секретов) | `.env.example` (комментарии `EVAL_*`), наличие `.env` |
| Task 7 preflight | `logs/baseline-task7/` |

**Не читались:** содержимое паролей, session cookies, полный дамп `.env`.

---

## 3. Диагностика аутентификации

### Контракт портала

| Элемент | Факт |
|---------|------|
| Endpoint | `POST /api/auth/login` |
| Тело JSON | `login`, `password`; опционально `equipment` (hint для доступа к оборудованию) |
| Успех | session cookie + JSON (redirect metadata) |
| Ошибки | 401 неверный логин/пароль; 403 нет доступа к `equipment`; 429 rate limit; 503 нет PG |
| Публичный API | `src/auth/require-auth.js` — login/logout без сессии |

### Контракт eval HTTP-клиента

`scripts/sdb1560m-eval-http-client.js` вызывает тот же endpoint с `{ login, password, equipment: equipmentId }` (`sdb1560m`) — **совпадает** с порталом.

### Учётная запись

- Требуется **существующий** пользователь в PostgreSQL (`authenticateUser` / `portal-users`).
- Runner **не** создаёт пользователей; `EVAL_AUTO_LOGIN` и legacy `provisionEvalUser` **не использовались**.
- Создание учёток штатно: `npm run user:create` / `npm run user:app` (runbook) — **не запускалось** в Task 8.

### Доступность портала

| Проверка | Результат |
|----------|-----------|
| `POST /api/auth/login` (тестовые dummy login/password) | **401** — endpoint доступен, auth включён |
| `GET /api/equipment` без сессии (Task 7) | **401** |

### Переменные окружения **процесса агента Task 8**

| Переменная | Состояние |
|------------|-----------|
| `EVAL_LOGIN` | **missing** |
| `EVAL_PASSWORD` | **missing** |
| `EVAL_BASE_URL` | `http://127.0.0.1:3000` (из окружения) |

### Файл `.env` (только факт наличия ключей, без значений)

| Ключ | В активных строках `.env` |
|------|---------------------------|
| `EVAL_LOGIN` | **not_active_in_dotenv** (в `.env.example` закомментирован пример `sovt01`) |
| `EVAL_PASSWORD` | **not_active_in_dotenv** |

**Вывод:** runner **не наследует** credentials из `.env` автоматически (в отличие от `npm start`, который грузит `.env` для сервера). Для baseline оператор должен **явно** выставить `EVAL_LOGIN` / `EVAL_PASSWORD` в **той же shell-сессии**, где запускается runner.

### Исход Task 8

**Аутентификация для runner не настроена.** Chat/HTTP eval **не запускался** (0 case runs).

---

## 4. Команды выполненные (Task 8)

| Команда | Сеть | Результат |
|---------|------|-----------|
| `node scripts/test-sdb1560m-eval-runner-unit.js` | нет | OK |
| `node scripts/run-sdb1560m-eval-v1.js --dry-run --partition=verified --out=logs/baseline-task8/dry-run-verified` | нет (git local) | 6 cases, `not_run` |
| `POST /api/auth/login` (dummy credentials, одна попытка) | да | 401 (диагностика границы) |
| `--allow-http` baseline | **не выполнялся** | — |

---

## 5. Артефакты Task 8

| Путь | Содержание |
|------|------------|
| `logs/baseline-task8/dry-run-verified/manifest.json` | git, suite hash, `evalRunnerLibVersion`, env fingerprint |
| `logs/baseline-task8/dry-run-verified/report.json` | 6 × `not_run` |
| `logs/baseline-task8/dry-run-verified/SUMMARY.md` | краткая сводка |
| `docs/reports/sdb1560m-baseline-task8.md` | этот отчёт |

**HTTP run каталог** `logs/baseline-task8/http-run-*` — **не создан** (нет auth).

Отчёты Task 0–7 **не перезаписывались**.

---

## 6. HTTP baseline и case-level findings

**HTTP case count: 0**

Плановые 6 case ID (verified partition):

1. `num.mass.verified`  
2. `num.dry-power-base.verified`  
3. `maint.desicc-interval.verified`  
4. `mode.regen-shutdown.verified`  
5. `alarm.beep-door.verified`  
6. `para.mass-colloquial.verified`  

Case-level ответы RAG, sources, chunks, слои runner — **отсутствуют**. Классификация A–E: **insufficient_evidence** для всех.

---

## 7. Инструкция оператору (PowerShell, текущая сессия)

Не вставляйте пароль в чат и не коммитьте его в репозиторий.

```powershell
cd C:\Users\SOVAI\Documents\Work\QR

# URL портала (если не задан)
$env:EVAL_BASE_URL = "http://127.0.0.1:3000"

# Логин существующего portal-user с доступом к sdb1560m
$env:EVAL_LOGIN = Read-Host "Portal login"

# Пароль только в память процесса (не echo)
$sec = Read-Host "Portal password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
  $env:EVAL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# Preflight (без HTTP)
node scripts/test-sdb1560m-eval-runner-unit.js
node scripts/run-sdb1560m-eval-v1.js --dry-run --partition=verified

# Baseline (6 verified cases, один прогон)
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --out=logs/baseline-task8/http-run-20261029
```

Убедитесь, что портал уже запущен (`npm start` или эквивалент) и учётная запись создана заранее (`npm run user:app` / runbook). Task 8 **не** создаёт пользователей.

После успешного login runner выставит `authMode: eval_login` в manifest; при ошибке — `infrastructure_error` на кейсах, **без** provisioning.

---

## 8. Ограничения и manual review

- Runner `pass` ≠ семантическая корректность RAG.
- Chunk bodies часто отсутствуют в chat JSON → grounding `not_evaluable`.
- Client env (`RAG_PURE`, `OLLAMA_MODEL` в manifest) ≠ подтверждённая конфигурация сервера.
- Index fingerprint: **unknown** (без `EVAL_INDEX_FINGERPRINT` / read-only DB).

После HTTP: **все 6** кейсов потребуют как минимum просмотра `answerPreview` и слоёв в `report.json`; неоднозначные — ручная проверка.

---

## 9. Пригодность для before/after

| Критерий | Task 8 |
|----------|--------|
| Reproducible HTTP baseline | **Нет** |
| Dry-run + suite hash + auth diagnosis | **Да** |
| Сравнение с изменениями RAG | **Нет** — сначала выполнить §7 |

---

## 10. Подтверждение ограничений

- Production RAG (`server.js`, `src/rag/**`) — **не изменялся**
- `.env` — **не изменялся** (ключи `EVAL_*` не активированы агентом)
- БД, индекс, eval suite, legacy tests — **не изменялись**
- Provisioning, ingest, legacy live/ad-hoc — **не запускались**
- Секреты — **не** записаны в отчёты

**Не переходить к оптимизации RAG**, пока не сохранён первый HTTP baseline в `logs/baseline-task8/http-run-*`.
