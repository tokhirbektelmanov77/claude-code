import { expect, test } from '@playwright/test';
import { freshPhone } from './helpers';

test('new owner registers a barbershop in 7 steps and gets a working link', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page.getByTestId('onboarding-progress')).toContainText('Шаг 1 из 7');
  await page.getByTestId('auth-name').fill('Ильхом');
  await page.getByTestId('auth-phone').fill(freshPhone());
  await page.getByTestId('auth-password').fill('my-strong-password');
  await page.getByTestId('auth-submit').click();

  await expect(page.getByTestId('onboarding-progress')).toContainText('Шаг 2 из 7');
  const name = `E2E Barber ${Date.now().toString().slice(-5)}`;
  await page.getByTestId('ob-name').fill(name);
  await page.getByTestId('ob-next').click();

  await expect(page.getByTestId('onboarding-progress')).toContainText('Шаг 3 из 7');
  await page.getByTestId('ob-address').fill('ул. Тестовая, 5');
  await page.getByTestId('ob-next').click();

  await expect(page.getByTestId('onboarding-progress')).toContainText('Шаг 4 из 7');
  await page.getByTestId('ob-barber').fill('Ильхом');
  await page.getByTestId('ob-next').click();

  await expect(page.getByTestId('onboarding-progress')).toContainText('Шаг 5 из 7');
  await page.getByRole('button', { name: '+ Мужская стрижка' }).click();
  await page.getByTestId('ob-add-service').click();
  await expect(page.getByText('100 000 сум')).toBeVisible();
  await page.getByTestId('ob-next').click();

  await expect(page.getByTestId('onboarding-progress')).toContainText('Шаг 6 из 7');
  await page.getByTestId('ob-next').click();

  await expect(page.getByTestId('onboarding-progress')).toContainText('Шаг 7 из 7');
  await expect(page.getByTestId('qr')).toBeVisible();
  await page.getByTestId('ob-cabinet').click();
  await page.waitForURL('**/app/**');

  // The public page of the new shop accepts bookings right away.
  const shops = await (await page.request.get('/api/auth/me')).json();
  const slug = shops.memberships.find((m: { businessName: string }) => m.businessName === name).businessSlug;
  await page.goto(`/s/${slug}`);
  await expect(page.getByTestId('shop-name')).toHaveText(name);
  await expect(page.getByTestId('book-cta')).toBeVisible();
});
