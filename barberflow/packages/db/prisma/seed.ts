/**
 * Demo seed. Safe to run repeatedly:
 *  - refuses to run with NODE_ENV=production unless SEED_ALLOW_PRODUCTION=true;
 *  - only deletes/recreates businesses flagged is_demo (matched by their demo slugs);
 *  - creates subscription plans only if missing (admin-edited prices are never overwritten);
 *  - demo staff users use reserved fake numbers +99890000000X and the dev-only password below.
 *
 * Guarantees the demo scenario: barber "Азиз", "Мужская стрижка" 45 min / 100 000 UZS,
 * 16:00–16:45 Asia/Tashkent on the demo day (nearest Tuesday at least 2 days ahead) is FREE to book.
 */
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient, AppointmentStatus, Prisma } from '@prisma/client';
import { hashPassword } from '../src/password';
import { DateTime } from 'luxon';
import { computeDaySlots, demoDay, formatDateLong, localTimeToUtc } from '@barberflow/shared';

const prisma = new PrismaClient();
const TZ = 'Asia/Tashkent';
const DEMO_SLUGS = ['barberflow-demo', 'solo-demo'];
const DEMO_BARBER_SLUGS = ['aziz', 'timur', 'shahzod', 'jasur-solo'];

const PHONES = {
  admin: '+998900000001',
  owner: '+998900000002',
  aziz: '+998900000003',
  solo: '+998900000005',
};
const CLIENT_PHONE = '+998900000004'; // demo client: no account (guests book with name + phone)
/** DEVELOPMENT ONLY demo password for every seeded staff account. */
const DEMO_PASSWORD = 'barberflow-demo';

async function upsertUser(phone: string, name: string, extra: Prisma.UserUpdateInput = {}) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return prisma.user.upsert({
    where: { phone },
    update: { name, deletedAt: null, passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, ...extra },
    create: { phone, name, passwordHash, privacyAcceptedAt: new Date(), ...(extra as Prisma.UserCreateInput) },
  });
}

const hm = (h: number, m = 0) => h * 60 + m;

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production (set SEED_ALLOW_PRODUCTION=true to override).');
  }

  // ---- Plans (create-only) ----
  for (const p of [
    { code: 'SOLO', name: 'SOLO', description: '1 мастер', pricing: 'FLAT' as const, priceUzs: 59000, minSeats: 1, maxSeats: 1, trialDays: 14 },
    { code: 'TEAM', name: 'TEAM', description: 'За активного мастера, минимум 3', pricing: 'PER_SEAT' as const, priceUzs: 49000, minSeats: 3, maxSeats: null, trialDays: 14 },
  ]) {
    await prisma.subscriptionPlan.upsert({ where: { code: p.code }, update: {}, create: p });
  }
  const solo = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'SOLO' } });
  const team = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'TEAM' } });

  // ---- Wipe previous demo tenants only ----
  const demo = await prisma.business.findMany({ where: { slug: { in: DEMO_SLUGS } } });
  for (const b of demo) {
    if (!b.isDemo) throw new Error(`Business "${b.slug}" exists but is not a demo business; refusing to touch it.`);
  }
  const demoIds = demo.map((b) => b.id);
  if (demoIds.length) {
    // Appointments restrict barber/service deletion, so remove them first; everything else cascades.
    await prisma.appointment.deleteMany({ where: { businessId: { in: demoIds } } });
    await prisma.customer.deleteMany({ where: { businessId: { in: demoIds } } });
    await prisma.business.deleteMany({ where: { id: { in: demoIds } } });
  }
  const strayBarbers = await prisma.barber.count({ where: { slug: { in: DEMO_BARBER_SLUGS } } });
  if (strayBarbers) throw new Error('Demo barber slugs are used by a non-demo business; refusing to continue.');

  // ---- Users ----
  // Earlier versions had a client account for the demo client; clients no longer have accounts.
  await prisma.user.deleteMany({ where: { phone: CLIENT_PHONE, memberships: { none: {} } } });
  const admin = await upsertUser(PHONES.admin, 'Platform Admin', { platformRole: 'PLATFORM_ADMIN' });
  const owner = await upsertUser(PHONES.owner, 'Demo Owner');
  const azizUser = await upsertUser(PHONES.aziz, 'Азиз');
  const soloOwner = await upsertUser(PHONES.solo, 'Jasur');

  // ---- Business ----
  const business = await prisma.business.create({
    data: {
      slug: 'barberflow-demo',
      name: 'BARBERFLOW DEMO',
      city: 'Ташкент',
      address: 'ул. Демонстрационная, 1',
      phone: '+998900000002',
      description: 'Демонстрационный барбершоп. Все данные вымышлены.',
      latitude: 41.311081,
      longitude: 69.279737,
      timezone: TZ,
      bookingHorizonDays: 30,
      minLeadMinutes: 60,
      slotStepMinutes: 15,
      cancellationMinHours: 2,
      cancellationPolicy: null,
      onboardingStep: 7,
      isDemo: true,
      members: {
        create: [
          { userId: owner.id, role: 'OWNER' },
          { userId: azizUser.id, role: 'BARBER' },
        ],
      },
    },
  });

  const branch = await prisma.branch.create({
    data: { businessId: business.id, name: 'Главный зал', city: 'Ташкент', address: 'ул. Демонстрационная, 1', latitude: 41.311081, longitude: 69.279737 },
  });

  const services = {
    haircut: await prisma.service.create({ data: { businessId: business.id, name: 'Мужская стрижка', nameUz: 'Erkaklar soch turmagi', priceUzs: 100000, durationMin: 45, bufferAfterMin: 0, sortOrder: 1 } }),
    combo: await prisma.service.create({ data: { businessId: business.id, name: 'Стрижка + борода', nameUz: 'Soch turmagi + soqol', priceUzs: 150000, durationMin: 75, bufferAfterMin: 0, sortOrder: 2 } }),
    beard: await prisma.service.create({ data: { businessId: business.id, name: 'Оформление бороды', nameUz: 'Soqolni shakllantirish', priceUzs: 60000, durationMin: 30, bufferAfterMin: 0, sortOrder: 3 } }),
    kids: await prisma.service.create({ data: { businessId: business.id, name: 'Детская стрижка', nameUz: 'Bolalar soch turmagi', priceUzs: 70000, durationMin: 30, bufferAfterMin: 10, sortOrder: 4 } }),
  };

  const aziz = await prisma.barber.create({
    data: {
      businessId: business.id, branchId: branch.id, userId: azizUser.id, slug: 'aziz', name: 'Азиз',
      specialization: 'Классические и современные мужские стрижки', sortOrder: 1,
      services: { create: [services.haircut, services.combo, services.beard].map((s) => ({ serviceId: s.id })) },
    },
  });
  const timur = await prisma.barber.create({
    data: {
      businessId: business.id, branchId: branch.id, slug: 'timur', name: 'Тимур', specialization: 'Борода и fade', sortOrder: 2,
      services: { create: [services.haircut, services.combo, services.beard, services.kids].map((s) => ({ serviceId: s.id })) },
    },
  });
  const shahzod = await prisma.barber.create({
    data: {
      businessId: business.id, branchId: branch.id, slug: 'shahzod', name: 'Шахзод', specialization: 'Детские стрижки', sortOrder: 3,
      services: { create: [services.haircut, services.kids].map((s) => ({ serviceId: s.id })) },
    },
  });

  // Aziz: every day 10:00–20:00 with lunch 13:00–14:00 (so the "Today" screen has data any day).
  await prisma.workingHours.createMany({
    data: [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
      { barberId: aziz.id, weekday, startMin: hm(10), endMin: hm(13) },
      { barberId: aziz.id, weekday, startMin: hm(14), endMin: hm(20) },
    ]),
  });
  await prisma.workingHours.createMany({
    data: [2, 3, 4, 5, 6, 7].map((weekday) => ({ barberId: timur.id, weekday, startMin: hm(11), endMin: hm(21) })),
  });
  await prisma.workingHours.createMany({
    data: [1, 2, 3, 4, 5].map((weekday) => ({ barberId: shahzod.id, weekday, startMin: hm(9), endMin: hm(18) })),
  });

  // Timur: vacation in ~10 days (shows exceptions in the calendar).
  const now = DateTime.now().setZone(TZ);
  await prisma.scheduleException.create({
    data: {
      barberId: timur.id, type: 'VACATION', note: 'Отпуск (демо)',
      startsAt: now.plus({ days: 10 }).startOf('day').toUTC().toJSDate(),
      endsAt: now.plus({ days: 13 }).startOf('day').toUTC().toJSDate(),
    },
  });

  // ---- Customers (fictional) ----
  const names = ['Бекзод', 'Шерзод', 'Отабек', 'Санжар', 'Улугбек', 'Жахонгир', 'Фаррух', 'Дилшод'];
  const customers = [];
  for (let i = 0; i < names.length; i++) {
    customers.push(
      await prisma.customer.create({
        data: { businessId: business.id, name: names[i], phone: `+9989100000${String(10 + i)}`, consentAt: new Date() },
      }),
    );
  }
  const demoClientCustomer = await prisma.customer.create({
    data: { businessId: business.id, name: 'Demo Client', phone: CLIENT_PHONE, consentAt: new Date() },
  });

  // ---- Appointments ----
  let n = 0;
  async function appt(barberId: string, service: typeof services.haircut, startUtc: Date, status: AppointmentStatus, customerId: string, source: 'ONLINE' | 'MANUAL' = 'ONLINE', manageTokenHash: string | null = null) {
    const end = new Date(startUtc.getTime() + service.durationMin * 60_000);
    const a = await prisma.appointment.create({
      data: {
        businessId: business.id, branchId: branch.id, barberId, serviceId: service.id, customerId, startsAt: startUtc, endsAt: end,
        blockedUntil: new Date(end.getTime() + service.bufferAfterMin * 60_000), status, source,
        priceUzs: service.priceUzs, durationMin: service.durationMin, bufferAfterMin: service.bufferAfterMin, serviceName: service.name,
        createdByUserId: source === 'MANUAL' ? owner.id : null,
        manageTokenHash,
        cancelledAt: status === 'CANCELLED' ? new Date() : null,
        completedAt: status === 'COMPLETED' ? end : null,
      },
    });
    await prisma.appointmentEvent.create({ data: { appointmentId: a.id, businessId: business.id, type: 'CREATED', actorUserId: owner.id, data: { source, seed: true } } });
    if (status !== 'CONFIRMED') await prisma.appointmentEvent.create({ data: { appointmentId: a.id, businessId: business.id, type: status, actorUserId: owner.id } });
    n++;
    return a;
  }
  const c = (i: number) => customers[i % customers.length].id;

  // Today for Aziz: statuses depend on whether the time already passed.
  const today = now.toISODate()!;
  const todaySlots: [number, typeof services.haircut][] = [[hm(10), services.haircut], [hm(11), services.combo], [hm(15), services.beard], [hm(17), services.haircut], [hm(18, 30), services.haircut]];
  for (const [i, [min, svc]] of todaySlots.entries()) {
    const start = localTimeToUtc(today, min, TZ);
    const past = start.getTime() + svc.durationMin * 60_000 < Date.now();
    await appt(aziz.id, svc, start, past ? (i === 1 ? 'NO_SHOW' : 'COMPLETED') : 'CONFIRMED', c(i), i % 2 ? 'MANUAL' : 'ONLINE');
  }

  // Past 6 days: a realistic mix for the dashboard.
  for (let d = 1; d <= 6; d++) {
    const date = now.minus({ days: d }).toISODate()!;
    const plan: [string, number, typeof services.haircut, AppointmentStatus][] = [
      [aziz.id, hm(10, 30), services.haircut, 'COMPLETED'],
      [aziz.id, hm(15), services.combo, d % 3 === 0 ? 'CANCELLED' : 'COMPLETED'],
      [timur.id, hm(12), services.beard, d % 4 === 0 ? 'NO_SHOW' : 'COMPLETED'],
    ];
    const weekday = DateTime.fromISO(date, { zone: TZ }).weekday;
    if (weekday <= 5) plan.push([shahzod.id, hm(10), services.kids, 'COMPLETED']);
    for (const [i, [barberId, min, svc, status]] of plan.entries()) {
      if (barberId === timur.id && weekday === 1) continue; // Timur is off on Mondays
      await appt(barberId, svc, localTimeToUtc(date, min, TZ), status, c(d + i));
    }
  }

  // Demo scenario day (moves forward with time) — Aziz busy 11:00–12:15 and 14:00–14:45, 16:00 stays FREE.
  const DEMO_DAY = demoDay(new Date(), TZ);
  await appt(aziz.id, services.combo, localTimeToUtc(DEMO_DAY, hm(11), TZ), 'CONFIRMED', c(3));
  await appt(aziz.id, services.haircut, localTimeToUtc(DEMO_DAY, hm(14), TZ), 'CONFIRMED', c(4), 'MANUAL');
  // Future booking for the demo client (visible in "Мои записи").
  const clientDay = now.plus({ days: 3 }).toISODate()!;
  // Its secret manage link is printed below (in real life the client receives it right after booking).
  const demoManageToken = randomBytes(32).toString('base64url');
  await appt(timur.id, services.beard, localTimeToUtc(clientDay, hm(12), TZ), 'CONFIRMED', demoClientCustomer.id, 'ONLINE',
    createHash('sha256').update(demoManageToken).digest('hex'));
  // A past completed visit so "Записаться снова" can be demonstrated.
  await appt(aziz.id, services.haircut, localTimeToUtc(now.minus({ days: 8 }).toISODate()!, hm(16), TZ), 'COMPLETED', demoClientCustomer.id);

  // ---- Subscription: TEAM, active via a recorded & confirmed manual payment (demo) ----
  const periodStart = now.minus({ days: 5 }).toUTC().toJSDate();
  const sub = await prisma.subscription.create({
    data: {
      businessId: business.id, planId: team.id, status: 'ACTIVE', seats: 3,
      currentPeriodStart: periodStart, currentPeriodEnd: DateTime.fromJSDate(periodStart).plus({ months: 1 }).toJSDate(),
    },
  });
  await prisma.payment.create({
    data: {
      businessId: business.id, subscriptionId: sub.id, amountUzs: 147000, periodMonths: 1, method: 'BANK_TRANSFER', status: 'CONFIRMED',
      reference: 'DEMO-0001', note: 'Демо-данные: платёж не настоящий', createdByUserId: admin.id, confirmedByUserId: admin.id, confirmedAt: periodStart,
    },
  });

  // ---- Second demo tenant: solo barber on trial with a pending payment (admin panel demo) ----
  const soloBiz = await prisma.business.create({
    data: {
      slug: 'solo-demo', name: 'Jasur Barber (demo)', city: 'Самарканд', address: 'ул. Демонстрационная, 7', onboardingStep: 7, isDemo: true,
      members: { create: { userId: soloOwner.id, role: 'OWNER' } },
    },
  });
  const soloService = await prisma.service.create({ data: { businessId: soloBiz.id, name: 'Мужская стрижка', nameUz: 'Erkaklar soch turmagi', priceUzs: 80000, durationMin: 40 } });
  const jasur = await prisma.barber.create({
    data: { businessId: soloBiz.id, userId: soloOwner.id, slug: 'jasur-solo', name: 'Jasur', services: { create: { serviceId: soloService.id } } },
  });
  await prisma.workingHours.createMany({ data: [1, 2, 3, 4, 5, 6].map((weekday) => ({ barberId: jasur.id, weekday, startMin: hm(9), endMin: hm(19) })) });
  const soloSub = await prisma.subscription.create({
    data: { businessId: soloBiz.id, planId: solo.id, status: 'TRIALING', seats: 1, trialEndsAt: now.plus({ days: 9 }).toUTC().toJSDate() },
  });
  await prisma.payment.create({
    data: { businessId: soloBiz.id, subscriptionId: soloSub.id, amountUzs: 59000, periodMonths: 1, method: 'BANK_TRANSFER', status: 'PENDING', reference: 'DEMO-0002', note: 'Демо: ожидает подтверждения', createdByUserId: admin.id },
  });

  await prisma.auditLog.create({ data: { actorUserId: admin.id, action: 'seed.demo', data: { appointments: n } } });

  // ---- Verify the demo scenario is bookable ----
  const azizHours = await prisma.workingHours.findMany({ where: { barberId: aziz.id } });
  const busy = await prisma.appointment.findMany({ where: { barberId: aziz.id, status: { in: ['CONFIRMED', 'COMPLETED'] } } });
  const slots = computeDaySlots(DEMO_DAY, { durationMin: 45, bufferAfterMin: 0 }, {
    timezone: TZ, slotStepMinutes: 15, minLeadMinutes: 60, bookingHorizonDays: 30, now: new Date(),
    workingHours: azizHours.map((h) => ({ weekday: h.weekday, startMin: h.startMin, endMin: h.endMin })),
    busy: busy.map((b) => ({ start: b.startsAt, end: b.blockedUntil })),
  });
  const target = localTimeToUtc(DEMO_DAY, hm(16), TZ).getTime();
  const free = slots.some((s) => s.start.getTime() === target);

  console.log('');
  console.log('BARBERFLOW demo data ready');
  console.log(`  Business:      BARBERFLOW DEMO  →  /s/barberflow-demo   (barber link: /b/aziz)`);
  console.log(`  Appointments:  ${n}`);
  console.log(`  Demo slot ${formatDateLong(DEMO_DAY, 'ru', TZ)} (${DEMO_DAY}) 16:00–16:45 (Азиз, Мужская стрижка, 100 000 UZS): ${free ? 'FREE ✓' : 'NOT AVAILABLE'}`);
  console.log(`  Open: /b/aziz → Мужская стрижка → ${DEMO_DAY} → 16:00`);
  console.log(`  Staff logins (password for all: ${DEMO_PASSWORD} — development only):`);
  console.log(`    Platform admin  ${PHONES.admin}`);
  console.log(`    Owner           ${PHONES.owner}`);
  console.log(`    Barber Азиз     ${PHONES.aziz}`);
  console.log(`    Solo owner      ${PHONES.solo}`);
  console.log(`  Demo client booking (guest, no account): /a/${demoManageToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
