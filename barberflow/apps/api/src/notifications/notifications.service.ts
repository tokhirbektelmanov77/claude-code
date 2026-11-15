import { Injectable } from '@nestjs/common';
import { Prisma } from '@barberflow/db';
import { PrismaService } from '../common/prisma.service';

export type AppointmentNotice = 'APPOINTMENT_CREATED' | 'APPOINTMENT_CANCELLED' | 'APPOINTMENT_RESCHEDULED';

interface AppointmentRef {
  id: string;
  businessId: string;
  startsAt: Date;
  barberUserId: string | null;
  customerUserId: string | null;
}

/**
 * Writes notification jobs into the Postgres-backed queue (notification_jobs) inside the caller's
 * transaction, so a job exists if and only if the booking change committed. The worker resolves the
 * recipient's channel at send time; with no reachable channel the job ends as SKIPPED/NO_CHANNEL,
 * never as SENT.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async onAppointmentEvent(tx: Prisma.TransactionClient, appt: AppointmentRef, notice: AppointmentNotice, eventId: string) {
    const jobs: Prisma.NotificationJobCreateManyInput[] = [];
    const base = { businessId: appt.businessId, appointmentId: appt.id, channel: 'TELEGRAM' as const };

    if (appt.customerUserId) {
      jobs.push({
        ...base,
        recipientUserId: appt.customerUserId,
        type: notice,
        payload: { audience: 'customer', startsAt: appt.startsAt.toISOString() },
        dedupeKey: `${notice}:${appt.id}:${appt.customerUserId}:${eventId}`,
      });
    }
    if (appt.barberUserId && appt.barberUserId !== appt.customerUserId) {
      jobs.push({
        ...base,
        recipientUserId: appt.barberUserId,
        type: notice,
        payload: { audience: 'barber', startsAt: appt.startsAt.toISOString() },
        dedupeKey: `${notice}:${appt.id}:${appt.barberUserId}:${eventId}`,
      });
    }

    // Any change invalidates previously scheduled reminders; new ones are keyed by the new start.
    if (notice !== 'APPOINTMENT_CREATED') {
      await tx.notificationJob.updateMany({
        where: { appointmentId: appt.id, status: 'PENDING', type: { in: ['REMINDER_24H', 'REMINDER_2H'] } },
        data: { status: 'SKIPPED', lastError: 'SUPERSEDED' },
      });
    }
    if (notice !== 'APPOINTMENT_CANCELLED' && appt.customerUserId) {
      const now = Date.now();
      for (const [type, hours] of [['REMINDER_24H', 24], ['REMINDER_2H', 2]] as const) {
        const runAt = new Date(appt.startsAt.getTime() - hours * 3600_000);
        if (runAt.getTime() <= now) continue;
        jobs.push({
          ...base,
          recipientUserId: appt.customerUserId,
          type,
          runAt,
          payload: { audience: 'customer', startsAt: appt.startsAt.toISOString() },
          dedupeKey: `${type}:${appt.id}:${eventId}`,
        });
      }
    }
    if (jobs.length) await tx.notificationJob.createMany({ data: jobs, skipDuplicates: true });
  }
}
