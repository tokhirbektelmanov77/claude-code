import { ApiError } from './api';
import type { TranslationKey } from '@barberflow/shared';

const known = new Set([
  'SLOT_TAKEN', 'SLOT_UNAVAILABLE', 'NOT_FOUND', 'FORBIDDEN', 'UNAUTHORIZED', 'VALIDATION_ERROR', 'RATE_LIMITED', 'OTP_INVALID',
  'OTP_EXPIRED', 'BUSINESS_BLOCKED', 'BOOKING_DISABLED', 'CANCEL_TOO_LATE', 'INVALID_STATE', 'SLUG_TAKEN', 'PLAN_LIMIT', 'SMS_UNAVAILABLE',
]);

/** Maps an API error to a dictionary key; unknown failures get the generic message. */
export function errorKey(e: unknown): TranslationKey {
  if (e instanceof ApiError) {
    if (e.code === 'NETWORK') return 'common.networkError';
    if (known.has(e.code)) return `errors.${e.code}` as TranslationKey;
  }
  return 'common.errorGeneric';
}
