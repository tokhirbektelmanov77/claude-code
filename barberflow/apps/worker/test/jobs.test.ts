import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@barberflow/db';
import { expireSubscriptions, purgeSessions } from '../src/jobs';

const url = process.env.TEST_DATABASE_URL ?? 'postgresql://barberflow:barberflow@localhost:5432/barberflow_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url } } });
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} CASCADE`);
});

async function business(slug: string, sub: { status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE'; trialEndsAt?: Date; currentPeriodEnd?: Date }) {
  const plan = await prisma.subscriptionPlan.upsert({ where: { code: 'SOLO' }, update: {}, create: { code: 'SOLO', name: 'SOLO', pricing: 'FLAT', priceUzs: 59000, maxSeats: 1 } });
  return prisma.business.create({ data: { slug, name: slug, subscription: { create: { planId: plan.id, ...sub } } }, include: { subscription: true } });
}

describe('worker housekeeping', () => {
  it('expires ended trials, moves ended paid periods to PAST_DUE, expires after the 7-day grace', async () => {
    const day = 86400_000;
    await business('trial-over', { status: 'TRIALING', trialEndsAt: new Date(Date.now() - 1000) });
    await business('trial-on', { status: 'TRIALING', trialEndsAt: new Date(Date.now() + day) });
    await business('paid-over', { status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() - day) });
    await business('grace-over', { status: 'PAST_DUE', currentPeriodEnd: new Date(Date.now() - 8 * day) });
    const r = await expireSubscriptions(prisma);
    expect(r).toEqual({ trials: 1, pastDue: 1, expired: 1 });
    const status = async (slug: string) => (await prisma.business.findUniqueOrThrow({ where: { slug }, include: { subscription: true } })).subscription!.status;
    expect(await status('trial-over')).toBe('EXPIRED');
    expect(await status('trial-on')).toBe('TRIALING');
    expect(await status('paid-over')).toBe('PAST_DUE');
    expect(await status('grace-over')).toBe('EXPIRED');
  });

  it('never activates a subscription', async () => {
    await business('pending', { status: 'PAST_DUE', currentPeriodEnd: new Date(Date.now() - 1000) });
    await expireSubscriptions(prisma);
    expect(await prisma.subscription.count({ where: { status: 'ACTIVE' } })).toBe(0);
  });

  it('purges expired sessions only', async () => {
    const user = await prisma.user.create({ data: { phone: '+998930000001' } });
    await prisma.session.createMany({
      data: [
        { userId: user.id, tokenHash: 'a', expiresAt: new Date(Date.now() - 1000) },
        { userId: user.id, tokenHash: 'b', expiresAt: new Date(Date.now() + 86400_000) },
      ],
    });
    expect(await purgeSessions(prisma)).toBe(1);
    expect(await prisma.session.count()).toBe(1);
  });
});
