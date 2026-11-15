import { expect, test } from '@playwright/test';
import { login, PHONES } from './helpers';

test('platform admin: businesses, manual payment confirmation, plan editing', async ({ page }) => {
  await login(page, PHONES.admin, '/platform-admin');
  await page.goto('/platform-admin');
  await expect(page.getByTestId('admin-title')).toBeVisible();
  await expect(page.getByTestId('admin-business-row').filter({ hasText: 'BARBERFLOW DEMO' })).toBeVisible();
  await expect(page.getByTestId('admin-business-row').filter({ hasText: 'Jasur Barber (demo)' })).toBeVisible();

  await page.getByRole('tab', { name: 'Платежи' }).click();
  const pending = page.getByTestId('confirm-payment').first();
  await pending.click();
  await expect(page.getByText('Ожидает подтверждения', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Подтверждён', { exact: true }).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Тарифы' }).click();
  await page.getByTestId('edit-plan-SOLO').click();
  await page.getByTestId('plan-price').fill('61000');
  await page.getByTestId('save-plan').click();
  await expect(page.getByText('61 000 сум')).toBeVisible();
  // Restore the starting hypothesis.
  await page.getByTestId('edit-plan-SOLO').click();
  await page.getByTestId('plan-price').fill('59000');
  await page.getByTestId('save-plan').click();
  await expect(page.getByText('59 000 сум')).toBeVisible();

  await page.getByRole('tab', { name: 'Журнал действий' }).click();
  await expect(page.getByTestId('audit-row').filter({ hasText: 'payment.confirm' }).first()).toBeVisible();
});

test('owner cannot open the platform admin', async ({ page }) => {
  await login(page, PHONES.owner, '/platform-admin');
  await page.goto('/platform-admin');
  await expect(page.getByText('Раздел доступен только администраторам платформы.')).toBeVisible();
});
