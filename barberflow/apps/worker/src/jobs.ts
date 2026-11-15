import { NotificationJob, PrismaClient } from '@barberflow/db';
import { isLocale } from '@barberflow/shared';
import { renderMessage } from './messages';
import { MessageSender, TelegramApiError } from './telegram';

export interface WorkerDeps {
  prisma: PrismaClient;
  /** null when TELEGRAM_BOT_TOKEN is not configured. */
  telegram: MessageSender | null;
  workerId: string;
  appUrl: string;
  log?: (msg: string) => void;
}

const BATCH = 20;
const STUCK_AFTER_MS = 5 * 60_000;

/** Exponential backoff: 1, 2, 4, 8 … minutes, capped at 1 hour. */
export const backoffMs = (attempt: number) => Math.min(60, 2 ** Math.max(0, attempt - 1)) * 60_000;

/**
 * Atomically claims due jobs. FOR UPDATE SKIP LOCKED lets several workers run in parallel without
 * ever processing the same job twice; `attempts` is incremented at claim time.
 */
export async function claimJobs(prisma: PrismaClient, workerId: string, limit = BATCH): Promise<NotificationJob[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE notification_jobs SET status = 'PROCESSING', locked_at = now(), locked_by = ${workerId},
           attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM notification_jobs
      WHERE status = 'PENDING' AND run_at <= now()
      ORDER BY run_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  if (rows.length === 0) return [];
  return prisma.notificationJob.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
}

/** Jobs whose worker died mid-flight go back to the queue. */
export async function releaseStuckJobs(prisma: PrismaClient) {
  return prisma.notificationJob.updateMany({
    where: { status: 'PROCESSING', lockedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    data: { status: 'PENDING', lockedAt: null, lockedBy: null },
  });
}

type Outcome = { status: 'SENT' } | { status: 'SKIPPED'; reason: string };

async function deliver(job: NotificationJob, deps: WorkerDeps): Promise<Outcome> {
  if (job.channel !== 'TELEGRAM') return { status: 'SKIPPED', reason: 'CHANNEL_NOT_IMPLEMENTED' };
  if (!deps.telegram) return { status: 'SKIPPED', reason: 'TELEGRAM_NOT_CONFIGURED' };
  if (!job.appointmentId || !job.recipientUserId) return { status: 'SKIPPED', reason: 'INVALID_JOB' };

  const appt = await deps.prisma.appointment.findUnique({
    where: { id: job.appointmentId },
    include: { business: true, barber: true, customer: true },
  });
  if (!appt) return { status: 'SKIPPED', reason: 'APPOINTMENT_GONE' };
  const payload = (job.payload ?? {}) as { audience?: 'customer' | 'barber'; startsAt?: string };
  if (job.type.startsWith('REMINDER')) {
    // Reminders are only valid for the exact booking they were created for.
    if (appt.status !== 'CONFIRMED') return { status: 'SKIPPED', reason: 'STALE' };
    if (payload.startsAt && payload.startsAt !== appt.startsAt.toISOString()) return { status: 'SKIPPED', reason: 'STALE' };
    if (appt.startsAt.getTime() < Date.now()) return { status: 'SKIPPED', reason: 'STALE' };
  }
  const user = await deps.prisma.user.findUnique({ where: { id: job.recipientUserId } });
  // A bot cannot start a conversation: without a chat the user opened, there is nothing to send to.
  if (!user || user.deletedAt || !user.telegramChatId) return { status: 'SKIPPED', reason: 'NO_CHANNEL' };

  const text = renderMessage({
    locale: isLocale(user.locale) ? user.locale : 'ru',
    audience: payload.audience ?? 'customer',
    type: job.type,
    businessName: appt.business.name,
    address: appt.business.address,
    barberName: appt.barber.name,
    customerName: appt.customer.name,
    serviceName: appt.serviceName,
    priceUzs: appt.priceUzs,
    startsAt: appt.startsAt,
    endsAt: appt.endsAt,
    timezone: appt.business.timezone,
    appUrl: deps.appUrl,
  });
  try {
    await deps.telegram.sendMessage(user.telegramChatId, text);
  } catch (e) {
    if (e instanceof TelegramApiError && e.permanent) {
      await deps.prisma.user.update({ where: { id: user.id }, data: { telegramChatId: null } });
      return { status: 'SKIPPED', reason: `BOT_UNREACHABLE: ${e.description}`.slice(0, 200) };
    }
    throw e;
  }
  return { status: 'SENT' };
}

export async function processJob(job: NotificationJob, deps: WorkerDeps): Promise<void> {
  try {
    const outcome = await deliver(job, deps);
    await deps.prisma.notificationJob.update({
      where: { id: job.id },
      data: outcome.status === 'SENT'
        ? { status: 'SENT', sentAt: new Date(), lockedAt: null, lastError: null }
        : { status: 'SKIPPED', lastError: outcome.reason, lockedAt: null },
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const final = job.attempts >= job.maxAttempts;
    await deps.prisma.notificationJob.update({
      where: { id: job.id },
      data: final
        ? { status: 'FAILED', lastError: err.message.slice(0, 500), lockedAt: null }
        : { status: 'PENDING', lastError: err.message.slice(0, 500), lockedAt: null, lockedBy: null, runAt: new Date(Date.now() + backoffMs(job.attempts)) },
    });
    if (final) {
      await deps.prisma.errorLog.create({
        data: { source: 'worker', message: `Notification ${job.type} failed after ${job.attempts} attempts: ${err.message}`.slice(0, 2000), stack: err.stack?.slice(0, 8000), context: { jobId: job.id } },
      });
    }
    deps.log?.(`job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}): ${err.message}`);
  }
}

export async function runOnce(deps: WorkerDeps): Promise<number> {
  await releaseStuckJobs(deps.prisma);
  const jobs = await claimJobs(deps.prisma, deps.workerId);
  for (const job of jobs) await processJob(job, deps);
  return jobs.length;
}

/**
 * Subscription lifecycle. Never activates anything: only moves trials/periods that ended to
 * EXPIRED / PAST_DUE. Activation happens solely through a confirmed payment.
 */
export async function expireSubscriptions(prisma: PrismaClient, now = new Date()) {
  const trials = await prisma.subscription.updateMany({ where: { status: 'TRIALING', trialEndsAt: { lt: now } }, data: { status: 'EXPIRED' } });
  const pastDue = await prisma.subscription.updateMany({ where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } }, data: { status: 'PAST_DUE' } });
  const grace = new Date(now.getTime() - 7 * 86400_000);
  const expired = await prisma.subscription.updateMany({ where: { status: 'PAST_DUE', currentPeriodEnd: { lt: grace } }, data: { status: 'EXPIRED' } });
  return { trials: trials.count, pastDue: pastDue.count, expired: expired.count };
}
