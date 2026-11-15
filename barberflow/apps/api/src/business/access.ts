import type { MembershipContext } from '../common/request-context';
import { forbidden } from '../common/errors';

export const isManager = (m: MembershipContext) => m.role === 'OWNER' || m.role === 'MANAGER';

/** Barbers may only act on their own barber profile; owners/managers on any in the business. */
export function assertBarberScope(m: MembershipContext, barberId: string) {
  if (isManager(m)) return;
  if (m.barberId !== barberId) throw forbidden('Barbers can only manage their own schedule');
}
