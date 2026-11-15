import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { at, Fixture, futureTuesday, login, makeBusiness, prisma, resetDb, startApp } from './helpers';

let app: INestApplication;
let f: Fixture;
let day: string;

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

const body = (startsAt: string, serviceId = () => f.haircutId, barberId = () => f.barberId) => ({
  barberId: barberId(), serviceId: serviceId(), startsAt, customerName: 'Клиент', consent: true,
});

const localTimes = (slots: { start: string }[]) =>
  slots.map((s) => new Date(new Date(s.start).getTime() + 5 * 3600_000).toISOString().slice(11, 16));

describe('booking engine (integration, real Postgres)', () => {
  it('books 16:00–16:45 for 100 000 UZS and removes overlapping slots', async () => {
    const { agent } = await login(app);
    const res = await agent.post('/bookings').send(body(at(day, 16))).expect(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.priceUzs).toBe(100000);
    expect(res.body.endsAt).toBe(at(day, 16, 45));

    const slots = await agent.get(`/public/barbers/${f.barberId}/slots`).query({ serviceId: f.haircutId, date: day }).expect(200);
    const times = localTimes(slots.body.slots);
    expect(times).not.toContain('16:00');
    expect(times).not.toContain('15:30');
    expect(times).toContain('15:15');
    expect(times).toContain('16:45');
  });

  it('two simultaneous clients for the same time: exactly one wins', async () => {
    const a = await login(app);
    const b = await login(app);
    const results = await Promise.all([
      a.agent.post('/bookings').send(body(at(day, 16))),
      b.agent.post('/bookings').send(body(at(day, 16))),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe('SLOT_TAKEN');
    expect(await prisma.appointment.count({ where: { barberId: f.barberId, status: 'CONFIRMED' } })).toBe(1);
  });

  it('ten parallel requests on overlapping intervals create no overlap', async () => {
    const clients = await Promise.all(Array.from({ length: 5 }, () => login(app)));
    const times = [at(day, 16), at(day, 16, 15), at(day, 16, 30), at(day, 15, 30), at(day, 16, 45)];
    await Promise.all(clients.flatMap((c, i) => [c.agent.post('/bookings').send(body(times[i])), c.agent.post('/bookings').send(body(times[(i + 1) % 5]))]));
    const rows = await prisma.appointment.findMany({ where: { barberId: f.barberId, status: 'CONFIRMED' }, orderBy: { startsAt: 'asc' } });
    for (let i = 1; i < rows.length; i++) expect(rows[i].startsAt.getTime()).toBeGreaterThanOrEqual(rows[i - 1].blockedUntil.getTime());
  });

  it('the database itself rejects overlapping rows (exclusion constraint)', async () => {
    const { agent } = await login(app);
    const first = await agent.post('/bookings').send(body(at(day, 16))).expect(201);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: first.body.id } });
    await expect(
      prisma.appointment.create({
        data: { ...row, id: undefined, idempotencyKey: null, startsAt: new Date(at(day, 16, 30)), endsAt: new Date(at(day, 17, 15)), blockedUntil: new Date(at(day, 17, 15)), createdAt: undefined, updatedAt: undefined },
      }),
    ).rejects.toThrow(/appointment_no_overlap|23P01|exclusion/i);
  });

  it('rejects intersecting different services (75 min combo over a 45 min haircut)', async () => {
    const { agent } = await login(app);
    await agent.post('/bookings').send(body(at(day, 16))).expect(201);
    const r = await agent.post('/bookings').send(body(at(day, 15, 15), () => f.comboId)).expect(409);
    expect(r.body.code).toBe('SLOT_TAKEN');
    // Different barber at the same time is fine.
    await agent.post('/bookings').send(body(at(day, 16), () => f.haircutId, () => f.barber2Id)).expect(201);
  });

  it('cancelling frees the interval for someone else', async () => {
    const a = await login(app);
    const b = await login(app);
    const booked = await a.agent.post('/bookings').send(body(at(day, 16))).expect(201);
    await b.agent.post('/bookings').send(body(at(day, 16))).expect(409);
    await a.agent.post(`/me/appointments/${booked.body.id}/cancel`).send({ reason: 'plans changed' }).expect(200);
    await b.agent.post('/bookings').send(body(at(day, 16))).expect(201);
    const events = await prisma.appointmentEvent.findMany({ where: { appointmentId: booked.body.id } });
    expect(events.map((e) => e.type).sort()).toEqual(['CANCELLED', 'CREATED']);
  });

  it('rescheduling moves the booking and releases the old time', async () => {
    const a = await login(app);
    const b = await login(app);
    const booked = await a.agent.post('/bookings').send(body(at(day, 16))).expect(201);
    await b.agent.post('/bookings').send(body(at(day, 18))).expect(201);
    // Cannot move onto someone else's time.
    await a.agent.post(`/me/appointments/${booked.body.id}/reschedule`).send({ startsAt: at(day, 18, 15) }).expect(409);
    const moved = await a.agent.post(`/me/appointments/${booked.body.id}/reschedule`).send({ startsAt: at(day, 17) }).expect(200);
    expect(moved.body.id).toBe(booked.body.id);
    expect(moved.body.endsAt).toBe(at(day, 17, 45));
    await b.agent.post('/bookings').send(body(at(day, 16))).expect(201);
    // Moving into its own current interval works (exclude self).
    await a.agent.post(`/me/appointments/${booked.body.id}/reschedule`).send({ startsAt: at(day, 17, 15) }).expect(200);
  });

  it('refuses non-working days and times outside hours', async () => {
    const { agent } = await login(app);
    const sunday = new Date(day + 'T00:00:00Z');
    sunday.setUTCDate(sunday.getUTCDate() + 5);
    const sun = sunday.toISOString().slice(0, 10);
    const r = await agent.post('/bookings').send(body(at(sun, 12))).expect(422);
    expect(r.body.code).toBe('SLOT_UNAVAILABLE');
    expect(r.body.details.reason).toBe('OUTSIDE_WORKING_HOURS');
    const slots = await agent.get(`/public/barbers/${f.barberId}/slots`).query({ serviceId: f.haircutId, date: sun }).expect(200);
    expect(slots.body.slots).toEqual([]);
    await agent.post('/bookings').send(body(at(day, 19, 30))).expect(422); // would end 20:15
  });

  it('honours schedule exceptions (vacation / blocked time)', async () => {
    const { agent } = await login(app);
    await prisma.scheduleException.create({ data: { barberId: f.barberId, type: 'BLOCK', startsAt: new Date(at(day, 15)), endsAt: new Date(at(day, 17)) } });
    await agent.post('/bookings').send(body(at(day, 16))).expect(409);
    await agent.post('/bookings').send(body(at(day, 17))).expect(201);
  });

  it('service duration change affects new slots but not existing bookings', async () => {
    const { agent } = await login(app);
    const booked = await agent.post('/bookings').send(body(at(day, 10))).expect(201);
    await prisma.service.update({ where: { id: f.haircutId }, data: { durationMin: 60, priceUzs: 120000 } });
    const existing = await prisma.appointment.findUniqueOrThrow({ where: { id: booked.body.id } });
    expect(existing.durationMin).toBe(45);
    expect(existing.priceUzs).toBe(100000);
    const slots = await agent.get(`/public/barbers/${f.barberId}/slots`).query({ serviceId: f.haircutId, date: day }).expect(200);
    const times = localTimes(slots.body.slots);
    expect(times.at(-1)).toBe('19:00');
    expect(times).toContain('10:45');
    const second = await agent.post('/bookings').send(body(at(day, 10, 45))).expect(201);
    expect(second.body.endsAt).toBe(at(day, 11, 45));
    expect(second.body.priceUzs).toBe(120000);
  });

  it('technical break blocks the time after the service', async () => {
    const { agent } = await login(app);
    await agent.post('/bookings').send(body(at(day, 16), () => f.bufferedId)).expect(201); // 16:00–16:30 + 15 min
    await agent.post('/bookings').send(body(at(day, 16, 30))).expect(409);
    await agent.post('/bookings').send(body(at(day, 16, 45))).expect(201);
    // And a booking may not run into the next one's start minus own buffer.
    await agent.post('/bookings').send(body(at(day, 17, 45), () => f.bufferedId)).expect(201);
    await agent.post('/bookings').send(body(at(day, 17, 15), () => f.bufferedId)).expect(409); // 17:15–17:45 +15 hits 17:45
  });

  it('a repeated request with the same Idempotency-Key returns the same booking', async () => {
    const { agent } = await login(app);
    const send = () => agent.post('/bookings').set('Idempotency-Key', 'retry-123').send(body(at(day, 16)));
    const [r1, r2] = await Promise.all([send(), send()]);
    const r3 = await send();
    expect([r1.status, r2.status, r3.status].every((s) => s === 201)).toBe(true);
    expect(new Set([r1.body.id, r2.body.id, r3.body.id]).size).toBe(1);
    expect(r3.body.replayed).toBe(true);
    expect(await prisma.appointment.count()).toBe(1);
  });

  it('enforces lead time and horizon for clients', async () => {
    const { agent } = await login(app);
    const far = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
    const r = await agent.post('/bookings').send(body(at(far, 12))).expect(422);
    expect(['BEYOND_HORIZON', 'OUTSIDE_WORKING_HOURS']).toContain(r.body.details.reason);
    const soon = new Date(Date.now() + 10 * 60_000);
    soon.setUTCSeconds(0, 0);
    const r2 = await agent.post('/bookings').send(body(soon.toISOString())).expect(422);
    expect(['TOO_SOON', 'OUTSIDE_WORKING_HOURS']).toContain(r2.body.details.reason);
  });

  it('queues notifications only through the job table and never marks them sent', async () => {
    const { agent } = await login(app);
    await agent.post('/bookings').send(body(at(day, 16))).expect(201);
    const jobs = await prisma.notificationJob.findMany();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.status === 'PENDING')).toBe(true);
    expect(jobs.map((j) => j.type)).toEqual(expect.arrayContaining(['APPOINTMENT_CREATED', 'REMINDER_24H', 'REMINDER_2H']));
  });
});
