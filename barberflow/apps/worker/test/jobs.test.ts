import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@barberflow/db';
import { claimJobs, expireSubscriptions, runOnce } from '../src/jobs';
import { MessageSender, TelegramApiError } from '../src/telegram';

const url = process.env.TEST_DATABASE_URL ?? 'postgresql://barberflow:barberflow@localhost:5432/barberflow_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url } } });
afterAll(() => prisma.$disconnect());

class FakeSender implements MessageSender {
  sent: { chatId: bigint; text: string }[] = [];
  failWith: Error | null = null;
  async sendMessage(chatId: bigint, text: string) {
    if (this.failWith) throw this.failWith;
    this.sent.push({ chatId, text });
  }
}

let ids: { appointmentId: string; customerUser: string; noChatUser: string; businessId: string };

beforeEach(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} CASCADE`);
  const plan = await prisma.subscriptionPlan.create({ data: { code: 'SOLO', name: 'SOLO', pricing: 'FLAT', priceUzs: 59000, maxSeats: 1 } });
  const business = await prisma.business.create({ data: { slug: 'w', name: 'Worker Shop', subscription: { create: { planId: plan.id, status: 'TRIALING', trialEndsAt: new Date(Date.now() - 1000) } } } });
  const service = await prisma.service.create({ data: { businessId: business.id, name: 'Мужская стрижка', priceUzs: 100000, durationMin: 45 } });
  const barber = await prisma.barber.create({ data: { businessId: business.id, slug: 'w-aziz', name: 'Азиз' } });
  const withChat = await prisma.user.create({ data: { phone: '+998930000001', name: 'A', telegramId: 1n, telegramChatId: 1n, locale: 'ru' } });
  const noChat = await prisma.user.create({ data: { phone: '+998930000002', name: 'B' } });
  const customer = await prisma.customer.create({ data: { businessId: business.id, userId: withChat.id, name: 'A' } });
  const start = new Date(Date.now() + 3 * 86400_000);
  const appt = await prisma.appointment.create({
    data: {
      businessId: business.id, barberId: barber.id, serviceId: service.id, customerId: customer.id, startsAt: start,
      endsAt: new Date(start.getTime() + 45 * 60_000), blockedUntil: new Date(start.getTime() + 45 * 60_000),
      priceUzs: 100000, durationMin: 45, serviceName: service.name,
    },
  });
  ids = { appointmentId: appt.id, customerUser: withChat.id, noChatUser: noChat.id, businessId: business.id };
});

const job = (over: Partial<{ type: string; recipientUserId: string; dedupeKey: string; payload: object; maxAttempts: number }> = {}) =>
  prisma.notificationJob.create({
    data: {
      businessId: ids.businessId, appointmentId: ids.appointmentId, channel: 'TELEGRAM', type: 'APPOINTMENT_CREATED',
      recipientUserId: ids.customerUser, payload: { audience: 'customer' }, dedupeKey: Math.random().toString(), ...over,
    },
  });

describe('notification worker', () => {
  it('sends to a user who opened the bot and marks SENT', async () => {
    const sender = new FakeSender();
    const j = await job();
    expect(await runOnce({ prisma, telegram: sender, workerId: 't', appUrl: 'http://x' })).toBe(1);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].text).toContain('100 000 сум');
    expect((await prisma.notificationJob.findUniqueOrThrow({ where: { id: j.id } })).status).toBe('SENT');
  });

  it('never pretends: no chat → SKIPPED/NO_CHANNEL, no token → SKIPPED/TELEGRAM_NOT_CONFIGURED', async () => {
    const a = await job({ recipientUserId: ids.noChatUser });
    await runOnce({ prisma, telegram: new FakeSender(), workerId: 't', appUrl: 'http://x' });
    expect(await prisma.notificationJob.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ status: 'SKIPPED', lastError: 'NO_CHANNEL' });
    const b = await job();
    await runOnce({ prisma, telegram: null, workerId: 't', appUrl: 'http://x' });
    expect(await prisma.notificationJob.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ status: 'SKIPPED', lastError: 'TELEGRAM_NOT_CONFIGURED' });
  });

  it('retries transient errors with backoff and fails after maxAttempts with an error log', async () => {
    const sender = new FakeSender();
    sender.failWith = new Error('network down');
    const j = await job({ maxAttempts: 2 });
    await runOnce({ prisma, telegram: sender, workerId: 't', appUrl: 'http://x' });
    let row = await prisma.notificationJob.findUniqueOrThrow({ where: { id: j.id } });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.notificationJob.update({ where: { id: j.id }, data: { runAt: new Date() } });
    await runOnce({ prisma, telegram: sender, workerId: 't', appUrl: 'http://x' });
    row = await prisma.notificationJob.findUniqueOrThrow({ where: { id: j.id } });
    expect(row.status).toBe('FAILED');
    expect(await prisma.errorLog.count({ where: { source: 'worker' } })).toBe(1);
  });

  it('a blocked bot is a permanent skip and clears the chat', async () => {
    const sender = new FakeSender();
    sender.failWith = new TelegramApiError(403, 'Forbidden: bot was blocked by the user');
    const j = await job();
    await runOnce({ prisma, telegram: sender, workerId: 't', appUrl: 'http://x' });
    expect((await prisma.notificationJob.findUniqueOrThrow({ where: { id: j.id } })).status).toBe('SKIPPED');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.customerUser } })).telegramChatId).toBeNull();
  });

  it('stale reminders (rescheduled / cancelled) are skipped', async () => {
    const r = await job({ type: 'REMINDER_2H', payload: { audience: 'customer', startsAt: new Date(0).toISOString() } });
    await runOnce({ prisma, telegram: new FakeSender(), workerId: 't', appUrl: 'http://x' });
    expect(await prisma.notificationJob.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: 'SKIPPED', lastError: 'STALE' });
  });

  it('dedupe key prevents duplicate jobs and parallel workers never claim the same job', async () => {
    await job({ dedupeKey: 'same' });
    await expect(job({ dedupeKey: 'same' })).rejects.toThrow();
    for (let i = 0; i < 9; i++) await job();
    const [a, b] = await Promise.all([claimJobs(prisma, 'w1', 10), claimJobs(prisma, 'w2', 10)]);
    const all = [...a, ...b].map((j) => j.id);
    expect(all.length).toBe(10);
    expect(new Set(all).size).toBe(10);
  });

  it('expires ended trials but never activates a subscription', async () => {
    const r = await expireSubscriptions(prisma);
    expect(r.trials).toBe(1);
    expect((await prisma.subscription.findFirstOrThrow()).status).toBe('EXPIRED');
  });
});
