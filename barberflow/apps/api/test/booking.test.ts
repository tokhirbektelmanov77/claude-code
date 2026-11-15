import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { at, Fixture, futureTuesday, guestBody, login, makeBusiness, nextPhone, prisma, resetDb, startApp } from './helpers';

let app: INestApplication;
let f: Fixture;
let day: string;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  const owner = await login(app);
  f = await makeBusiness(owner.me.id);
  day = futureTuesday();
});

const haircut = () => ({ barberId: f.barberId, serviceId: f.haircutId });
const book = (startsAt: string, svc = haircut(), phone = nextPhone()) => http().post('/public/bookings').send(guestBody(svc, startsAt, phone));
const localTimes = (slots: { start: string }[]) =>
  slots.map((s) => new Date(new Date(s.start).getTime() + 5 * 3600_000).toISOString().slice(11, 16));

describe('guest booking engine (integration, real Postgres)', () => {
  it('books 16:00–16:45 for 100 000 UZS with name + phone only and returns a manage token once', async () => {
    const res = await book(at(day, 16)).expect(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.priceUzs).toBe(100000);
    expect(res.body.endsAt).toBe(at(day, 16, 45));
    expect(res.body.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: res.body.id }, include: { customer: true } });
    expect(row.manageTokenHash).not.toContain(res.body.manageToken); // only the hash is stored
    expect(row.customer.userId).toBeNull();
    expect(row.customer.consentAt).not.toBeNull();

    const slots = await http().get(`/public/barbers/${f.barberId}/slots`).query({ serviceId: f.haircutId, date: day }).expect(200);
    const times = localTimes(slots.body.slots);
    expect(times).not.toContain('16:00');
    expect(times).not.toContain('15:30');
    expect(times).toContain('15:15');
    expect(times).toContain('16:45');
  });

  it('requires a valid Uzbek phone and consent', async () => {
    const bad = await http().post('/public/bookings').send({ ...guestBody(haircut(), at(day, 16)), phone: '12345' }).expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
    await http().post('/public/bookings').send({ ...guestBody(haircut(), at(day, 16)), consent: false }).expect(400);
  });

  it('the same phone books again into the same client card (history), latest name wins', async () => {
    const phone = nextPhone();
    await http().post('/public/bookings').send(guestBody(haircut(), at(day, 10), phone, 'Азамат')).expect(201);
    await http().post('/public/bookings').send(guestBody(haircut(), at(day, 12), phone, 'Азамат Р.')).expect(201);
    const customers = await prisma.customer.findMany({ where: { phone } });
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe('Азамат Р.');
  });

  it('limits one phone to 3 active future bookings per business (spam guard)', async () => {
    const phone = nextPhone();
    for (const h of [10, 11, 12]) await book(at(day, h), haircut(), phone).expect(201);
    const r = await book(at(day, 15), haircut(), phone).expect(429);
    expect(r.body.code).toBe('TOO_MANY_BOOKINGS');
    await book(at(day, 15)).expect(201); // another phone is fine
  });

  it('two simultaneous clients for the same time: exactly one wins', async () => {
    const results = await Promise.all([book(at(day, 16)), book(at(day, 16))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe('SLOT_TAKEN');
    expect(await prisma.appointment.count({ where: { barberId: f.barberId, status: 'CONFIRMED' } })).toBe(1);
  });

  it('ten parallel requests on overlapping intervals create no overlap', async () => {
    const times = [at(day, 16), at(day, 16, 15), at(day, 16, 30), at(day, 15, 30), at(day, 16, 45)];
    await Promise.all(times.flatMap((t, i) => [book(t), book(times[(i + 1) % 5])]));
    const rows = await prisma.appointment.findMany({ where: { barberId: f.barberId, status: 'CONFIRMED' }, orderBy: { startsAt: 'asc' } });
    for (let i = 1; i < rows.length; i++) expect(rows[i].startsAt.getTime()).toBeGreaterThanOrEqual(rows[i - 1].blockedUntil.getTime());
  });

  it('the database itself rejects overlapping rows (exclusion constraint)', async () => {
    const first = await book(at(day, 16)).expect(201);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: first.body.id } });
    await expect(
      prisma.appointment.create({
        data: {
          ...row, id: undefined, idempotencyKey: null, manageTokenHash: null, startsAt: new Date(at(day, 16, 30)),
          endsAt: new Date(at(day, 17, 15)), blockedUntil: new Date(at(day, 17, 15)), createdAt: undefined, updatedAt: undefined,
        },
      }),
    ).rejects.toThrow(/appointment_no_overlap|23P01|exclusion/i);
  });

  it('rejects intersecting different services (75 min combo over a 45 min haircut)', async () => {
    await book(at(day, 16)).expect(201);
    const r = await book(at(day, 15, 15), { barberId: f.barberId, serviceId: f.comboId }).expect(409);
    expect(r.body.code).toBe('SLOT_TAKEN');
    await book(at(day, 16), { barberId: f.barber2Id, serviceId: f.haircutId }).expect(201);
  });

  it('cancelling via the manage link frees the interval for someone else', async () => {
    const booked = await book(at(day, 16)).expect(201);
    await book(at(day, 16)).expect(409);
    await http().post(`/public/appointments/${booked.body.manageToken}/cancel`).send({ reason: 'plans changed' }).expect(200);
    await book(at(day, 16)).expect(201);
    const events = await prisma.appointmentEvent.findMany({ where: { appointmentId: booked.body.id } });
    expect(events.map((e) => e.type).sort()).toEqual(['CANCELLED', 'CREATED']);
  });

  it('rescheduling via the manage link moves the booking and releases the old time', async () => {
    const booked = await book(at(day, 16)).expect(201);
    await book(at(day, 18)).expect(201);
    const token = booked.body.manageToken;
    const view = await http().get(`/public/appointments/${token}`).expect(200);
    expect(view.body.id).toBe(booked.body.id);
    await http().post(`/public/appointments/${token}/reschedule`).send({ startsAt: at(day, 18, 15) }).expect(409);
    const moved = await http().post(`/public/appointments/${token}/reschedule`).send({ startsAt: at(day, 17) }).expect(200);
    expect(moved.body.id).toBe(booked.body.id);
    expect(moved.body.endsAt).toBe(at(day, 17, 45));
    await book(at(day, 16)).expect(201);
    await http().post(`/public/appointments/${token}/reschedule`).send({ startsAt: at(day, 17, 15) }).expect(200);
  });

  it('manage links cannot be guessed: wrong or malformed tokens get 404', async () => {
    await book(at(day, 16)).expect(201);
    await http().get('/public/appointments/not-a-token').expect(404);
    await http().get(`/public/appointments/${'A'.repeat(43)}`).expect(404);
    await http().post(`/public/appointments/${'A'.repeat(43)}/cancel`).send({}).expect(404);
  });

  it('refuses non-working days and times outside hours', async () => {
    const sunday = new Date(day + 'T00:00:00Z');
    sunday.setUTCDate(sunday.getUTCDate() + 5);
    const sun = sunday.toISOString().slice(0, 10);
    const r = await book(at(sun, 12)).expect(422);
    expect(r.body.code).toBe('SLOT_UNAVAILABLE');
    expect(r.body.details.reason).toBe('OUTSIDE_WORKING_HOURS');
    const slots = await http().get(`/public/barbers/${f.barberId}/slots`).query({ serviceId: f.haircutId, date: sun }).expect(200);
    expect(slots.body.slots).toEqual([]);
    await book(at(day, 19, 30)).expect(422);
  });

  it('honours schedule exceptions (vacation / blocked time)', async () => {
    await prisma.scheduleException.create({ data: { barberId: f.barberId, type: 'BLOCK', startsAt: new Date(at(day, 15)), endsAt: new Date(at(day, 17)) } });
    await book(at(day, 16)).expect(409);
    await book(at(day, 17)).expect(201);
  });

  it('service duration change affects new slots but not existing bookings', async () => {
    const booked = await book(at(day, 10)).expect(201);
    await prisma.service.update({ where: { id: f.haircutId }, data: { durationMin: 60, priceUzs: 120000 } });
    const existing = await prisma.appointment.findUniqueOrThrow({ where: { id: booked.body.id } });
    expect(existing.durationMin).toBe(45);
    expect(existing.priceUzs).toBe(100000);
    const slots = await http().get(`/public/barbers/${f.barberId}/slots`).query({ serviceId: f.haircutId, date: day }).expect(200);
    const times = localTimes(slots.body.slots);
    expect(times.at(-1)).toBe('19:00');
    expect(times).toContain('10:45');
    const second = await book(at(day, 10, 45)).expect(201);
    expect(second.body.endsAt).toBe(at(day, 11, 45));
    expect(second.body.priceUzs).toBe(120000);
  });

  it('technical break blocks the time after the service', async () => {
    const buffered = { barberId: f.barberId, serviceId: f.bufferedId };
    await book(at(day, 16), buffered).expect(201); // 16:00–16:30 + 15 min
    await book(at(day, 16, 30)).expect(409);
    await book(at(day, 16, 45)).expect(201);
    await book(at(day, 17, 45), buffered).expect(201);
    await book(at(day, 17, 15), buffered).expect(409);
  });

  it('a repeated request with the same Idempotency-Key returns the same booking (and a fresh manage link)', async () => {
    const phone = nextPhone();
    const send = () => http().post('/public/bookings').set('Idempotency-Key', 'retry-123').send(guestBody(haircut(), at(day, 16), phone));
    const [r1, r2] = await Promise.all([send(), send()]);
    const r3 = await send();
    expect([r1.status, r2.status, r3.status].every((s) => s === 201)).toBe(true);
    expect(new Set([r1.body.id, r2.body.id, r3.body.id]).size).toBe(1);
    expect(r3.body.replayed).toBe(true);
    expect(await prisma.appointment.count()).toBe(1);
    // The latest issued link works; the replaced one no longer does.
    await http().get(`/public/appointments/${r3.body.manageToken}`).expect(200);
    await http().get(`/public/appointments/${r1.body.manageToken}`).expect(404);
    await http().get(`/public/appointments/${r2.body.manageToken}`).expect(404);
    // Same key from a different phone is a different request.
    await http().post('/public/bookings').set('Idempotency-Key', 'retry-123').send(guestBody(haircut(), at(day, 18))).expect(201);
  });

  it('enforces lead time and horizon for clients', async () => {
    const far = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
    const r = await book(at(far, 12)).expect(422);
    expect(['BEYOND_HORIZON', 'OUTSIDE_WORKING_HOURS']).toContain(r.body.details.reason);
    const soon = new Date(Date.now() + 10 * 60_000);
    soon.setUTCSeconds(0, 0);
    const r2 = await book(soon.toISOString()).expect(422);
    expect(['TOO_SOON', 'OUTSIDE_WORKING_HOURS']).toContain(r2.body.details.reason);
  });

  it('cannot change a visit closer than cancellationMinHours', async () => {
    await prisma.business.update({ where: { id: f.businessId }, data: { cancellationMinHours: 24 * 30 } });
    const booked = await book(at(day, 16)).expect(201);
    const r = await http().post(`/public/appointments/${booked.body.manageToken}/cancel`).send({}).expect(409);
    expect(r.body.code).toBe('CANCEL_TOO_LATE');
  });
});
