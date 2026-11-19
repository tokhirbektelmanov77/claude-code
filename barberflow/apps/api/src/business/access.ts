import type { Prisma } from '@barberflow/db';
import type { MembershipContext } from '../common/request-context';
import { forbidden } from '../common/errors';

export const isManager = (m: MembershipContext) => m.role === 'OWNER' || m.role === 'MANAGER';

/** Matches no barber: used when a BARBER member has no barber profile yet. */
export const NO_BARBER = '00000000-0000-0000-0000-000000000000';

/**
 * Appointments that put a customer in a barber's scope: their own live visits (upcoming or done).
 * Cancelled and no-show bookings grant nothing, so "book a stranger, then cancel / mark no-show"
 * cannot open someone else's client card; a fake visit has to stay on the calendar, visible to the owner.
 */
export const barberAppointmentScope = (m: MembershipContext) => ({
  barberId: m.barberId ?? NO_BARBER,
  status: { in: ['CONFIRMED', 'COMPLETED'] as ('CONFIRMED' | 'COMPLETED')[] },
});

/** Barbers may only act on their own barber profile; owners/managers on any in the business. */
export function assertBarberScope(m: MembershipContext, barberId: string) {
  if (isManager(m)) return;
  if (m.barberId !== barberId) throw forbidden('Barbers can only manage their own schedule');
}

/** Serialises membership changes and password resets for one user (row lock until the transaction ends). */
export async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}
