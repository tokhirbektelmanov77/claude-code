import { PrismaClient } from '@barberflow/db';

/**
 * Background jobs. This product version has no message channel (no Telegram bot, no SMS), so the
 * worker only maintains subscription lifecycle. It never activates anything: a paid period starts
 * only when a platform admin confirms a recorded payment.
 */
export async function expireSubscriptions(prisma: PrismaClient, now = new Date()) {
  const trials = await prisma.subscription.updateMany({ where: { status: 'TRIALING', trialEndsAt: { lt: now } }, data: { status: 'EXPIRED' } });
  const pastDue = await prisma.subscription.updateMany({ where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } }, data: { status: 'PAST_DUE' } });
  const grace = new Date(now.getTime() - 7 * 86400_000);
  const expired = await prisma.subscription.updateMany({ where: { status: 'PAST_DUE', currentPeriodEnd: { lt: grace } }, data: { status: 'EXPIRED' } });
  return { trials: trials.count, pastDue: pastDue.count, expired: expired.count };
}

/** Drops expired sessions so the table does not grow forever. */
export async function purgeSessions(prisma: PrismaClient, now = new Date()) {
  const r = await prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: new Date(now.getTime() - 30 * 86400_000) } }] } });
  return r.count;
}
