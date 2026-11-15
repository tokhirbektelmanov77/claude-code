# API

REST, JSON. Полная машинная спецификация: `GET /docs/openapi.json`, интерфейс — `/docs` (Swagger UI).
Из браузера API доступен как `/api/*` того же origin (прокси Next.js).

## Общие правила

- **Аутентификация**: HttpOnly cookie `bf_session` (SameSite=Lax). Получается через `/auth/otp/verify` или `/auth/telegram`.
- **Ошибки**: `{ "statusCode": 409, "code": "SLOT_TAKEN", "message": "…", "details"?: … }`. Коды стабильны, UI переводит их через словарь `errors.*`.
  Основные: `VALIDATION_ERROR` (400, `details` — поля), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
  `SLOT_TAKEN` (409), `SLOT_UNAVAILABLE` (422, `details.reason`: `IN_PAST|TOO_SOON|BEYOND_HORIZON|OUTSIDE_WORKING_HOURS`),
  `CANCEL_TOO_LATE`, `INVALID_STATE`, `PLAN_LIMIT`, `SLUG_TAKEN` (409), `BOOKING_DISABLED`/`BUSINESS_BLOCKED` (403), `RATE_LIMITED` (429), `SMS_UNAVAILABLE` (503).
- **Идемпотентность**: `POST /bookings` и `POST /businesses/:id/appointments` принимают `Idempotency-Key`.
- **Время**: ISO-8601 с часовым поясом (`2026-11-17T11:00:00.000Z` = 16:00 Ташкент). Даты для слотов — `YYYY-MM-DD` в поясе бизнеса.
- **Деньги**: целые сумы (`priceUzs: 100000`).
- **Лимиты**: глобально 300 запросов/мин с IP; OTP — 5 запросов/10 мин с IP и 3 кода/10 мин на номер, 5 попыток ввода на код.
- **CSRF**: небезопасные методы с чужим `Origin` отклоняются (403).

## Эндпоинты (77)

### Авторизация
| Метод | Путь | Описание |
| --- | --- | --- |
| POST | `/auth/otp/request` | `{phone}` → `{sent, expiresInSec, devCode?}`. `devCode` только при `OTP_DEV_MODE` вне production |
| POST | `/auth/otp/verify` | `{phone, code, name?}` → профиль + cookie |
| POST | `/auth/telegram` | `{initData}` (Mini App) → `{me, startParam}` + cookie; подпись проверяется на сервере |
| POST | `/auth/logout` | Отзыв сессии |
| GET | `/auth/me` | Профиль, членства в бизнесах, приглашения |
| GET | `/auth/methods` | Какие способы входа включены (`otpDevMode`, `telegram`) |

### Публичные
| GET | `/public/businesses/:slug` | Страница барбершопа: мастера, услуги, цены (с override мастера), `acceptingBookings` |
| GET | `/public/barbers/:slug` | Персональная ссылка → `{barberId, businessSlug}` |
| GET | `/public/barbers/:barberId/dates?serviceId=` | Даты горизонта, где есть хотя бы один слот |
| GET | `/public/barbers/:barberId/slots?serviceId=&date=` | Свободные слоты `{start, end}` |
| GET | `/public/plans` | Активные тарифы |

### Клиент (нужна сессия)
| POST | `/bookings` | `{barberId, serviceId, startsAt, customerName, note?, consent: true}` → запись (201) |
| GET | `/me/appointments`, `/me/appointments/:id` | Мои записи |
| GET | `/me/appointments/:id/dates`, `…/slots?date=` | Доступность для переноса (текущая запись исключена) |
| POST | `/me/appointments/:id/reschedule` | `{startsAt}`; не позднее `cancellationMinHours` до визита |
| POST | `/me/appointments/:id/cancel` | `{reason?}` |
| PATCH | `/me` | Имя, язык |
| POST | `/me/invitations/:id/accept` | Принять приглашение в команду |
| POST | `/me/telegram/link` | Deep link для привязки Telegram-чата |
| GET | `/me/export` | Экспорт моих данных (JSON) |
| DELETE | `/me` | Удаление аккаунта: будущие записи отменяются, ПДн обезличиваются |

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
| POST / DELETE | `/businesses/:businessId/invitations[/:id]` | Пригласить по телефону / отозвать |
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
| GET | `/platform-admin/errors`, `/audit`, `/notifications` | Технические ошибки, журнал действий, состояние очереди |

### Служебное
| GET | `/health` | Проверка API и БД |
