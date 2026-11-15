# Развёртывание

> Реальный деплой в рамках MVP **не выполнялся**. Ниже — проверенные локально шаги сборки и
> чек-лист для production. `Dockerfile` и `docker-compose.yml` написаны, но не запускались:
> в среде разработки не было Docker-демона.

## Процессы

| Процесс | Команда | Порт | Масштабирование |
| --- | --- | --- | --- |
| API | `pnpm db:migrate && node apps/api/dist/main.js` | 4000 | Горизонтально (после переноса rate limit в Redis) |
| Web | `cd apps/web && npx next start` | 3000 | Горизонтально; `API_INTERNAL_URL` указывает на API |
| Worker | `node apps/worker/dist/index.js` | — | Достаточно одного инстанса (идемпотентные задачи обслуживания) |
| PostgreSQL 16 | managed-сервис | 5432 | Ежедневные бэкапы + PITR |

Сборка: `pnpm install --frozen-lockfile && pnpm build` (проверено: `next build` собирает 23 маршрута, API и worker компилируются `tsc`).

## Переменные production

```
NODE_ENV=production
DATABASE_URL=postgresql://…?sslmode=require
WEB_ORIGIN=https://<домен>
NEXT_PUBLIC_APP_URL=https://<домен>
API_INTERNAL_URL=http://api:4000
COOKIE_SECURE=true
TRUST_PROXY=true            # если API за reverse proxy
```

API не запустится в production с `RELAX_RATE_LIMITS=true`.

Первый администратор платформы: `pnpm admin:create --phone "+998 …"` на сервере (печатает временный пароль, смена при первом входе).

## Что нужно для production

- [ ] Решить, нужен ли канал уведомлений (SMS/email). Сейчас его нет: клиенты получают ссылку на запись и файл календаря.
- [ ] Домен, HTTPS, reverse proxy (nginx/Caddy) с `X-Forwarded-For`.
- [ ] Managed PostgreSQL с шифрованием, бэкапами и проверкой восстановления; размещение данных — по требованиям законодательства РУз (нужна юридическая оценка).
- [ ] Redis-хранилище для `@nestjs/throttler` при нескольких инстансах API.
- [ ] Секреты (`DATABASE_URL` и др.) в secret manager.
- [ ] Мониторинг и алерты (ошибки 5xx, всплески гостевых записей, блокировки аккаунтов), централизованные логи.
- [ ] CSP с nonce, 2FA/ограничение по IP для `/platform-admin`, captcha на гостевую запись при появлении спама.
- [ ] Юридические документы: политика конфиденциальности, оферта, согласие на обработку ПДн.
- [ ] Платёжный провайдер (Payme/Click) — отдельный модуль по интерфейсу `PaymentProvider`; сейчас только ручное подтверждение.
- [ ] Нагрузочное тестирование, проверка на реальных iPhone (Safari/WebKit не тестировался) и Android, внешний аудит безопасности.
- [ ] CI (lint, typecheck, unit/integration с сервисом PostgreSQL, E2E) — в репозитории не настроен, так как в корне находится чужая инфраструктура GitHub Actions со своими правилами (см. `CLAUDE.md`).
