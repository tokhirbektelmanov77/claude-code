import { ApiError } from './api';
import type { TranslationKey } from '@barberflow/shared';

const known = new Set([
  'SLOT_TAKEN', 'SLOT_UNAVAILABLE', 'NOT_FOUND', 'FORBIDDEN', 'UNAUTHORIZED', 'VALIDATION_ERROR', 'RATE_LIMITED',
  'INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'PHONE_TAKEN', 'TOO_MANY_BOOKINGS', 'BUSINESS_BLOCKED', 'BOOKING_DISABLED',
  'CANCEL_TOO_LATE', 'INVALID_STATE', 'SLUG_TAKEN', 'PLAN_LIMIT',
]);

/** Maps an API error to a dictionary key; unknown failures get the generic message. */
export function errorKey(e: unknown): TranslationKey {
  if (e instanceof ApiError) {
    if (e.code === 'NETWORK') return 'common.networkError';
    // Field-level validation: surface the most useful message when the API names it.
    const details = e.details as { message?: string }[] | undefined;
    const hint = Array.isArray(details) ? details.find((d) => d.message === 'INVALID_PHONE' || d.message === 'PASSWORD_TOO_SHORT') : undefined;
    if (hint?.message) return `errors.${hint.message}` as TranslationKey;
    if (known.has(e.code)) return `errors.${e.code}` as TranslationKey;
  }
  return 'common.errorGeneric';
}
