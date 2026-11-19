import { Page } from '@playwright/test';
import { demoDay, formatDateLong, formatDayMonth, localTimeToUtc } from '@barberflow/shared';

/** The demo day the seed keeps free at 16:00 (nearest Tuesday ≥ 2 days ahead, Tashkent). */
export const DEMO_DAY = demoDay();
export const DEMO_DATE_RU = formatDateLong(DEMO_DAY, 'ru');
/** The day after the demo day: free of seeded bookings, used by staff (manual booking) tests. */
export const STAFF_DAY = new Date(Date.parse(DEMO_DAY + 'T12:00:00Z') + 86400_000).toISOString().slice(0, 10);
export const STAFF_DAY_RU = formatDayMonth(STAFF_DAY, 'ru'); // e.g. "25 ноября"
/** UTC ISO for a local time on the demo day, e.g. demoAt(18) → 18:00 Tashkent. */
export const demoAt = (h: number, m = 0) => localTimeToUtc(DEMO_DAY, h * 60 + m, 'Asia/Tashkent').toISOString();

/** Clicks a day in the month calendar, paging forward if it is in a later month. */
export async function pickDay(page: Page, iso: string) {
  const day = page.getByTestId(`day-${iso}`);
  await page.locator('[data-testid^="day-"]:not(.invisible)').first().waitFor(); // calendar rendered
  for (let i = 0; i < 3 && !(await day.isVisible()); i++) await page.getByRole('button', { name: 'Вперёд' }).last().click();
  await day.click();
}

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
