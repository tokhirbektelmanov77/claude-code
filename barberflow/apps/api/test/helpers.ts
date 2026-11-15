import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@barberflow/db';
import { localTimeToUtc } from '@barberflow/shared';
import { createApp } from '../src/app.factory';

export const TZ = 'Asia/Tashkent';
export const prisma = new PrismaClient();

export async function startApp(): Promise<INestApplication> {
  const app = await createApp({ logger: false });
  await app.init();
  return app;
}

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await prisma.subscriptionPlan.createMany({
    data: [
      { code: 'SOLO', name: 'SOLO', pricing: 'FLAT', priceUzs: 59000, minSeats: 1, maxSeats: 1, trialDays: 14 },
      { code: 'TEAM', name: 'TEAM', pricing: 'PER_SEAT', priceUzs: 49000, minSeats: 3, maxSeats: null, trialDays: 14 },
    ],
  });
}

let phoneSeq = 0;
export function nextPhone() {
  phoneSeq++;
  return `+99893${String(1000000 + phoneSeq + Math.floor(Math.random() * 1000) * 1000).slice(-7)}`;
}

/** Logs in through the real OTP endpoints (dev mode returns the code) and returns an agent with the cookie. */
export async function login(app: INestApplication, phone = nextPhone(), name?: string) {
  const agent = request.agent(app.getHttpServer());
  const r = await agent.post('/auth/otp/request').send({ phone }).expect(200);
  const me = await agent.post('/auth/otp/verify').send({ phone, code: r.body.devCode, name }).expect(200);
  return { agent, me: me.body as { id: string }, phone };
}

export interface Fixture {
  businessId: string;
  barberId: string;
  barber2Id: string;
  haircutId: string;
  comboId: string;
  bufferedId: string;
}

/** BARBERFLOW-like tenant: barber works Tue 10:00–20:00 (and every other day), haircut 45 min / 100 000. */
export async function makeBusiness(ownerUserId: string, slug = 'test-shop-' + Math.random().toString(36).slice(2, 8)): Promise<Fixture> {
  const team = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: 'TEAM' } });
  const b = await prisma.business.create({
    data: {
      slug, name: 'Test Shop', city: 'Ташкент', minLeadMinutes: 60, bookingHorizonDays: 30, slotStepMinutes: 15,
      members: { create: { userId: ownerUserId, role: 'OWNER' } },
      subscription: { create: { planId: team.id, status: 'TRIALING', trialEndsAt: new Date(Date.now() + 14 * 86400_000), seats: 3 } },
    },
  });
  const haircut = await prisma.service.create({ data: { businessId: b.id, name: 'Мужская стрижка', priceUzs: 100000, durationMin: 45 } });
  const combo = await prisma.service.create({ data: { businessId: b.id, name: 'Стрижка + борода', priceUzs: 150000, durationMin: 75 } });
  const buffered = await prisma.service.create({ data: { businessId: b.id, name: 'С перерывом', priceUzs: 50000, durationMin: 30, bufferAfterMin: 15 } });
  const mk = async (name: string) => {
    const barber = await prisma.barber.create({
      data: {
        businessId: b.id, name, slug: `${name}-${Math.random().toString(36).slice(2, 8)}`,
        services: { create: [haircut, combo, buffered].map((s) => ({ serviceId: s.id })) },
      },
    });
    await prisma.workingHours.createMany({
      data: [1, 2, 3, 4, 5, 6].map((weekday) => ({ barberId: barber.id, weekday, startMin: 600, endMin: 1200 })),
    });
    return barber;
  };
  const barber = await mk('aziz');
  const barber2 = await mk('timur');
  return { businessId: b.id, barberId: barber.id, barber2Id: barber2.id, haircutId: haircut.id, comboId: combo.id, bufferedId: buffered.id };
}

/** A Tuesday a few days ahead (always inside the horizon, never Sunday). */
export function futureTuesday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const at = (date: string, h: number, m = 0) => localTimeToUtc(date, h * 60 + m, TZ).toISOString();
