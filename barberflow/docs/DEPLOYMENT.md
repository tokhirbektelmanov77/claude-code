# Развёртывание

> Реальный деплой в рамках MVP **не выполнялся**. Ниже — проверенные локально шаги сборки и
> чек-лист для production. `Dockerfile` и `docker-compose.yml` написаны, но не запускались:
> в среде разработки не было Docker-демона.

## Процессы

| Процесс | Команда | Порт | Масштабирование |
| --- | --- | --- | --- |
| API | `pnpm db:migrate && node apps/api/dist/main.js` | 4000 | Горизонтально (после переноса rate limit в Redis) |
| Web | `cd apps/web && npx next start` | 3000 | Горизонтально; `API_INTERNAL_URL` указывает на API |
| Worker | `node apps/worker/dist/index.js` | — | Задачи — несколько инстансов безопасно (`SKIP LOCKED`); **getUpdates бота — только один инстанс** (или перейти на webhook) |
| PostgreSQL 16 | managed-сервис | 5432 | Ежедневные бэкапы + PITR |

Сборка: `pnpm install --frozen-lockfile && pnpm build` (проверено: `next build` собирает 23 маршрута, API и worker компилируются `tsc`).

## Переменные production

```
NODE_ENV=production
DATABASE_URL=postgresql://…?sslmode=require
WEB_ORIGIN=https://<домен>
NEXT_PUBLIC_APP_URL=https://<домен>
API_INTERNAL_URL=http://api:4000
OTP_SECRET=<openssl rand -hex 32>
OTP_DEV_MODE=false
SMS_PROVIDER=<реальный провайдер — нужно реализовать, см. ниже>
COOKIE_SECURE=true
TRUST_PROXY=true            # если API за reverse proxy
TELEGRAM_BOT_TOKEN=…        # из @BotFather, хранить в secret manager
TELEGRAM_BOT_USERNAME=…
PLATFORM_ADMIN_PHONES=      # лучше назначать админов вручную в БД и оставить пустым
```

API проверяет конфигурацию при старте и **не запустится** в production с `OTP_DEV_MODE`, `SMS_PROVIDER=console`, `RELAX_RATE_LIMITS` или dev-значением `OTP_SECRET`.

## Telegram

1. Создать бота в @BotFather, задать `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME`.
2. В @BotFather → *Bot Settings → Menu Button / Configure Mini App* указать `https://<домен>/tg` (Mini App требует HTTPS).
3. Ссылка для клиентов: `https://t.me/<bot>?startapp=<slug-бизнеса>` (показывается в кабинете → «Моя ссылка»).
4. Worker сам опрашивает `getUpdates`; при переходе на webhook — отключить polling.

## Что нужно для production

- [ ] **SMS-провайдер**: реализовать `SmsProvider` (например, Eskiz / Play Mobile) в `apps/api/src/auth/sms.provider.ts`, договор, шаблоны, отправитель. Без него вход по телефону в production невозможен (API вернёт `SMS_UNAVAILABLE`), работает только Telegram.
- [ ] Домен, HTTPS, reverse proxy (nginx/Caddy) с `X-Forwarded-For`.
- [ ] Managed PostgreSQL с шифрованием, бэкапами и проверкой восстановления; размещение данных — по требованиям законодательства РУз (нужна юридическая оценка).
- [ ] Redis-хранилище для `@nestjs/throttler` при нескольких инстансах API.
- [ ] Секреты в secret manager, ротация токена бота и `OTP_SECRET`.
- [ ] Мониторинг и алерты (ошибки 5xx, `FAILED` задачи уведомлений, задержка очереди), централизованные логи.
- [ ] CSP с nonce, 2FA/ограничение по IP для `/platform-admin`.
- [ ] Юридические документы: политика конфиденциальности, оферта, согласие на обработку ПДн.
- [ ] Платёжный провайдер (Payme/Click) — отдельный модуль по интерфейсу `PaymentProvider`; сейчас только ручное подтверждение.
- [ ] Нагрузочное тестирование, проверка на реальных iPhone (Safari/WebKit не тестировался) и Android, внешний аудит безопасности.
- [ ] CI (lint, typecheck, unit/integration с сервисом PostgreSQL, E2E) — в репозитории не настроен, так как в корне находится чужая инфраструктура GitHub Actions со своими правилами (см. `CLAUDE.md`).
