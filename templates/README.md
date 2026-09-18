# Наклейка SDB1106 NM

Шаблон: `sticker-sdb1106nm.png`  
Координаты текста: `sticker-sdb1106nm.layout.json`

Размер макета: **75 × 53 мм** при **300 DPI** (`886 × 626 px`).

QR на макете **не меняется** — он ведёт на `/login?equipment=sdb1106-nm`.  
Скрипт подставляет **название оборудования**, **логин** и **пароль**.

## Установка (один раз)

```powershell
python -m pip install -r scripts/requirements-sticker.txt
```

## Автоматически при создании/сбросе пароля

```powershell
npm run user:create -- --login demo01 --generate-password --equipment sdb1106-nm
npm run user:menu
```

Готовый файл: `stickers/<login>.png`

## Вручную

```powershell
npm run sticker:generate -- --login demo01 --password "YourPassword12"
```

Или свой путь:

```powershell
python scripts/generate-portal-sticker.py --login demo01 --password "YourPassword12" --output stickers/demo01.png
```
