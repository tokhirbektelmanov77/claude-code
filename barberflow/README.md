# BARBERFLOW

MVP SaaS-платформы онлайн-записи к барберам и в барбершопы Узбекистана.
Клиент открывает ссылку мастера (`/b/aziz`), выбирает услугу, дату и время и записывается **без регистрации —
только имя и телефон**. Оплата — барберу на месте, через сервис клиенты не платят.
Барбер и владелец ведут расписание в мобильном кабинете, владелец платформы управляет бизнесами и подписками.

> Статус: работающий MVP, проверенный автоматическими тестами локально (см. «Тесты»).
> **Не готов к production** без пунктов из [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#что-нужно-для-production).

Документация: [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATABASE](docs/DATABASE.md) · [API](docs/API.md) ·
[DEPLOYMENT](docs/DEPLOYMENT.md) · [SECURITY](docs/SECURITY.md) · [ROADMAP](docs/ROADMAP.md) · [DESIGN](docs/DESIGN.md)

## Модель продукта

| Кто | Как входит | Что может |
| --- | --- | --- |
| Клиент | Не входит. Записывается по имени и телефону | Получает секретную ссылку `/a/<token>`: просмотр, перенос, отмена, «Добавить в календарь». «Мои записи» показывают записи с этого устройства |
| Барбер / администратор салона | Телефон + пароль. Присоединяется к бизнесу по ссылке-приглашению от владельца | Свой день, календарь, график, клиенты, ссылка и QR |
| Владелец барбершопа | Телефон + пароль (регистрация в онбординге) | Весь бизнес: сотрудники, услуги, филиалы, настройки, подписка |
| Владелец платформы (PLATFORM_ADMIN) | Телефон + пароль. Роль выдаётся только командой `pnpm admin:create` | `/platform-admin` |

Telegram-бота и SMS в продукте нет: телефоны не подтверждаются. Поэтому номер телефона сам по себе не даёт
никаких прав: в команду попадают только по секретной ссылке, а забытый пароль заменяет временным паролем
владелец бизнеса (для своих сотрудников) или администратор платформы (для владельцев).

## Что внутри

| Часть | Технологии | Путь |
| --- | --- | --- |
| Web: клиентская запись, кабинеты, админка | Next.js 16, React 19, Tailwind CSS 4, компоненты в стиле shadcn/ui (Radix), Lucide, TanStack Query; дизайн-система «Espresso / Leather» | `apps/web` |
| REST API + Swagger | NestJS 11, Zod (nestjs-zod), Prisma 6 | `apps/api` |
| Фоновый worker (жизненный цикл подписок, очистка сессий) | Node.js | `apps/worker` |
| Схема БД, миграции, seed, CLI создания администратора | Prisma + raw SQL (exclusion constraint) | `packages/db` |
| Общий код: алгоритм слотов, Zod-схемы, словари ru/uz, форматтеры | TypeScript | `packages/shared` |
| UI-кит | React + Radix + CVA | `packages/ui` |

## Требования

- Node.js ≥ 22, pnpm 10 (`corepack enable`)
- PostgreSQL 16 (локально или `docker compose up -d postgres`)
- Для E2E: Chromium для Playwright 1.63 (`npx playwright install chromium`, если его нет)

## Быстрый старт

```bash
cd barberflow
cp .env.example .env              # значения по умолчанию подходят для локальной разработки
pnpm install

# 1. PostgreSQL — вариант A: Docker
docker compose up -d postgres     # создаёт БД barberflow и barberflow_test
# PostgreSQL — вариант B: локальный сервер
#   CREATE ROLE barberflow LOGIN PASSWORD 'barberflow' CREATEDB;
#   CREATE DATABASE barberflow OWNER barberflow; CREATE DATABASE barberflow_test OWNER barberflow;

# 2. Миграции и демо-данные
pnpm build:packages               # shared + Prisma Client
pnpm db:migrate                   # prisma migrate deploy (включая exclusion constraint)
pnpm db:seed                      # BARBERFLOW DEMO, безопасно запускать повторно

# 3. Запуск (три процесса)
pnpm dev                          # api :4000, web :3000, worker — параллельно
# или по отдельности: pnpm dev:api · pnpm dev:web · pnpm dev:worker
```

Команды `pnpm db:*` и `pnpm admin:create` сами читают `DATABASE_URL` из корневого `.env`.

### Администратор платформы

```bash
pnpm admin:create --phone "+998 90 123 45 67" --name "Имя"
```

Команда выдаёт роль PLATFORM_ADMIN и печатает одноразовый временный пароль; при первом входе его нужно сменить.
Другого способа получить эту роль нет.

### Локальные адреса

| URL | Что |
| --- | --- |
| http://localhost:3000 | Главная |
| http://localhost:3000/b/aziz | Персональная ссылка барбера Азиза (демо-сценарий) |
| http://localhost:3000/s/barberflow-demo | Страница барбершопа |
| http://localhost:3000/a/&lt;token&gt; | Запись клиента по секретной ссылке |
| http://localhost:3000/me | «Мои записи» на этом устройстве |
| http://localhost:3000/login | Вход для барберов и владельцев |
| http://localhost:3000/app | Кабинет барбера / владельца |
| http://localhost:3000/account | Аккаунт сотрудника: пароль, экспорт, удаление |
| http://localhost:3000/onboarding | Регистрация нового барбершопа (7 шагов) |
| http://localhost:3000/invite/&lt;token&gt; | Приглашение в команду |
| http://localhost:3000/platform-admin | Админ-панель SaaS (только PLATFORM_ADMIN) |
| http://localhost:4000/docs | Swagger UI, `…/docs/openapi.json` — спецификация |
| http://localhost:4000/health | Health-check (проверяет БД) |

Браузер обращается только к `:3000`; Next.js проксирует `/api/*` в NestJS, поэтому cookie сессии first-party.

## Демо-аккаунты (только для разработки)

Пароль у всех демо-сотрудников: **`barberflow-demo`**. Seed отказывается работать при `NODE_ENV=production`.

| Роль | Телефон | Что посмотреть |
| --- | --- | --- |
| PLATFORM_ADMIN | +998 90 000 00 01 | `/platform-admin`: бизнесы, тарифы, подтверждение платежа DEMO-0002, сброс пароля владельцу |
| Владелец (BARBERFLOW DEMO) | +998 90 000 00 02 | `/app/dashboard`, сотрудники (приглашение по ссылке, временный пароль), услуги, календарь |
| Барбер (Азиз) | +998 90 000 00 03 | `/app/today`, календарь, график, ссылка/QR |
| Владелец SOLO-бизнеса | +998 90 000 00 05 | бизнес на пробном периоде |

Клиенту аккаунт не нужен: откройте `/b/aziz` и запишитесь. Seed также печатает ссылку `/a/<token>` на будущую
запись демо-клиента. Все номера и имена вымышленные.

### Демо-сценарий

Азиз · «Мужская стрижка» · 100 000 сум · 45 минут · **17 ноября 2026, 16:00–16:45**.
Seed оставляет этот слот свободным (рядом есть записи 11:00 и 14:00 и обед 13:00–14:00) и в конце
печатает `Demo slot … FREE ✓`. Повторный `pnpm db:seed` пересоздаёт только демо-бизнесы (`is_demo`).
Если дата 17.11.2026 уже прошла или вышла за горизонт записи (30 дней), seed сообщит об этом.

## Переменные окружения

См. [.env.example](.env.example). Ключевые:

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` / `TEST_DATABASE_URL` | Основная и тестовая БД (тесты очищают тестовую!) |
| `WEB_ORIGIN`, `API_INTERNAL_URL` | Origin веб-приложения и адрес API для прокси Next.js |
| `COOKIE_SECURE`, `TRUST_PROXY` | В production за HTTPS-прокси — `true` |
| `RELAX_RATE_LIMITS` | Только dev/E2E: отключает ограничение частоты запросов; API **не стартует** с ним в production |
| `WORKER_INTERVAL_MS` | Период фоновых задач worker |

## Тесты

```bash
pnpm test        # unit (shared) + integration (api, worker) — нужна БД barberflow_test
pnpm test:e2e    # Playwright; поднимает api/web, если они не запущены, и пересидирует демо-данные
pnpm typecheck
pnpm lint
```

Фактические результаты последнего прогона — в [docs/ROADMAP.md](docs/ROADMAP.md#текущий-статус).

## Резервное копирование

`DATABASE_URL=… ./scripts/backup-db.sh ./backups` — `pg_dump` в custom-формате, хранит 14 последних копий.
