import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signTelegramInitData, verifyTelegramInitData } from '../src/auth/telegram-init-data';
import { at, futureTuesday, login, makeBusiness, nextPhone, prisma, resetDb, startApp } from './helpers';

let app: INestApplication;
beforeAll(async () => { app = await startApp(); });
afterAll(async () => { await app.close(); await prisma.$disconnect(); });
beforeEach(async () => { await resetDb(); });

describe('onboarding: owner registers a business and starts taking bookings', () => {
  it('runs steps 1–7 through the public API', async () => {
    const owner = await login(app, nextPhone(), 'Азиз');
    const biz = await owner.agent.post('/businesses').send({ name: 'Aziz Barber' }).expect(201);
    const id = biz.body.id;
    expect(biz.body.slug).toBe('aziz-barber');
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: id }, include: { plan: true } });
    expect(sub.status).toBe('TRIALING'); // never ACTIVE without a confirmed payment
    expect(sub.plan.code).toBe('SOLO');

    await owner.agent.patch(`/businesses/${id}`).send({ city: 'Ташкент', address: 'ул. Навои, 10', onboardingStep: 4 }).expect(200);
    const barber = await owner.agent.post(`/businesses/${id}/barbers`).send({ name: 'Азиз' }).expect(201);
    expect(barber.body.slug).toBe('aziz');
    await owner.agent.post(`/businesses/${id}/barbers/${barber.body.id}/link-me`).expect(201);

    const service = await owner.agent.post(`/businesses/${id}/services`).send({ name: 'Мужская стрижка', priceUzs: 100000, durationMin: 45 }).expect(201);
    expect(service.body.priceUzs).toBe(100000);
    const hours = await owner.agent
      .put(`/businesses/${id}/barbers/${barber.body.id}/working-hours`)
      .send({ intervals: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 600, endMin: 1200 })) })
      .expect(200);
    expect(hours.body).toHaveLength(6);
    await owner.agent.patch(`/businesses/${id}`).send({ onboardingStep: 7 }).expect(200);

    // SOLO allows a single active barber.
    const second = await owner.agent.post(`/businesses/${id}/barbers`).send({ name: 'Второй' }).expect(409);
    expect(second.body.code).toBe('PLAN_LIMIT');

    // Public page and booking work immediately.
    const pub = await request(app.getHttpServer()).get('/public/businesses/aziz-barber').expect(200);
    expect(pub.body.acceptingBookings).toBe(true);
    expect(pub.body.barbers[0].serviceIds).toEqual([service.body.id]);
    const client = await login(app);
    const day = futureTuesday();
    await client.agent.post('/bookings').send({ barberId: barber.body.id, serviceId: service.body.id, startsAt: at(day, 16), customerName: 'Клиент', consent: true }).expect(201);

    // Owner sees it via manual-booking-capable calendar.
    const cal = await owner.agent.get(`/businesses/${id}/calendar`).query({ from: at(day, 0), to: at(day, 23, 59) }).expect(200);
    expect(cal.body.appointments).toHaveLength(1);
  });

  it('validates input', async () => {
    const owner = await login(app);
    const r = await owner.agent.post('/businesses').send({ name: '' }).expect(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    const biz = await owner.agent.post('/businesses').send({ name: 'Shop' }).expect(201);
    await owner.agent.post(`/businesses/${biz.body.id}/services`).send({ name: 'X', priceUzs: -5, durationMin: 45 }).expect(400);
    await owner.agent
      .put(`/businesses/${biz.body.id}/barbers/00000000-0000-0000-0000-000000000000/working-hours`)
      .send({ intervals: [{ weekday: 1, startMin: 600, endMin: 700 }, { weekday: 1, startMin: 650, endMin: 800 }] })
      .expect(400);
  });
});

describe('tenant isolation and RBAC', () => {
  it("owner of A cannot read or modify business B, by any route", async () => {
    const a = await login(app);
    const b = await login(app);
    const fa = await makeBusiness(a.me.id);
    const fb = await makeBusiness(b.me.id);
    await a.agent.get(`/businesses/${fa.businessId}`).expect(200);
    for (const path of [
      `/businesses/${fb.businessId}`,
      `/businesses/${fb.businessId}/barbers`,
      `/businesses/${fb.businessId}/customers`,
      `/businesses/${fb.businessId}/dashboard`,
      `/businesses/${fb.businessId}/members`,
      `/businesses/${fb.businessId}/subscription`,
    ]) {
      const r = await a.agent.get(path);
      expect(r.status, path).toBe(403);
    }
    await a.agent.post(`/businesses/${fb.businessId}/services`).send({ name: 'Hack', priceUzs: 1, durationMin: 10 }).expect(403);
    // Cross-tenant IDs through my own business are not found either.
    await a.agent.patch(`/businesses/${fa.businessId}/services/${fb.haircutId}`).send({ priceUzs: 1 }).expect(404);
    const day = futureTuesday();
    const r = await a.agent.post(`/businesses/${fa.businessId}/appointments`).send({ barberId: fb.barberId, serviceId: fb.haircutId, startsAt: at(day, 12), customer: { name: 'X' } });
    expect(r.status).toBe(404);
    // Non-UUID / random ids get the same answer as foreign ones.
    await a.agent.get('/businesses/not-a-uuid').expect(404);
    expect((await prisma.service.findUniqueOrThrow({ where: { id: fb.haircutId } })).priceUzs).toBe(100000);
  });

  it('anonymous users get 401 on private routes', async () => {
    const http = request(app.getHttpServer());
    await http.get('/auth/me').expect(401);
    await http.get('/me/appointments').expect(401);
    await http.get('/platform-admin/businesses').expect(401);
  });

  it('a barber only sees and changes their own schedule and appointments', async () => {
    const owner = await login(app);
    const f = await makeBusiness(owner.me.id);
    const barberUser = await login(app);
    await prisma.businessMember.create({ data: { businessId: f.businessId, userId: barberUser.me.id, role: 'BARBER' } });
    await prisma.barber.update({ where: { id: f.barberId }, data: { userId: barberUser.me.id } });
    const day = futureTuesday();

    await barberUser.agent.post(`/businesses/${f.businessId}/appointments`).send({ barberId: f.barberId, serviceId: f.haircutId, startsAt: at(day, 12), customer: { name: 'Гость' } }).expect(201);
    await barberUser.agent.post(`/businesses/${f.businessId}/appointments`).send({ barberId: f.barber2Id, serviceId: f.haircutId, startsAt: at(day, 12), customer: { name: 'Гость' } }).expect(403);
    await barberUser.agent.put(`/businesses/${f.businessId}/barbers/${f.barber2Id}/working-hours`).send({ intervals: [] }).expect(403);
    await barberUser.agent.post(`/businesses/${f.businessId}/services`).send({ name: 'X', priceUzs: 1, durationMin: 10 }).expect(403);
    await barberUser.agent.get(`/businesses/${f.businessId}/members`).expect(403);
    const cal = await barberUser.agent.get(`/businesses/${f.businessId}/calendar`).query({ from: at(day, 0), to: at(day, 23) }).expect(200);
    expect(cal.body.barbers.map((b: { id: string }) => b.id)).toEqual([f.barberId]);
  });

  it('manual booking, completion and no-show by staff share the same engine', async () => {
    const owner = await login(app);
    const f = await makeBusiness(owner.me.id);
    const day = futureTuesday();
    const manual = await owner.agent.post(`/businesses/${f.businessId}/appointments`).send({ barberId: f.barberId, serviceId: f.haircutId, startsAt: at(day, 16), customer: { name: 'Walk-in', phone: '+998 90 555 44 33' } }).expect(201);
    expect(manual.body.source).toBe('MANUAL');
    const client = await login(app);
    const r = await client.agent.post('/bookings').send({ barberId: f.barberId, serviceId: f.haircutId, startsAt: at(day, 16, 30), customerName: 'Клиент', consent: true }).expect(409);
    expect(r.body.code).toBe('SLOT_TAKEN');
    // Future visit can't be completed yet.
    await owner.agent.post(`/businesses/${f.businessId}/appointments/${manual.body.id}/status`).send({ status: 'COMPLETED' }).expect(409);
    // Staff may book a past/near time (e.g. walk-in) and close it.
    const now = new Date();
    const local = new Date(now.getTime() + 5 * 3600_000);
    if (local.getUTCDay() !== 0 && local.getUTCHours() >= 11 && local.getUTCHours() < 19) {
      const start = new Date(Math.floor((now.getTime() - 30 * 60_000) / 300_000) * 300_000).toISOString();
      const past = await owner.agent.post(`/businesses/${f.businessId}/appointments`).send({ barberId: f.barber2Id, serviceId: f.haircutId, startsAt: start, customer: { name: 'Walk-in 2' } });
      if (past.status === 201) {
        const done = await owner.agent.post(`/businesses/${f.businessId}/appointments/${past.body.id}/status`).send({ status: 'NO_SHOW' }).expect(200);
        expect(done.body.status).toBe('NO_SHOW');
      }
    }
    const detail = await owner.agent.get(`/businesses/${f.businessId}/appointments/${manual.body.id}`).expect(200);
    expect(detail.body.events[0].type).toBe('CREATED');
  });
});

describe('platform admin', () => {
  async function admin() {
    const phone = nextPhone();
    const u = await login(app, phone);
    await prisma.user.update({ where: { id: u.me.id }, data: { platformRole: 'PLATFORM_ADMIN' } });
    return u;
  }

  it('is closed to business owners', async () => {
    const owner = await login(app);
    await makeBusiness(owner.me.id);
    for (const p of ['/platform-admin/overview', '/platform-admin/businesses', '/platform-admin/plans', '/platform-admin/errors', '/platform-admin/audit']) {
      expect((await owner.agent.get(p)).status, p).toBe(403);
    }
  });

  it('lists businesses, blocks and restores them', async () => {
    const a = await admin();
    const owner = await login(app);
    const f = await makeBusiness(owner.me.id, 'blockme');
    const list = await a.agent.get('/platform-admin/businesses').expect(200);
    expect(list.body[0]).toMatchObject({ slug: 'blockme', barbers: 2 });
    await a.agent.post(`/platform-admin/businesses/${f.businessId}/block`).send({ reason: 'Нарушение правил' }).expect(200);
    await request(app.getHttpServer()).get('/public/businesses/blockme').expect(404);
    const client = await login(app);
    const r = await client.agent.post('/bookings').send({ barberId: f.barberId, serviceId: f.haircutId, startsAt: at(futureTuesday(), 12), customerName: 'X', consent: true });
    expect(r.status).toBe(403);
    await a.agent.post(`/platform-admin/businesses/${f.businessId}/unblock`).expect(200);
    await request(app.getHttpServer()).get('/public/businesses/blockme').expect(200);
    const audit = await a.agent.get('/platform-admin/audit').expect(200);
    expect(audit.body.map((x: { action: string }) => x.action)).toEqual(expect.arrayContaining(['admin.business.block', 'admin.business.unblock']));
  });

  it('subscription: manual payment must be confirmed before the period becomes active', async () => {
    const a = await admin();
    const owner = await login(app);
    const f = await makeBusiness(owner.me.id);
    const pay = await a.agent.post(`/platform-admin/businesses/${f.businessId}/payments`).send({ amountUzs: 147000, periodMonths: 1, method: 'BANK_TRANSFER', reference: 'TX-1' }).expect(201);
    expect(pay.body.status).toBe('PENDING');
    expect((await prisma.subscription.findUniqueOrThrow({ where: { businessId: f.businessId } })).status).toBe('TRIALING');
    const confirmed = await a.agent.post(`/platform-admin/payments/${pay.body.id}/confirm`).expect(200);
    expect(confirmed.body.status).toBe('ACTIVE');
    const end = new Date(confirmed.body.currentPeriodEnd).getTime();
    expect(end - Date.now()).toBeGreaterThan(27 * 86400_000);
    // Cannot be confirmed twice.
    await a.agent.post(`/platform-admin/payments/${pay.body.id}/confirm`).expect(409);
    const view = await owner.agent.get(`/businesses/${f.businessId}/subscription`).expect(200);
    expect(view.body.subscription.payments[0].status).toBe('CONFIRMED');
    expect(view.body.subscription.monthlyPriceUzs).toBe(147000); // TEAM: 49 000 × max(3, 2 barbers)
  });

  it('edits plan prices and expired subscriptions stop online booking', async () => {
    const a = await admin();
    const plans = await a.agent.get('/platform-admin/plans').expect(200);
    const solo = plans.body.find((p: { code: string }) => p.code === 'SOLO');
    const upd = await a.agent.patch(`/platform-admin/plans/${solo.id}`).send({ priceUzs: 65000 }).expect(200);
    expect(upd.body.priceUzs).toBe(65000);

    const owner = await login(app);
    const f = await makeBusiness(owner.me.id);
    await prisma.subscription.update({ where: { businessId: f.businessId }, data: { status: 'EXPIRED' } });
    const client = await login(app);
    const r = await client.agent.post('/bookings').send({ barberId: f.barberId, serviceId: f.haircutId, startsAt: at(futureTuesday(), 12), customerName: 'X', consent: true }).expect(403);
    expect(r.body.code).toBe('BOOKING_DISABLED');
    // Staff can still record walk-ins.
    await owner.agent.post(`/businesses/${f.businessId}/appointments`).send({ barberId: f.barberId, serviceId: f.haircutId, startsAt: at(futureTuesday(), 12), customer: { name: 'Walk-in' } }).expect(201);
  });
});

describe('authentication', () => {
  it('OTP: wrong code fails, attempts are limited, code is single-use', async () => {
    const http = request.agent(app.getHttpServer());
    const phone = nextPhone();
    const r = await http.post('/auth/otp/request').send({ phone }).expect(200);
    expect(r.body.sent).toBe(false); // honest: no SMS was delivered
    const wrong = r.body.devCode === '000000' ? '111111' : '000000';
    const bad = await http.post('/auth/otp/verify').send({ phone, code: wrong }).expect(400);
    expect(bad.body.code).toBe('OTP_INVALID');
    await http.post('/auth/otp/verify').send({ phone, code: r.body.devCode }).expect(200);
    await http.post('/auth/otp/verify').send({ phone, code: r.body.devCode }).expect(400);
    const stored = await prisma.otpCode.findFirstOrThrow({ where: { phone } });
    expect(stored.codeHash).not.toContain(r.body.devCode);
  });

  it('OTP: brute force is cut off after 5 attempts', async () => {
    const http = request.agent(app.getHttpServer());
    const phone = nextPhone();
    const r = await http.post('/auth/otp/request').send({ phone }).expect(200);
    for (let i = 0; i < 5; i++) await http.post('/auth/otp/verify').send({ phone, code: String(100000 + i) === r.body.devCode ? '999999' : String(100000 + i) });
    const last = await http.post('/auth/otp/verify').send({ phone, code: r.body.devCode }).expect(400);
    expect(last.body.code).toBe('OTP_EXPIRED');
  });

  it('session cookie is HttpOnly and logout revokes it', async () => {
    const phone = nextPhone();
    const http = request.agent(app.getHttpServer());
    const r = await http.post('/auth/otp/request').send({ phone });
    const v = await http.post('/auth/otp/verify').send({ phone, code: r.body.devCode }).expect(200);
    const cookie = String(v.headers['set-cookie']);
    expect(cookie).toMatch(/bf_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const session = await prisma.session.findFirstOrThrow({ where: { user: { phone } } });
    expect(cookie).not.toContain(session.tokenHash);
    await http.get('/auth/me').expect(200);
    await http.post('/auth/logout').expect(200);
    await http.get('/auth/me').expect(401);
  });

  it('rejects cross-origin state-changing requests', async () => {
    await request(app.getHttpServer()).post('/auth/otp/request').set('Origin', 'https://evil.example').send({ phone: nextPhone() }).expect(403);
  });

  it('Telegram: valid initData logs in, forged or stale data is rejected', async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const user = JSON.stringify({ id: 777000111, first_name: 'Aziz', username: 'aziz_tg', language_code: 'uz', allows_write_to_pm: true });
    const fresh = signTelegramInitData({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE', user, start_param: 'barberflow-demo' }, token);
    const ok = await request(app.getHttpServer()).post('/auth/telegram').send({ initData: fresh }).expect(200);
    expect(ok.body.startParam).toBe('barberflow-demo');
    const u = await prisma.user.findFirstOrThrow({ where: { telegramId: 777000111n } });
    expect(u.telegramChatId).toBe(777000111n);
    expect(u.locale).toBe('uz');

    const forged = fresh.replace('777000111', '777000112');
    await request(app.getHttpServer()).post('/auth/telegram').send({ initData: forged }).expect(401);
    const wrongBot = signTelegramInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user }, '999:OTHER');
    await request(app.getHttpServer()).post('/auth/telegram').send({ initData: wrongBot }).expect(401);
    const stale = signTelegramInitData({ auth_date: String(Math.floor(Date.now() / 1000) - 3 * 86400), user }, token);
    expect(verifyTelegramInitData(stale, token, 86400)).toBeNull();
    await request(app.getHttpServer()).post('/auth/telegram').send({ initData: stale }).expect(401);
  });
});

describe('privacy', () => {
  it('client can export and delete their data; history stays anonymised', async () => {
    const owner = await login(app);
    const f = await makeBusiness(owner.me.id);
    const client = await login(app, nextPhone(), 'Удаляемый');
    const day = futureTuesday();
    const booked = await client.agent.post('/bookings').send({ barberId: f.barberId, serviceId: f.haircutId, startsAt: at(day, 12), customerName: 'Удаляемый', consent: true }).expect(201);
    const exp = await client.agent.get('/me/export').expect(200);
    expect(exp.body.businesses[0].appointments).toHaveLength(1);
    await client.agent.delete('/me').expect(200);
    await client.agent.get('/auth/me').expect(401);
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: booked.body.id }, include: { customer: true } });
    expect(appt.status).toBe('CANCELLED');
    expect(appt.customer.phone).toBeNull();
    expect(appt.customer.name).toBe('—');
  });
});
