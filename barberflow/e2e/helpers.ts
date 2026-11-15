import { Page } from '@playwright/test';

export const PHONES = { admin: '+998900000001', owner: '+998900000002', aziz: '+998900000003', solo: '+998900000005' };
/** Seeded staff password (development only). */
export const DEMO_PASSWORD = 'barberflow-demo';

let seq = 0;
/** Unique, valid, fake phone per call. */
export function freshPhone(): string {
  seq++;
  return '+99899' + String((Date.now() + seq * 7919) % 10_000_000).padStart(7, '0');
}

/** Fills the guest booking form (name + phone, no account). */
export async function fillGuest(page: Page, name: string, phone = freshPhone()) {
  await page.getByTestId('customer-name').fill(name);
  await page.getByTestId('customer-phone').fill(phone);
  await page.getByTestId('consent').check();
  return phone;
}

/** Staff sign-in with phone + password through the real form. */
export async function login(page: Page, phone: string, next = '/app', password = DEMO_PASSWORD) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId('auth-phone').fill(phone);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
