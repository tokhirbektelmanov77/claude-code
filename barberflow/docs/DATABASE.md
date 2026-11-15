# База данных

PostgreSQL 16, Prisma 6. Схема: [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma),
миграции: `packages/db/prisma/migrations`. Таблицы и колонки — `snake_case`.

## Сущности

| Модель (таблица) | Назначение | Ключевые поля / связи |
| --- | --- | --- |
| `User` (`users`) | Сотрудник: барбер, владелец, админ (клиенты аккаунтов не имеют) | `phone` unique (не подтверждён), `password_hash` (scrypt), `must_change_password`, `failed_login_count`/`locked_until`, `platform_role` (`USER`/`PLATFORM_ADMIN`), `deleted_at` |
| `Session` | Сессия входа | `token_hash` (sha256), `expires_at`, `revoked_at` |
| `Business` (**tenant**) | Барбершоп | `slug` unique, `status` (`ACTIVE`/`BLOCKED`), правила записи (`booking_horizon_days`, `min_lead_minutes`, `slot_step_minutes`, `cancellation_min_hours`), `timezone`, `onboarding_step`, `is_demo` |
| `BusinessMember` | Роль пользователя в бизнесе | unique (`business_id`,`user_id`), `role` `OWNER`/`MANAGER`/`BARBER`, `status` |
| `Invitation` | Приглашение сотрудника по секретной ссылке | `token_hash` unique (sha256), `role`, `barber_id?`, `phone?` (заметка), срок 14 дней, одноразовое |
| `Branch` | Филиал | `business_id` |
| `Barber` | Профиль мастера | `business_id`, `user_id?`, `slug` (глобально unique → `/b/<slug>`), `branch_id?` |
| `Service` | Услуга | `price_uzs` (целые сумы), `duration_min`, `buffer_after_min` (техперерыв) |
| `BarberService` | Кто что выполняет | PK (`barber_id`,`service_id`), необязательные override цены/длительности |
| `Customer` | Клиент **внутри бизнеса** (гость) | unique (`business_id`,`phone`): повторная запись с тем же номером попадает в ту же карточку; `consent_at`, `anonymized_at` |
| `WorkingHours` | Недельный шаблон | `weekday` 1–7, `start_min`/`end_min` (минуты от полуночи); несколько строк в день = перерывы |
| `ScheduleException` | Выходной / отпуск / блокировка | `type`, `starts_at`/`ends_at` (UTC) |
| `Appointment` | Запись | `starts_at`, `ends_at`, `blocked_until` (= конец + техперерыв), `status`, `source` (`ONLINE`/`MANUAL`), **снимок** `price_uzs`/`duration_min`/`service_name`, `idempotency_key` unique, `manage_token_hash` unique (секретная ссылка клиента) |
| `AppointmentEvent` | Журнал записи | `type` (`CREATED`, `RESCHEDULED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`), `actor_user_id`, `data` |
| `SubscriptionPlan` | Тариф | `code`, `pricing` (`FLAT`/`PER_SEAT`), `price_uzs`, `min_seats`, `max_seats`, `trial_days` |
| `Subscription` | Подписка бизнеса (1:1) | `status` `TRIALING/ACTIVE/PAST_DUE/EXPIRED/CANCELLED`, `trial_ends_at`, `current_period_end` |
| `Payment` | Платёж (ручной учёт) | `status` `PENDING/CONFIRMED/REJECTED`, `method`, `reference`, `confirmed_by_user_id`; `provider*` — для будущей интеграции |
| `AuditLog` | Аудит критических действий | `actor_user_id`, `business_id?`, `action`, `entity_*`, `ip` |
| `ErrorLog` | Технические ошибки API/worker | для админ-панели |

Роли из ТЗ: `CLIENT` — гость без аккаунта (`Customer` + секретная ссылка на запись); `BARBER` и `BUSINESS_OWNER` — через `BusinessMember` (один пользователь может работать в нескольких бизнесах); `PLATFORM_ADMIN` — `users.platform_role`. Дополнительно есть `MANAGER` (администратор салона).

## Ограничения вне Prisma (raw SQL в миграции `init`)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;           -- trusted extension, владелец БД может создать
ALTER TABLE appointments ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at, blocked_until, '[)') WITH &&)
  WHERE (status IN ('CONFIRMED','COMPLETED'));
-- CHECK-и: интервал записи, неотрицательные цены, корректные рабочие часы и исключения
```

`CANCELLED` и `NO_SHOW` не участвуют в ограничении — время освобождается.

## Изоляция арендаторов

Каждая таблица бизнеса содержит `business_id` (или связана через `barber_id`, который принадлежит бизнесу).
API проверяет членство (`BusinessAccessGuard`) **и** фильтрует каждый запрос по `businessId` (например, `findFirst({ where: { id, businessId } })`), поэтому чужой ID через свой бизнес даёт 404.
Row Level Security в PostgreSQL не включён — см. ROADMAP.

## История миграций

| Миграция | Что |
| --- | --- |
| `…_init` | Исходная схема, exclusion constraint, CHECK-и |
| `20261115140000_guest_booking_password_auth` | Без Telegram/SMS: удалены `otp_codes`, `telegram_link_tokens`, `notification_jobs` и Telegram-поля пользователей; добавлены пароли сотрудников, `appointments.manage_token_hash`, `invitations.token_hash`. Неподтверждённые приглашения по телефону удаляются, записи с источником `TELEGRAM` переводятся в `ONLINE` |

## Миграции и seed

```bash
pnpm db:migrate        # prisma migrate deploy
pnpm db:migrate:dev    # создать новую миграцию в разработке
pnpm db:seed           # демо-данные; отказывается работать при NODE_ENV=production
pnpm db:reset          # dev: сбросить БД (удаляет ВСЕ данные)
pnpm admin:create --phone "+998 …"   # выдать PLATFORM_ADMIN и временный пароль
```

Seed трогает только бизнесы `is_demo = true` со slug `barberflow-demo`/`solo-demo`; если такой slug занят реальным бизнесом, он останавливается с ошибкой. Тарифы создаются, только если их нет (цены, изменённые админом, не перезаписываются).
