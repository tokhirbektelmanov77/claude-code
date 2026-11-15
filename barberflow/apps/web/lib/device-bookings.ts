'use client';

/**
 * Clients have no accounts. Their bookings are reachable by secret manage links (/a/<token>).
 * This device keeps those tokens and the last entered name/phone for convenience only: if storage
 * is unavailable or cleared, the booking still exists and the link still works.
 */
const TOKENS = 'bf_booking_tokens';
const CONTACT = 'bf_contact';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / storage blocked: nothing to persist */
  }
}

export function deviceTokens(): string[] {
  const v = read<unknown>(TOKENS, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{43}$/.test(x)) : [];
}

export function rememberToken(token: string) {
  write(TOKENS, [token, ...deviceTokens().filter((t) => t !== token)].slice(0, 50));
}

export function forgetToken(token: string) {
  write(TOKENS, deviceTokens().filter((t) => t !== token));
}

export function savedContact(): { name: string; phone: string } {
  const v = read<{ name?: unknown; phone?: unknown }>(CONTACT, {});
  return { name: typeof v.name === 'string' ? v.name : '', phone: typeof v.phone === 'string' ? v.phone : '' };
}

export function saveContact(name: string, phone: string) {
  write(CONTACT, { name, phone });
}
