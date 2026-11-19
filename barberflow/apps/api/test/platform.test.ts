import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { at, futureTuesday, guestBody, login, makeBusiness, nextPhone, PASSWORD, prisma, resetDb, startApp } from './helpers';

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
    const day = futureTuesday();
    await request(app.getHttpServer()).post('/public/bookings').send(guestBody({ barberId: barber.body.id, serviceId: service.body.id }, at(day, 16))).expect(201);

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
    await http.get('/me/export').expect(401);
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
    const r = await request(app.getHttpServer()).post('/public/bookings').send(guestBody({ barberId: f.barberId, serviceId: f.haircutId }, at(day, 16, 30))).expect(409);
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
    const r = await request(app.getHttpServer()).post('/public/bookings').send(guestBody({ barberId: f.barberId, serviceId: f.haircutId }, at(futureTuesday(), 12)));
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
    const r = await request(app.getHttpServer()).post('/public/bookings').send(guestBody({ barberId: f.barberId, serviceId: f.haircutId }, at(futureTuesday(), 12))).expect(403);
    expect(r.body.code).toBe('BOOKING_DISABLED');
    // Staff can still record walk-ins.
    await owner.agent.post(`/businesses/${f.businessId}/appointments`).send({ barberId: f.barberId, serviceId: f.haircutId, startsAt: at(futureTuesday(), 12), customer: { name: 'Walk-in' } }).expect(201);
  });
});

describe('authentication (staff: phone + password)', () => {
  it('registers, rejects duplicates and short passwords, logs in, never stores the password', async () => {
    const http = request.agent(app.getHttpServer());
    const phone = nextPhone();
    await http.post('/auth/register').send({ name: 'Азиз', phone, password: 'short' }).expect(400);
    await http.post('/auth/register').send({ name: 'Азиз', phone, password: PASSWORD }).expect(201);
    const dup = await request(app.getHttpServer()).post('/auth/register').send({ name: 'X', phone, password: PASSWORD }).expect(409);
    expect(dup.body.code).toBe('PHONE_TAKEN');
    const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    const again = request.agent(app.getHttpServer());
    await again.post('/auth/login').send({ phone, password: PASSWORD }).expect(200);
    await again.get('/auth/me').expect(200);
  });

  it('wrong password and unknown phone get the same answer; 5 failures lock the account', async () => {
    const { phone } = await login(app);
    const http = request(app.getHttpServer());
    const unknown = await http.post('/auth/login').send({ phone: nextPhone(), password: 'whatever-123' }).expect(401);
    const wrong = await http.post('/auth/login').send({ phone, password: 'wrong-password' }).expect(401);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body).toEqual(unknown.body);
    for (let i = 0; i < 4; i++) await http.post('/auth/login').send({ phone, password: 'wrong-password' });
    const locked = await http.post('/auth/login').send({ phone, password: PASSWORD }).expect(429);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('session cookie is HttpOnly and logout revokes it', async () => {
    const phone = nextPhone();
    const http = request.agent(app.getHttpServer());
    const v = await http.post('/auth/register').send({ name: 'S', phone, password: PASSWORD }).expect(201);
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

  it('changing the password signs out other devices', async () => {
    const a = await login(app);
    const b = request.agent(app.getHttpServer());
    await b.post('/auth/login').send({ phone: a.phone, password: PASSWORD }).expect(200);
    await a.agent.post('/auth/password').send({ currentPassword: 'nope-nope', newPassword: 'new-password-1' }).expect(401);
    await a.agent.post('/auth/password').send({ currentPassword: PASSWORD, newPassword: 'new-password-1' }).expect(200);
    await a.agent.get('/auth/me').expect(200);
    await b.get('/auth/me').expect(401);
  });

  it('a phone number grants nothing: signing up with any phone never makes a platform admin', async () => {
    const u = await login(app);
    expect((await u.agent.get('/auth/me')).body.isPlatformAdmin).toBe(false);
    await u.agent.get('/platform-admin/overview').expect(403);
  });

  it('rejects cross-origin state-changing requests', async () => {
    await request(app.getHttpServer()).post('/auth/login').set('Origin', 'https://evil.example').send({ phone: nextPhone(), password: PASSWORD }).expect(403);
  });
});

describe('team invitations by secret link and password recovery without SMS', () => {
  it('invite link: preview, accept once, links barber profile; phone on the invite is only a note', async () => {
    const owner = await login(app);
    const f = await makeBusiness(owner.me.id);
    const inv = await owner.agent.post(`/businesses/${f.businessId}/invitations`).send({ role: 'BARBER', barberId: f.barberId, phone: '' }).expect(201);
    const token = inv.body.invitePath.split('/').pop();
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: inv.body.id } });
    expect(stored.tokenHash).not.toBe(token);
    const preview = await request(app.getHttpServer()).get(`/invitations/${token}`).expect(200);
    expect(preview.body).toMatchObject({ businessName: 'Test Shop', role: 'BARBER' });

    await request(app.getHttpServer()).post(`/invitations/${token}/accept`).expect(401);
    const barber = await login(app);
    const me = await barber.agent.post(`/invitations/${token}/accept`).expect(200);
    expect(me.body.memberships[0]).toMatchObject({ businessId: f.businessId, role: 'BARBER', barberId: f.barberId });
    const other = await login(app);
    await other.agent.post(`/invitations/${token}/accept`).expect(404); // single use
    await request(app.getHttpServer()).get('/invitations/garbage-token-value-123').expect(404);
  });

  it('owner issues a temporary password to staff; change is forced; owners cannot be reset this way', async () => {
    const owner = await login(app);
    const f = await makeBusiness(owner.me.id);
    const staff = await login(app);
    const member = await prisma.businessMember.create({ data: { businessId: f.businessId, userId: staff.me.id, role: 'BARBER' } });
    const r = await owner.agent.post(`/businesses/${f.businessId}/members/${member.id}/reset-password`).expect(200);
    expect(r.body.temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}$/);
    await staff.agent.get('/auth/me').expect(401); // old sessions revoked
    const fresh = request.agent(app.getHttpServer());
    const me = await fresh.post('/auth/login').send({ phone: staff.phone, password: r.body.temporaryPassword }).expect(200);
    expect(me.body.mustChangePassword).toBe(true);
    await fresh.post('/auth/password').send({ currentPassword: r.body.temporaryPassword, newPassword: 'my-own-password' }).expect(200);
    expect((await fresh.get('/auth/me')).body.mustChangePassword).toBe(false);

    const ownerMember = await prisma.businessMember.findFirstOrThrow({ where: { businessId: f.businessId, role: 'OWNER' } });
    await owner.agent.post(`/businesses/${f.businessId}/members/${ownerMember.id}/reset-password`).expect(403);
    await staff.agent.post(`/businesses/${f.businessId}/members/${member.id}/reset-password`).expect(401);
  });

  it('SECURITY: an owner cannot reset the password of staff whose account is used elsewhere (cross-tenant takeover)', async () => {
    const ownerA = await login(app);
    const a = await makeBusiness(ownerA.me.id);
    const ownerB = await login(app);
    await makeBusiness(ownerB.me.id); // the victim owns business B…
    const asBarberInA = await prisma.businessMember.create({ data: { businessId: a.businessId, userId: ownerB.me.id, role: 'BARBER' } }); // …and also works in A
    const r = await ownerA.agent.post(`/businesses/${a.businessId}/members/${asBarberInA.id}/reset-password`).expect(403);
    expect(r.body.code).toBe('RESET_NOT_ALLOWED');
    expect(r.body.temporaryPassword).toBeUndefined();
    await ownerB.agent.get('/auth/me').expect(200); // victim untouched

    const admin = await login(app);
    await prisma.user.update({ where: { id: admin.me.id }, data: { platformRole: 'PLATFORM_ADMIN' } });
    const adminInA = await prisma.businessMember.create({ data: { businessId: a.businessId, userId: admin.me.id, role: 'MANAGER' } });
    await ownerA.agent.post(`/businesses/${a.businessId}/members/${adminInA.id}/reset-password`).expect(403);

    const former = await login(app);
    const disabled = await prisma.businessMember.create({ data: { businessId: a.businessId, userId: former.me.id, role: 'BARBER', status: 'DISABLED' } });
    await ownerA.agent.post(`/businesses/${a.businessId}/members/${disabled.id}/reset-password`).expect(403);
  });

  it('SECURITY: a temporary password only allows changing it, nothing else (server-side)', async () => {
    const owner = await login(app);
    const f = await makeBusiness(owner.me.id);
    const staff = await login(app);
    const member = await prisma.businessMember.create({ data: { businessId: f.businessId, userId: staff.me.id, role: 'MANAGER' } });
    const r = await owner.agent.post(`/businesses/${f.businessId}/members/${member.id}/reset-password`).expect(200);
    const temp = request.agent(app.getHttpServer());
    await temp.post('/auth/login').send({ phone: staff.phone, password: r.body.temporaryPassword }).expect(200);
    const blocked = await temp.get(`/businesses/${f.businessId}/customers`).expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await temp.get('/me/export').expect(403);
    await temp.get('/auth/me').expect(200);
    await temp.post('/auth/password').send({ currentPassword: r.body.temporaryPassword, newPassword: 'fresh-password-1' }).expect(200);
    await temp.get(`/businesses/${f.businessId}/customers`).expect(200);
  });

  it('platform admin can reset an owner password', async () => {
    const admin = await login(app);
    await prisma.user.update({ where: { id: admin.me.id }, data: { platformRole: 'PLATFORM_ADMIN' } });
    const owner = await login(app);
    const r = await admin.agent.post(`/platform-admin/users/${owner.me.id}/reset-password`).expect(200);
    await request(app.getHttpServer()).post('/auth/login').send({ phone: owner.phone, password: r.body.temporaryPassword }).expect(200);
    await owner.agent.get('/auth/me').expect(401); // the reset revoked the owner's sessions
    const someone = await login(app);
    await someone.agent.post(`/platform-admin/users/${admin.me.id}/reset-password`).expect(403);
  });
});

describe('SECURITY: barber customer data minimisation', () => {
  it('a barber cannot open another barber\'s client card by phone, by id, or by book-then-cancel', async () => {
    const owner = await login(app);
    const f = await makeBusiness(owner.me.id);
    const barberUser = await login(app);
    await prisma.businessMember.create({ data: { businessId: f.businessId, userId: barberUser.me.id, role: 'BARBER' } });
    await prisma.barber.update({ where: { id: f.barberId }, data: { userId: barberUser.me.id } });
    const day = futureTuesday();
    // A client of the OTHER barber, with private staff notes.
    const phone = nextPhone();
    const other = await request(app.getHttpServer()).post('/public/bookings').send(guestBody({ barberId: f.barber2Id, serviceId: f.haircutId }, at(day, 12), phone, 'Чужой клиент')).expect(201);
    await prisma.customer.update({ where: { id: other.body.customerId }, data: { notes: 'private note' } });
    const b = barberUser.agent;

    // (a) standalone card creation (a phone lookup) is an owner/manager tool
    const leak = await b.post(`/businesses/${f.businessId}/customers`).send({ name: 'x', phone }).expect(403);
    expect(JSON.stringify(leak.body)).not.toContain('private note');
    // owner still gets it
    await owner.agent.post(`/businesses/${f.businessId}/customers`).send({ name: 'x', phone }).expect(201);

    // (b) manual booking with someone else's customerId is refused
    await b.post(`/businesses/${f.businessId}/appointments`).send({ barberId: f.barberId, serviceId: f.haircutId, startsAt: at(day, 15), customerId: other.body.customerId }).expect(404);
    await b.get(`/businesses/${f.businessId}/customers/${other.body.customerId}`).expect(404);

    // (c) walk-in by phone attaches to the same card (no duplicates), but the barber sees only own visits,
    //     and cancelling the booking removes access again.
    const walkIn = await b.post(`/businesses/${f.businessId}/appointments`).send({ barberId: f.barberId, serviceId: f.haircutId, startsAt: at(day, 16), customer: { name: 'Чужой клиент', phone } }).expect(201);
    expect(walkIn.body.customerId).toBe(other.body.customerId);
    const card = await b.get(`/businesses/${f.businessId}/customers/${other.body.customerId}`).expect(200);
    expect(card.body.appointments).toHaveLength(1);
    expect(card.body.appointments[0].id).toBe(walkIn.body.id);
    const detail = await b.get(`/businesses/${f.businessId}/appointments/${walkIn.body.id}`).expect(200);
    expect(detail.body.customerVisits).toBe(0); // other barbers' visits are not counted for a barber
    // a no-show does not keep access either
    await prisma.appointment.update({ where: { id: walkIn.body.id }, data: { status: 'NO_SHOW' } });
    await b.get(`/businesses/${f.businessId}/customers/${other.body.customerId}`).expect(404);
    await prisma.appointment.update({ where: { id: walkIn.body.id }, data: { status: 'CONFIRMED' } });
    await b.post(`/businesses/${f.businessId}/appointments/${walkIn.body.id}/cancel`).send({}).expect(200);
    await b.get(`/businesses/${f.businessId}/customers/${other.body.customerId}`).expect(404);
    const list = await b.get(`/businesses/${f.businessId}/customers`).expect(200);
    expect(list.body.map((c: { id: string }) => c.id)).not.toContain(other.body.customerId);

    // the owner keeps the full picture
    const full = await owner.agent.get(`/businesses/${f.businessId}/customers/${other.body.customerId}`).expect(200);
    expect(full.body.appointments).toHaveLength(2);
  });
});

describe('privacy', () => {
  it('staff account can export and delete itself; owners must hand over first', async () => {
    const owner = await login(app);
    await makeBusiness(owner.me.id);
    await owner.agent.delete('/me').expect(409);
    const staff = await login(app, nextPhone(), 'Удаляемый');
    const exp = await staff.agent.get('/me/export').expect(200);
    expect(exp.body.user.name).toBe('Удаляемый');
    await staff.agent.delete('/me').expect(200);
    await staff.agent.get('/auth/me').expect(401);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: staff.me.id } });
    expect(u.phone).toBeNull();
    expect(u.passwordHash).toBeNull();
  });

  it('owner anonymises a guest client on request; visit history stays without PII', async () => {
    const owner = await login(app);
    const f = await makeBusiness(owner.me.id);
    const booked = await request(app.getHttpServer()).post('/public/bookings').send(guestBody({ barberId: f.barberId, serviceId: f.haircutId }, at(futureTuesday(), 12), nextPhone(), 'Удаляемый')).expect(201);
    const exp = await owner.agent.get(`/businesses/${f.businessId}/customers/${booked.body.customerId}/export`).expect(200);
    expect(exp.body.customer.name).toBe('Удаляемый');
    await owner.agent.delete(`/businesses/${f.businessId}/customers/${booked.body.customerId}`).expect(200);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: booked.body.customerId } });
    expect(c.phone).toBeNull();
    expect(c.name).toBe('—');
    expect(await prisma.appointment.count({ where: { customerId: c.id } })).toBe(1);
  });
});
