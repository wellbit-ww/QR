# Журнал учётных записей портала

## Интерактивное меню (рекомендуется)

```powershell
npm run user:app
```

Откроется локальное приложение в браузере: создание аккаунтов, сброс пароля, предпросмотр и скачивание PNG-наклеек.

Консольное меню по-прежнему доступно:

```powershell
npm run user:menu
```

Пошагово: создать аккаунт, добавить/убрать оборудование по номерам из списка, сменить пароль, организацию и т.д. В журнал ниже пишутся события аккаунтов без plaintext-паролей.

---

Файл **`portal-accounts.jsonl`** создаётся автоматически при `npm run user:create` и `npm run user:menu`.

Каждая строка — JSON с полями:

| Поле | Описание |
|------|----------|
| `ts` | Дата и время (ISO) |
| `action` | `create`, `password_reset`, `deactivate`, `activate` |
| `login` | Логин |
| `passwordStored` | Всегда `false`: пароль в журнал не сохраняется |
| `equipmentIds` | Привязанное оборудование |
| `label` | Название организации |
| `loginUrl` | URL для QR на наклейке |

Файл **не попадает в git** (см. `.gitignore`). Храните копию в безопасном месте: там нет паролей, но есть список логинов и организаций.

Другой путь: переменная окружения `PORTAL_ACCOUNTS_LOG`.

**Аккаунт создан до появления журнала** — допишите вручную:

```bash
npm run user:create -- --journal-only --login ИМЯ --equipment sdb1106-nm --label "Организация"
```

Пароль из БД восстановить нельзя (хранится только хеш); если забыли — `--reset-password`, после чего новый пароль будет показан один раз в консоли для печати наклейки.

PNG-наклейка генерируется автоматически в `stickers/<login>.png` (QR не меняется, подставляются только логин и пароль). Один раз установите Pillow:

```powershell
python -m pip install -r scripts/requirements-sticker.txt
```

## Изменение существующего аккаунта (`sovt01` и др.)

Все команды — из папки проекта. Нужен **Postgres** и **`POSTGRES_URL`**:

```powershell
# один раз за сессию PowerShell:
$env:POSTGRES_URL = "postgresql://rag:rag_secret_change_me@127.0.0.1:5432/equipment_rag"

# или один раз в проекте: copy .env.example .env  (скрипт подхватит сам)
```

# Посмотреть текущие настройки
npm run user:create -- --login sovt01 --show

# Добавить модель к доступу
npm run user:create -- --login sovt01 --add-equipment w-700

# Убрать одну модель (должна остаться хотя бы одна)
npm run user:create -- --login sovt01 --remove-equipment w-700

# Заменить список целиком
npm run user:create -- --login sovt01 --set-equipment --equipment sdb1106-nm --equipment sdb702-nm

# Сменить название организации
npm run user:create -- --login sovt01 --set-label "ООО Совтест АТЕ"

# Новый пароль (напечатать на наклейке заново)
npm run user:create -- --login sovt01 --reset-password --generate-password

# Заблокировать / снова включить вход
npm run user:create -- --login sovt01 --deactivate
npm run user:create -- --login sovt01 --activate
```

ID оборудования — как в `data/equipment.json` (`sdb1106-nm`, `sdb702-nm`, `w-700`).
Комада для создания npm run user:create -- --login sovt02 --generate-password --equipment sdb1106-nm --label "ООО Совтест АТЕ" --base-url https://192.168.7.170:3000