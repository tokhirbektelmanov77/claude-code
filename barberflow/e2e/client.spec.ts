import { expect, test } from '@playwright/test';
import { fillGuest, freshPhone } from './helpers';

test.describe('client booking without registration (mobile)', () => {
  test('demo scenario: Азиз · Мужская стрижка · 17.11.2026 16:00–16:45 · 100 000 сум — name + phone only', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cta-demo').click();
    await expect(page.getByTestId('step-title')).toHaveText('Выберите услугу');
    await page.getByText('Мужская стрижка').first().click();
    await page.getByTestId('day-2026-11-17').click();
    await page.getByTestId('slot-16:00').click();
    await page.getByTestId('time-continue').click();
    await expect(page.getByTestId('summary-when')).toHaveText('17 ноября 2026, 16:00–16:45');
    await expect(page.getByTestId('summary-price')).toHaveText('100 000 сум');
    await expect(page.getByText('Оплата барберу на месте, после визита.')).toBeVisible();

    // No login, no code: name + phone and confirm.
    await expect(page.getByTestId('auth-password')).toHaveCount(0);
    await fillGuest(page, 'Клиент E2E');
    await page.getByTestId('confirm-booking').click();

    await expect(page.getByTestId('success-title')).toHaveText('Вы успешно записались!');
    await expect(page).toHaveURL(/\/a\/[A-Za-z0-9_-]{43}\?new=1$/);
    await expect(page.getByTestId('detail-date')).toHaveText('17 ноября 2026');
    await expect(page.getByTestId('detail-time')).toHaveText('16:00–16:45');
    await expect(page.getByTestId('detail-price')).toHaveText('100 000 сум');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('add-to-calendar').click()]);
    expect(download.suggestedFilename()).toMatch(/\.ics$/);

    // "Мои записи" on this device lists it.
    await page.getByTestId('nav-my-bookings').click();
    await expect(page.getByTestId('my-appointment')).toHaveCount(1);
    await expect(page.getByTestId('my-appointment')).toContainText('Мужская стрижка');

    // The slot is gone for everyone else.
    await page.goto('/b/aziz');
    await page.getByText('Мужская стрижка').first().click();
    await page.getByTestId('day-2026-11-17').click();
    await expect(page.getByTestId('slot-15:15')).toBeVisible();
    for (const t of ['15:30', '15:45', '16:00', '16:15', '16:30']) await expect(page.getByTestId(`slot-${t}`)).toHaveCount(0);
    await expect(page.getByTestId('slot-16:45')).toBeVisible();
  });

  test('time taken by someone else while confirming → offered to pick another', async ({ page, request }) => {
    await page.goto('/b/aziz');
    await page.getByText('Мужская стрижка').first().click();
    await page.getByTestId('day-2026-11-17').click();
    await page.getByTestId('slot-18:00').click();
    await page.getByTestId('time-continue').click();
    await fillGuest(page, 'Опоздавший');

    // Another guest grabs 18:00 through the API in the meantime.
    const biz = await (await request.get('/api/public/businesses/barberflow-demo')).json();
    const aziz = biz.barbers.find((b: { slug: string }) => b.slug === 'aziz');
    const haircut = biz.services.find((s: { name: string }) => s.name === 'Мужская стрижка');
    const booked = await request.post('/api/public/bookings', {
      data: { barberId: aziz.id, serviceId: haircut.id, startsAt: '2026-11-17T13:00:00.000Z', customerName: 'Быстрый', phone: freshPhone(), consent: true },
    });
    expect(booked.status()).toBe(201);

    await page.getByTestId('confirm-booking').click();
    await expect(page.getByText('Это время только что заняли')).toBeVisible();
    await page.getByTestId('choose-another').click();
    await expect(page.getByTestId('slot-18:00')).toHaveCount(0);
  });

  test('the secret link works on another device: reschedule and cancel without an account', async ({ page, browser }) => {
    await page.goto('/b/aziz');
    await page.getByText('Оформление бороды').click();
    await page.getByTestId('day-2026-11-17').click();
    await page.getByTestId('slot-17:00').click();
    await page.getByTestId('time-continue').click();
    await fillGuest(page, 'Переносящий');
    await page.getByTestId('confirm-booking').click();
    await expect(page.getByTestId('success-title')).toBeVisible();
    const link = page.url().replace('?new=1', '');

    // Open the same link in a fresh browser context (another phone).
    const other = await browser.newPage();
    await other.goto(link);
    await other.getByTestId('reschedule').click();
    await other.getByTestId('day-2026-11-17').click();
    await other.getByTestId('slot-19:00').click();
    await other.getByTestId('reschedule-submit').click();
    await expect(other.getByText('Запись перенесена')).toBeVisible();
    await expect(other.getByTestId('detail-time')).toHaveText('19:00–19:30');

    await other.getByTestId('cancel').click();
    await other.getByTestId('cancel-submit').click();
    await expect(other.getByText('Запись отменена')).toBeVisible();
    await other.close();

    await page.reload();
    await expect(page.getByText('Отменена').first()).toBeVisible();
  });

  test('a wrong link shows "not found", not someone else\'s booking', async ({ page }) => {
    await page.goto(`/a/${'A'.repeat(43)}`);
    await expect(page.getByText('Страница не найдена')).toBeVisible();
  });
});
