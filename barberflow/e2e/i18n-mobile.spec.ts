import { expect, test } from '@playwright/test';

test('language switch RU → UZ persists across reloads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Твой барбер.');
  await page.getByTestId('lang-uz').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sizning barberingiz.');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sizning barberingiz.');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uz-Latn');
  await page.goto('/s/barberflow-demo');
  await expect(page.getByText('Erkaklar soch turmagi')).toBeVisible();
  await expect(page.getByText('100 000 so‘m').first()).toBeVisible();
  await page.getByTestId('lang-ru').click();
  await expect(page.getByText('Мужская стрижка')).toBeVisible();
});

test('mobile layout: no horizontal scroll on key screens (375px)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  for (const path of ['/', '/s/barberflow-demo', '/b/aziz', '/login', '/onboarding']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('Espresso dark theme is the default; light variant is opt-in and remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(26, 18, 14)'); // #1A120E
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
