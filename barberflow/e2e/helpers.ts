import { expect, Page } from '@playwright/test';

export const PHONES = { admin: '+998900000001', owner: '+998900000002', aziz: '+998900000003', client: '+998900000004', solo: '+998900000005' };

/** Unique, valid, fake phone per test run (OTP codes are rate limited per phone). */
export function freshPhone(): string {
  return '+99899' + String(Date.now()).slice(-7);
}

/** Logs in through the real OTP flow; dev mode shows the code in a labelled test banner. */
export async function loginOtp(page: Page, phone: string) {
  await page.getByTestId('phone-input').fill(phone);
  await page.getByTestId('send-code').click();
  const banner = page.getByTestId('dev-code-text');
  await expect(banner).toBeVisible();
  const code = (await banner.textContent())!.match(/(\d{6})/)![1];
  await page.getByTestId('code-input').fill(code);
  await page.getByTestId('verify-code').click();
}

export async function login(page: Page, phone: string, next = '/me') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await loginOtp(page, phone);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
