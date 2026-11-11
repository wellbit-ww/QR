# SDB1560M — baseline Task 9 (first authenticated HTTP baseline)

**Дата:** 2026-10-29  
**Статус:** **BLOCKED — AUTHENTICATION REQUIRED**

HTTP baseline production RAG **не выполнен**. Preflight (unit + dry-run) завершён; authenticated chat **не вызывался**.

---

## 1. Git и сохранность рабочего дерева

| | Значение |
|---|----------|
| Ветка | `backup/sova-portal` |
| HEAD (до/после Task 9) | `8523954fadcc4f31b92305f81b8dfc09f3e61a14` |
| Рабочее дерево | **dirty** (сохранено; reset/checkout/clean/stash **не выполнялись**) |

Production RAG, `.env`, БД, индекс, eval suite, legacy tests — **не изменялись**. Provisioning / ingest — **не запускались**.

---

## 2. Preconditions (выполнено / не выполнено)

| Шаг | Результат |
|-----|-----------|
| Task 8 report прочитан | да |
| Suite SHA-256 | `5bab36e3114852d3154fec6182b53352e0700650e396e4a439d8e25a40afe695` — **совпадает** с ожиданием |
| `node scripts/test-sdb1560m-eval-runner-unit.js` | **OK** |
| Dry-run `--partition=verified` | **6** кейсов, все `not_run` |
| `EVAL_LOGIN` | **missing** |
| `EVAL_PASSWORD` | **missing** |

**Стоп до HTTP:** оба credential отсутствуют в **текущем process environment** агента. Значения **не** запрашивались и **не** извлекались из `.env`, cookies или других источников.

---

## 3. Выбранные 6 verified case ID (dry-run)

Из `logs/baseline-task9/dry-run-verified/report.json`:

1. `num.mass.verified`
2. `num.dry-power-base.verified`
3. `maint.desicc-interval.verified`
4. `mode.regen-shutdown.verified`
5. `alarm.beep-door.verified`
6. `para.mass-colloquial.verified`

Runner lib: **`1.2-task6`** (manifest).

---

## 4. HTTP execution

| Метрика | Значение |
|---------|----------|
| Portal probe (authenticated) | **не выполнялся** |
| `--allow-http` runs | **0** |
| HTTP case executions | **0** |
| Команда baseline (не запускалась) | `node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --out=logs/baseline-task9/http-run-20261029` |

Dry-run **не** является production HTTP baseline.

---

## 5. Per-case analysis

Нет сохранённых ответов RAG. Для всех шести ID:

| case_id | Ответ | Sources/chunks | Runner layers | Диагностика | Manual review |
|---------|-------|----------------|---------------|-------------|---------------|
| *(все 6)* | — | — | dry-run `not_run` | **E — insufficient_evidence** | требуется после HTTP |

---

## 6. Артефакты Task 9

| Путь | Описание |
|------|----------|
| `logs/baseline-task9/dry-run-verified/manifest.json` | git, suite hash, env fingerprint |
| `logs/baseline-task9/dry-run-verified/report.json` | 6 × `not_run` |
| `logs/baseline-task9/dry-run-verified/SUMMARY.md` | сводка dry-run |
| `docs/reports/sdb1560m-baseline-task9.md` | этот отчёт |

`logs/baseline-task9/http-run-20261029/` — **не создан**.

Отчёты Task 0–8 и `logs/baseline-task7|8/` — **не перезаписывались**.

---

## 7. Блокер и следующий шаг

**Причина:** `EVAL_LOGIN` и `EVAL_PASSWORD` не заданы в shell-сессии, из которой запускается runner. Runner не загружает `.env` автоматически и не создаёт пользователей.

**Оператор (PowerShell, локально — пароль не в чат и не в git):**

```powershell
cd C:\Users\SOVAI\Documents\Work\QR
$env:EVAL_BASE_URL = "http://127.0.0.1:3000"
$env:EVAL_LOGIN = Read-Host "Portal login"
$sec = Read-Host "Portal password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $env:EVAL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

node scripts/test-sdb1560m-eval-runner-unit.js
node scripts/run-sdb1560m-eval-v1.js --dry-run --partition=verified
node scripts/run-sdb1560m-eval-v1.js --allow-http --partition=verified --out=logs/baseline-task9/http-run-20261029
```

Требования:

- Портал на `:3000` уже запущен.
- Учётная запись **существует** и имеет доступ к **`sdb1560m`** (создание — вне Task 9, см. runbook / `user:app`).
- После успеха: manifest `authMode: eval_login`, report с **6** выполненными кейсами (не `not_run`).

**Рекомендуемый следующий шаг:** повторить Task 9 (или операторский прогон по §7) в терминале с credentials; затем заполнить per-case анализ из `logs/baseline-task9/http-run-20261029/report.json`.

---

## 8. Ограничения метрик

Runner heuristic `pass` ≠ семантическая корректность RAG. KPI из SUMMARY не использовать как доказательство качества до ручного разбора baseline.

**Оптимизация RAG в Task 9 не выполнялась.**
