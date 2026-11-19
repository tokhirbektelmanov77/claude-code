import type { MembershipContext } from '../common/request-context';
import { forbidden } from '../common/errors';

export const isManager = (m: MembershipContext) => m.role === 'OWNER' || m.role === 'MANAGER';

/** Matches no barber: used when a BARBER member has no barber profile yet. */
export const NO_BARBER = '00000000-0000-0000-0000-000000000000';

/**
 * Appointments that put a customer in a barber's scope: their own, not cancelled. A cancelled
 * booking must not keep granting access (otherwise book-then-cancel would open any client card).
 */
export const barberAppointmentScope = (m: MembershipContext) => ({
  barberId: m.barberId ?? NO_BARBER,
  status: { not: 'CANCELLED' as const },
});

/** Barbers may only act on their own barber profile; owners/managers on any in the business. */
export function assertBarberScope(m: MembershipContext, barberId: string) {
  if (isManager(m)) return;
  if (m.barberId !== barberId) throw forbidden('Barbers can only manage their own schedule');
}
