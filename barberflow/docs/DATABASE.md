# База данных

PostgreSQL 16, Prisma 6. Схема: [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma),
миграции: `packages/db/prisma/migrations`. Таблицы и колонки — `snake_case`.

## Сущности

| Модель (таблица) | Назначение | Ключевые поля / связи |
| --- | --- | --- |
| `User` (`users`) | Человек: клиент, барбер, владелец, админ | `phone` unique, `telegram_id` unique, `telegram_chat_id` (куда может писать бот), `platform_role` (`USER`/`PLATFORM_ADMIN`), `deleted_at` |
| `Session` | Сессия входа | `token_hash` (sha256), `expires_at`, `revoked_at` |
| `OtpCode` | Одноразовый код | `code_hash` (HMAC), `attempts`, `expires_at`, `consumed_at` |
| `TelegramLinkToken` | Одноразовая привязка Telegram-чата к аккаунту | `token_hash`, срок 15 мин |
| `Business` (**tenant**) | Барбершоп | `slug` unique, `status` (`ACTIVE`/`BLOCKED`), правила записи (`booking_horizon_days`, `min_lead_minutes`, `slot_step_minutes`, `cancellation_min_hours`), `timezone`, `onboarding_step`, `is_demo` |
| `BusinessMember` | Роль пользователя в бизнесе | unique (`business_id`,`user_id`), `role` `OWNER`/`MANAGER`/`BARBER`, `status` |
| `Invitation` | Приглашение сотрудника по телефону | `role`, `barber_id?`, срок 14 дней |
| `Branch` | Филиал | `business_id` |
| `Barber` | Профиль мастера | `business_id`, `user_id?`, `slug` (глобально unique → `/b/<slug>`), `branch_id?` |
| `Service` | Услуга | `price_uzs` (целые сумы), `duration_min`, `buffer_after_min` (техперерыв) |
| `BarberService` | Кто что выполняет | PK (`barber_id`,`service_id`), необязательные override цены/длительности |
| `Customer` | Клиент **внутри бизнеса** | unique (`business_id`,`phone`), `user_id?`, `consent_at`, `anonymized_at` |
| `WorkingHours` | Недельный шаблон | `weekday` 1–7, `start_min`/`end_min` (минуты от полуночи); несколько строк в день = перерывы |
| `ScheduleException` | Выходной / отпуск / блокировка | `type`, `starts_at`/`ends_at` (UTC) |
| `Appointment` | Запись | `starts_at`, `ends_at`, `blocked_until` (= конец + техперерыв), `status`, `source` (`ONLINE`/`TELEGRAM`/`MANUAL`), **снимок** `price_uzs`/`duration_min`/`service_name`, `idempotency_key` unique |
| `AppointmentEvent` | Журнал записи | `type` (`CREATED`, `RESCHEDULED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`), `actor_user_id`, `data` |
| `SubscriptionPlan` | Тариф | `code`, `pricing` (`FLAT`/`PER_SEAT`), `price_uzs`, `min_seats`, `max_seats`, `trial_days` |
| `Subscription` | Подписка бизнеса (1:1) | `status` `TRIALING/ACTIVE/PAST_DUE/EXPIRED/CANCELLED`, `trial_ends_at`, `current_period_end` |
| `Payment` | Платёж (ручной учёт) | `status` `PENDING/CONFIRMED/REJECTED`, `method`, `reference`, `confirmed_by_user_id`; `provider*` — для будущей интеграции |
| `NotificationJob` | Очередь уведомлений | `dedupe_key` unique, `status`, `run_at`, `attempts`, `max_attempts`, `last_error`, `locked_by` |
| `AuditLog` | Аудит критических действий | `actor_user_id`, `business_id?`, `action`, `entity_*`, `ip` |
| `ErrorLog` | Технические ошибки API/worker | для админ-панели |

Роли из ТЗ: `CLIENT` — любой `User` (клиентский профиль в бизнесе = `Customer`); `BARBER` и `BUSINESS_OWNER` — через `BusinessMember` (один пользователь может работать в нескольких бизнесах); `PLATFORM_ADMIN` — `users.platform_role`. Дополнительно есть `MANAGER` (администратор салона).

## Ограничения вне Prisma (raw SQL в миграции `init`)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;           -- trusted extension, владелец БД может создать
ALTER TABLE appointments ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at, blocked_until, '[)') WITH &&)
  WHERE (status IN ('CONFIRMED','COMPLETED'));
-- CHECK-и: интервал записи, неотрицательные цены, корректные рабочие часы и исключения
CREATE INDEX notification_jobs_due_idx ON notification_jobs (run_at) WHERE status = 'PENDING';
```

`CANCELLED` и `NO_SHOW` не участвуют в ограничении — время освобождается.

## Изоляция арендаторов

Каждая таблица бизнеса содержит `business_id` (или связана через `barber_id`, который принадлежит бизнесу).
API проверяет членство (`BusinessAccessGuard`) **и** фильтрует каждый запрос по `businessId` (например, `findFirst({ where: { id, businessId } })`), поэтому чужой ID через свой бизнес даёт 404.
Row Level Security в PostgreSQL не включён — см. ROADMAP.

## Миграции и seed

```bash
pnpm db:migrate        # prisma migrate deploy
pnpm db:migrate:dev    # создать новую миграцию в разработке
pnpm db:seed           # демо-данные; отказывается работать при NODE_ENV=production
pnpm db:reset          # dev: сбросить БД (удаляет ВСЕ данные)
```

Seed трогает только бизнесы `is_demo = true` со slug `barberflow-demo`/`solo-demo`; если такой slug занят реальным бизнесом, он останавливается с ошибкой. Тарифы создаются, только если их нет (цены, изменённые админом, не перезаписываются).
