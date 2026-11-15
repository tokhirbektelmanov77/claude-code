# API

REST, JSON. Полная машинная спецификация: `GET /docs/openapi.json`, интерфейс — `/docs` (Swagger UI).
Из браузера API доступен как `/api/*` того же origin (прокси Next.js).

## Общие правила

- **Клиенты без аккаунтов**: запись по имени и телефону (`POST /public/bookings`), управление записью — по секретному токену из ответа (`/public/appointments/:token…`). Токен — 32 случайных байта (base64url, 43 символа), в БД хранится только sha256.
- **Сотрудники**: телефон + пароль → HttpOnly cookie `bf_session` (SameSite=Lax).
- **Ошибки**: `{ "statusCode": 409, "code": "SLOT_TAKEN", "message": "…", "details"?: … }`. Коды стабильны, UI переводит их через словарь `errors.*`.
  Основные: `VALIDATION_ERROR` (400, `details` — поля), `UNAUTHORIZED` (401), `INVALID_CREDENTIALS` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
  `SLOT_TAKEN` (409), `SLOT_UNAVAILABLE` (422, `details.reason`: `IN_PAST|TOO_SOON|BEYOND_HORIZON|OUTSIDE_WORKING_HOURS`),
  `CANCEL_TOO_LATE`, `INVALID_STATE`, `PLAN_LIMIT`, `SLUG_TAKEN`, `PHONE_TAKEN` (409), `BOOKING_DISABLED`/`BUSINESS_BLOCKED` (403),
  `TOO_MANY_BOOKINGS`, `ACCOUNT_LOCKED`, `RATE_LIMITED` (429).
- **Идемпотентность**: `POST /public/bookings` и `POST /businesses/:id/appointments` принимают `Idempotency-Key`. Повтор гостевого запроса возвращает ту же запись и новый токен управления (старый перестаёт работать).
- **Время**: ISO-8601 с часовым поясом (`2026-11-17T11:00:00.000Z` = 16:00 Ташкент). Даты для слотов — `YYYY-MM-DD` в поясе бизнеса.
- **Деньги**: целые сумы (`priceUzs: 100000`). Клиент платит барберу на месте; платёжных эндпоинтов для клиентов нет.
- **Лимиты**: глобально 300 запросов/мин с IP; гостевая запись — 10 / 10 мин с IP и не больше 3 будущих записей на номер в бизнесе; вход — 10 / 10 мин с IP и блокировка аккаунта на 15 мин после 5 неудачных попыток; регистрация — 5 / час с IP.
- **CSRF**: небезопасные методы с чужим `Origin` отклоняются (403).

## Эндпоинты (76)

### Авторизация сотрудников
| Метод | Путь | Описание |
| --- | --- | --- |
| POST | `/auth/register` | `{name, phone, password(≥8)}` → профиль + cookie. Роль PLATFORM_ADMIN так не получить |
| POST | `/auth/login` | `{phone, password}` → профиль + cookie |
| POST | `/auth/password` | `{currentPassword, newPassword}`; завершает сессии на других устройствах |
| POST | `/auth/logout` | Отзыв сессии |
| GET | `/auth/me` | Профиль, членства, `mustChangePassword` |

### Публичные и клиентские (без входа)
| GET | `/public/businesses/:slug` | Страница барбершопа: мастера, услуги, цены (с override мастера), `acceptingBookings` |
| GET | `/public/barbers/:slug` | Персональная ссылка → `{barberId, businessSlug}` |
| GET | `/public/barbers/:barberId/dates?serviceId=` | Даты горизонта, где есть хотя бы один слот |
| GET | `/public/barbers/:barberId/slots?serviceId=&date=` | Свободные слоты `{start, end}` |
| GET | `/public/plans` | Активные тарифы |
| POST | `/public/bookings` | `{barberId, serviceId, startsAt, customerName, phone, note?, consent: true}` → запись + `manageToken` (201) |
| GET | `/public/appointments/:token` | Запись по секретной ссылке |
| GET | `/public/appointments/:token/dates`, `…/slots?date=` | Доступность для переноса (текущая запись исключена) |
| POST | `/public/appointments/:token/reschedule` | `{startsAt}`; не позднее `cancellationMinHours` до визита |
| POST | `/public/appointments/:token/cancel` | `{reason?}` |
| GET | `/invitations/:token` | Предпросмотр приглашения (бизнес, роль) |

### Аккаунт сотрудника (сессия)
| PATCH | `/me` | Имя, язык |
| GET | `/me/export` | Экспорт данных аккаунта (JSON) |
| DELETE | `/me` | Удаление аккаунта (владелец должен сначала передать бизнес) |
| POST | `/invitations/:token/accept` | Принять приглашение (одноразово) |

### Бизнес (сессия + членство; роль указана)
| POST | `/businesses` | Любой пользователь: создать бизнес, стать OWNER, пробный период SOLO |
| GET / PATCH | `/businesses/:businessId` | Любая роль / OWNER, MANAGER |
| PATCH | `/businesses/:businessId/slug` | OWNER |
| GET | `/businesses/:businessId/dashboard` | Цифры из БД; BARBER видит только свои |
| GET | `/businesses/:businessId/subscription` | OWNER, MANAGER |
| GET / POST / PATCH | `/businesses/:businessId/barbers[/:barberId]` | Список — все; создание — OWNER/MANAGER; правка — OWNER/MANAGER или сам барбер (только профиль) |
| POST | `/businesses/:businessId/barbers/:barberId/link-me` | Привязать профиль мастера к себе (соло-барбер) |
| GET / POST / PATCH / DELETE | `/businesses/:businessId/services[/:serviceId]` | Изменение — OWNER/MANAGER; DELETE = скрыть |
| GET / POST / PATCH | `/businesses/:businessId/branches[/:branchId]` | Филиалы |
| GET | `/businesses/:businessId/members` | Команда и приглашения |
| POST / DELETE | `/businesses/:businessId/invitations[/:id]` | Создать ссылку-приглашение (`invitePath` возвращается один раз) / отозвать |
| POST | `/businesses/:businessId/members/:memberId/reset-password` | OWNER: временный пароль сотруднику (не владельцу), смена обязательна |
| PATCH | `/businesses/:businessId/members/:memberId` | Роль/статус (OWNER; последнего владельца понизить нельзя) |
| GET / POST | `/businesses/:businessId/customers` | Поиск `?q=`; BARBER видит только своих клиентов |
| GET / PATCH | `/businesses/:businessId/customers/:customerId` | Карточка, история визитов, заметки |
| GET | `/businesses/:businessId/customers/:customerId/export` | Экспорт данных клиента (OWNER/MANAGER) |
| DELETE | `/businesses/:businessId/customers/:customerId` | Обезличивание (OWNER/MANAGER) |
| GET / PUT | `/businesses/:businessId/barbers/:barberId/working-hours` | `{intervals:[{weekday,startMin,endMin}]}` |
| GET / POST / DELETE | `/businesses/:businessId/barbers/:barberId/exceptions[/:id]` | Выходной/отпуск/блок; ответ содержит `affectedAppointments` |
| GET | `/businesses/:businessId/calendar?from=&to=&barberId=` | Записи, исключения, рабочие часы (≤45 дней) |
| GET | `/businesses/:businessId/barbers/:barberId/slots?serviceId=&date=&excludeAppointmentId=` | Слоты для персонала (без lead time и горизонта) |
| POST | `/businesses/:businessId/appointments` | Ручная запись: `customerId` или `customer{name, phone?}` |
| GET | `/businesses/:businessId/appointments/:id` | Запись + журнал событий + число визитов клиента |
| POST | `…/appointments/:id/reschedule`, `…/cancel`, `…/status` | Перенос, отмена, `{status: COMPLETED|NO_SHOW}` (только после начала) |

### Админ платформы (только PLATFORM_ADMIN)
| GET | `/platform-admin/overview` | Счётчики бизнесов, подписок, ошибок |
| GET | `/platform-admin/businesses?q=` | Бизнесы: владелец, мастера, записи, тариф, пробный период |
| POST | `/platform-admin/businesses/:id/block`, `/unblock` | Блокировка (`{reason}`) скрывает публичную страницу и запрещает запись |
| POST | `/platform-admin/businesses/:id/plan` | Сменить тариф |
| GET / PATCH | `/platform-admin/plans[/:id]` | Тарифы и цены |
| GET | `/platform-admin/payments` | Платежи |
| POST | `/platform-admin/businesses/:id/payments` | Зафиксировать платёж (PENDING) |
| POST | `/platform-admin/payments/:id/confirm`, `/reject` | Подтверждение продлевает период; повторно подтвердить нельзя |
| POST | `/platform-admin/users/:id/reset-password` | Временный пароль владельцу бизнеса |
| GET | `/platform-admin/errors`, `/audit` | Технические ошибки, журнал действий |

### Служебное
| GET | `/health` | Проверка API и БД |
