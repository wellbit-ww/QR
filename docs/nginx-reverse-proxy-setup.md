# Настройка Nginx для портала сервисной поддержки

Инструкция для администратора инфраструктуры.  
Приложение (Node.js) **не публикуется напрямую** в интернет — снаружи только Nginx с HTTPS.

---

## Схема

```
Интернет
   │
   ▼  HTTPS :443
[Nginx на VM-прокси или на том же сервере]
   │
   ▼  HTTP http://127.0.0.1:3000  (только внутренняя сеть / localhost)
[Node.js портал — npm start]
   │
   ├── PostgreSQL  127.0.0.1:5432  (не открывать в интернет)
   └── Ollama      127.0.0.1:11434 (не открывать в интернет)
```

**В интернет доступен только веб-портал** (логин, каталог, чат).  
База данных и LLM снаружи недоступны.

---

## Требования

| Параметр | Значение |
|----------|----------|
| Домен | Например `portal.sovtest.ru` (уточнить у заказчика) |
| Backend | `http://127.0.0.1:3000` |
| Node.js | ≥ 22.19 |
| SSL | Let's Encrypt или корпоративный сертификат |
| Снаружи открыть | **80**, **443** |
| Снаружи закрыть | **3000**, **5432**, **11434** |

---

## 1. Настройки приложения (.env на сервере ИИ)

Перед запуском Node.js задайте (или проверьте) в `.env` в корне проекта:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=1
AUTH_REQUIRED=1
SESSION_SECRET=<случайная строка не короче 32 символов>
POSTGRES_URL=postgresql://...@127.0.0.1:5432/equipment_rag
PORTAL_BASE_URL=https://portal.sovtest.ru
CHAT_LOG_FILE=0
```

**Важно:**
- `HOST=127.0.0.1` — приложение слушает только localhost, не весь интернет.
- `TRUST_PROXY=1` — корректные HTTPS-cookie и определение протокола за прокси.
- `PORTAL_BASE_URL` — боевой URL с `https://` (для QR на наклейках).

Запуск приложения:

```bash
cd /path/to/QR
npm install
npm run ingest:knowledge   # если база знаний ещё не загружена
npm start
```

Рекомендуется оформить как systemd-сервис (см. раздел 6).

---

## 2. Установка Nginx (Linux, Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
```

Если Nginx на **отдельной VM**, а Node на другом сервере — в `proxy_pass` укажите внутренний IP сервера ИИ вместо `127.0.0.1` (см. ниже).

---

## 3. Конфигурация Nginx

Создайте файл `/etc/nginx/sites-available/portal-support`:

```nginx
# Редирект HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name portal.sovtest.ru;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# Основной HTTPS-сервер
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name portal.sovtest.ru;

    # Сертификаты (пути после certbot или корпоративного CA)
    ssl_certificate     /etc/letsencrypt/live/portal.sovtest.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.sovtest.ru/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # Безопасность
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Лимит размера тела (вложения в чат / форма поддержки)
    client_max_body_size 20m;

    location / {
        # Если Nginx на том же сервере, что и Node:
        proxy_pass http://127.0.0.1:3000;

        # Если Nginx на отдельной VM — замените на внутренний IP:
        # proxy_pass http://192.168.X.X:3000;

        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        # Таймауты: RAG + Ollama могут отвечать долго (до 2–3 минут)
        proxy_connect_timeout 60s;
        proxy_send_timeout    300s;
        proxy_read_timeout    300s;
    }
}
```

Активация:

```bash
sudo ln -s /etc/nginx/sites-available/portal-support /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. SSL-сертификат (Let's Encrypt)

```bash
sudo certbot --nginx -d portal.sovtest.ru
```

Автообновление (обычно уже настроено через systemd timer):

```bash
sudo certbot renew --dry-run
```

При корпоративном сертификате — положите `.crt` и `.key` в указанные пути в конфиге Nginx.

---

## 5. Firewall

Пример для `ufw`:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp
sudo ufw deny 5432/tcp
sudo ufw deny 11434/tcp
sudo ufw enable
```

Если Nginx и Node на **разных** машинах:
- на VM-прокси: открыть 80/443;
- на сервере ИИ: порт 3000 доступен **только** с IP прокси (или только localhost, если Nginx на той же машине).

---

## 6. Systemd-сервис для Node.js (рекомендуется)

`/etc/systemd/system/portal-support.service`:

```ini
[Unit]
Description=SOVTEST Equipment Support Portal
After=network.target postgresql.service

[Service]
Type=simple
User=portal
WorkingDirectory=/opt/QR
EnvironmentFile=/opt/QR/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable portal-support
sudo systemctl start portal-support
sudo systemctl status portal-support
```

---

## 7. Проверка после настройки

| Проверка | Ожидание |
|----------|----------|
| `curl -I https://portal.sovtest.ru` | HTTP 200 или 302 |
| `curl http://127.0.0.1:3000` с другой машины | **Недоступен** (если firewall настроен) |
| Открыть сайт в браузере | Страница входа, замок HTTPS |
| Вход тестовым логином | Сессия сохраняется, чат отвечает |
| `ss -tlnp \| grep 3000` на сервере ИИ | Слушает `127.0.0.1:3000`, не `0.0.0.0:3000` |

---

## 8. Что не публикуется

| Сервис | Порт | Доступ |
|--------|------|--------|
| Веб-портал (через Nginx) | 443 | Интернет / VPN |
| Node.js напрямую | 3000 | Только localhost / внутренняя сеть |
| PostgreSQL | 5432 | Только localhost |
| Ollama | 11434 | Только localhost |
| Админка наклеек (`npm run user:app`) | — | Только рабочие места администраторов |

---

## 9. Типовые проблемы

**Бесконечный редирект на /login**  
→ Проверьте `TRUST_PROXY=1` в `.env` и заголовок `X-Forwarded-Proto https` в Nginx.

**502 Bad Gateway**  
→ Node не запущен или слушает не тот адрес. Проверьте `systemctl status portal-support` и `HOST=127.0.0.1`.

**Чат обрывается по таймауту**  
→ Увеличьте `proxy_read_timeout` в Nginx (см. конфиг выше, 300s).

**Cookie не сохраняется**  
→ Сайт должен открываться по HTTPS; `TRUST_PROXY=1` обязателен.

---

## 10. Контакты по приложению

По логике портала, RAG и учётным записям: **Даниил Маслов**.  
Секреты (`SESSION_SECRET`, `POSTGRES_URL`) передаются отдельно по защищённому каналу.

---

*Документ подготовлен для проекта портала сервисной поддержки SDB1106NM (репозиторий QR).*
