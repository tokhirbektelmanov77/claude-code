# Архитектура BARBERFLOW

## Решения

| Решение | Почему |
| --- | --- |
| **Модульный монолит**: один NestJS API + отдельный процесс worker | Одна БД и транзакции на всё бронирование; модули (`auth`, `booking`, `business`, `schedule`, `subscriptions`, `platform-admin`, `notifications`) разделены по папкам и могут быть вынесены позже |
| Проект в подпапке `barberflow/` | Репозиторий уже содержал чужие файлы (форк `claude-code`); ничего из них не изменено |
| `packages/db` вместо Prisma внутри `apps/api` | Схемой и Prisma Client пользуются и API, и worker, и seed |
| Версии: Next 16, React 19.2, NestJS **11**, Prisma **6**, TypeScript **5.9**, Zod 4 | Стабильные ветки с проверенной совместимостью. NestJS 12, Prisma 7 (обязательные driver adapters, новый генератор) и TypeScript 7 вышли недавно — переход вынесен в roadmap |
| Очередь уведомлений в PostgreSQL (`notification_jobs` + `FOR UPDATE SKIP LOCKED`) | Задача создаётся в той же транзакции, что и запись → нет «потерянных» и «фантомных» уведомлений; не нужен Redis для MVP |
| Валидация — общие Zod-схемы (`packages/shared/schemas.ts`) | Одни и те же контракты на фронте (формы) и бэке (`nestjs-zod` → Swagger) |
| Собственная лёгкая i18n (типизированные словари) вместо next-intl | Два языка, без маршрутизации по локали; ключи проверяются TypeScript, словари используются и worker'ом для текстов Telegram |
| shadcn/ui-подход: компоненты лежат в `packages/ui` (Radix + CVA + Tailwind) | CLI shadcn требует доступа к реестру; компоненты написаны по тем же принципам и полностью под контролем проекта |
| Сессии: случайный токен в HttpOnly cookie, в БД только sha256 | Мгновенный отзыв сессии (logout, удаление аккаунта), нет JWT-секрета, который нужно ротировать |
| Next.js проксирует `/api/*` в NestJS | Cookie first-party, `SameSite=Lax` достаточно, CORS не нужен браузеру |

## Схема

```
Browser / Telegram WebView
        │  https://app/…           (Next.js 16: страницы — клиентские компоненты + TanStack Query)
        │  https://app/api/* ──rewrite──►  NestJS API :4000
        │                                     │  guards: Session → Auth → BusinessAccess(RBAC) / PlatformAdmin
        │                                     │  BookingService ──► PostgreSQL (FOR UPDATE + EXCLUDE constraint)
        │                                     │  NotificationsService → notification_jobs (в той же транзакции)
        │                                     ▼
        │                                PostgreSQL 16
        │                                     ▲
Telegram Bot API ◄──sendMessage/getUpdates── worker (poll jobs, retries, /start-привязка чата, истечение подписок)
```

## Модули API (`apps/api/src`)

- `auth/` — OTP (интерфейс `SmsProvider`: `none`, `console`), сессии, проверка Telegram `initData` (HMAC по документации Telegram), `SessionMiddleware` (cookie → `req.auth`, проверка Origin для небезопасных методов).
- `common/` — `PrismaService`, `AllExceptionsFilter` (единый формат ошибок `{statusCode, code, message}` + запись 5xx в `error_logs`), guards, `AuditService`.
- `booking/` — `AvailabilityService` (загрузка графика/исключений/записей → чистый алгоритм из `shared`), `BookingService` (создание, перенос, отмена, исход визита), кабинетные эндпоинты.
- `business/` — бизнес, онбординг, мастера, услуги, филиалы, команда и приглашения, клиенты (поиск, экспорт, анонимизация), dashboard.
- `schedule/` — рабочие часы (интервалы по дням недели; обед = разрыв между интервалами) и исключения (выходной, отпуск, блокировка).
- `subscriptions/` — ручной учёт платежей и активация периода; `payment-provider.ts` — интерфейс будущих Payme/Click (не реализован).
- `platform-admin/` — всё под `PlatformAdminGuard`.
- `public/`, `me/` — публичные страницы и клиентские операции.

## Алгоритм доступности (`packages/shared/src/availability.ts`)

Чистая функция без I/O, покрыта unit-тестами.

1. Дата в часовом поясе бизнеса (`Asia/Tashkent`, luxon) → рабочие интервалы этого дня недели.
2. Кандидаты: от начала каждого интервала с шагом `slotStepMinutes`, пока **услуга** помещается в интервал.
3. Отбрасываются кандидаты:
   - в прошлом или раньше `now + minLeadMinutes` (для клиентов);
   - за пределами `bookingHorizonDays`;
   - если `[start, start + длительность + техперерыв)` пересекает любой занятый интервал:
     записи `CONFIRMED/COMPLETED` (их `[startsAt, blockedUntil)` уже включает их техперерыв),
     выходные, отпуска, блокировки.
4. Тот же `checkSlot` повторно выполняется в транзакции перед вставкой.

Интервалы полуоткрытые: запись 16:00–16:45 не мешает записи с 16:45.

## Защита от двойного бронирования (три уровня)

1. **Проверка в транзакции**: `SELECT … FROM barbers WHERE id = $1 FOR UPDATE` сериализует все записи к одному мастеру; после блокировки календарь перечитывается и слот проверяется заново.
2. **Ограничение БД**: `EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at, blocked_until, '[)') WITH &&) WHERE status IN ('CONFIRMED','COMPLETED')`. Даже код, обходящий сервис, не создаст пересечение (`23P01` → HTTP 409 `SLOT_TAKEN`).
3. **Идемпотентность**: заголовок `Idempotency-Key` (UI генерирует один ключ на экран подтверждения). Ключ скоупится пользователем и хранится с уникальным индексом; повтор возвращает исходную запись (`replayed: true`), в том числе если повтор пришёл параллельно.

Проверено интеграционными тестами: 2 одновременных клиента → ровно один 201 и один 409; 10 параллельных запросов на перекрывающиеся интервалы → ни одного пересечения в БД.

## Время

Все `timestamptz` хранятся в UTC. Рабочие часы — минуты от локальной полуночи бизнеса.
Отображение — `formatTime/formatDate*` из `shared` в `business.timezone` (по умолчанию Asia/Tashkent, без перехода на летнее время).
Узбекские названия месяцев/дней заданы явно, так как ICU-данные для `uz-Latn` различаются между браузерами.

## Уведомления

`NotificationsService` пишет задачи в транзакции изменения записи: клиенту и барберу (если у них есть аккаунт), напоминания за 24 ч и 2 ч.
Worker забирает задачи `FOR UPDATE SKIP LOCKED`, проверяет актуальность (перенесённые/отменённые → `SKIPPED/STALE`),
отправляет через Bot API. Итоговые статусы: `SENT`, `SKIPPED` (`NO_CHANNEL`, `TELEGRAM_NOT_CONFIGURED`, `BOT_UNREACHABLE`, `STALE`), `FAILED` (после `maxAttempts`, с записью в `error_logs`).
Бот не может написать первым: чат привязывается только после `/start` (deep link `t.me/<bot>?start=link_<token>` из «Мои записи») или при входе через Mini App с `allows_write_to_pm`.

## Фронтенд

- `app/s/[slug]` — страница барбершопа; `app/s/[slug]/book` — мастер записи, шаг хранится в query-параметрах (работает «Назад»).
- `app/b/[slug]` — персональная ссылка мастера.
- `app/app/*` — кабинет; навигация зависит от роли (`OWNER/MANAGER` видят управление бизнесом, `BARBER` — свой день, календарь, график, клиентов, ссылку).
- `app/platform-admin` — админка SaaS.
- `app/tg` — вход из Telegram Mini App (`telegram-web-app.js`, `initData` → `/auth/telegram`, `start_param` = slug).
- Все тексты — из `packages/shared/src/i18n/{ru,uz}.ts`. Тема: светлая/тёмная/системная (CSS-переменные + `data-theme`).
