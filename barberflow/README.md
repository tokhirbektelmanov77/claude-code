# BARBERFLOW

MVP SaaS-платформы онлайн-записи к барберам и в барбершопы Узбекистана.
Клиент открывает ссылку мастера (`/b/aziz`), выбирает услугу, дату и время и записывается без звонка.
Барбер и владелец ведут расписание в мобильном кабинете, владелец платформы управляет бизнесами и подписками.

> Статус: работающий MVP, проверенный автоматическими тестами локально (см. «Тесты»).
> **Не готов к production** без пунктов из [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#что-нужно-для-production).

Документация: [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATABASE](docs/DATABASE.md) · [API](docs/API.md) ·
[DEPLOYMENT](docs/DEPLOYMENT.md) · [SECURITY](docs/SECURITY.md) · [ROADMAP](docs/ROADMAP.md) · [DESIGN](docs/DESIGN.md)

## Что внутри

| Часть | Технологии | Путь |
| --- | --- | --- |
| Web: клиент, кабинеты, админка, Telegram Mini App | Next.js 16, React 19, Tailwind CSS 4, компоненты в стиле shadcn/ui (Radix), Lucide, TanStack Query; дизайн-система «Espresso / Leather» | `apps/web` |
| REST API + Swagger | NestJS 11, Zod (nestjs-zod), Prisma 6 | `apps/api` |
| Фоновый worker (уведомления, Telegram-бот, жизненный цикл подписок) | Node.js, очередь на PostgreSQL | `apps/worker` |
| Схема БД, миграции, seed | Prisma + raw SQL (exclusion constraint) | `packages/db` |
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

