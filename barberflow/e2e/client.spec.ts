import { expect, test } from '@playwright/test';
import { freshPhone, loginOtp } from './helpers';

test.describe('client booking (mobile)', () => {
  test('demo scenario: Азиз · Мужская стрижка · 17.11.2026 16:00–16:45 · 100 000 сум', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('cta-demo').click();
    await expect(page.getByTestId('step-title')).toHaveText('Выберите услугу');
    await page.getByText('Мужская стрижка').first().click();
    await page.getByTestId('day-2026-11-17').click();
    await page.getByTestId('slot-16:00').click();
    await page.getByTestId('time-continue').click();
    await expect(page.getByTestId('summary-when')).toHaveText('17 ноября 2026, 16:00–16:45');
    await expect(page.getByTestId('summary-price')).toHaveText('100 000 сум');

    await loginOtp(page, freshPhone());
    await page.getByTestId('customer-name').fill('Клиент E2E');
    await page.getByTestId('consent').check();
    await page.getByTestId('confirm-booking').click();

    await expect(page.getByTestId('success-title')).toHaveText('Вы успешно записались!');
    await expect(page.getByTestId('detail-date')).toHaveText('17 ноября 2026');
    await expect(page.getByTestId('detail-time')).toHaveText('16:00–16:45');
    await expect(page.getByTestId('detail-price')).toHaveText('100 000 сум');

    // The slot is gone for everyone else.
    await page.goto('/b/aziz');
    await page.getByText('Мужская стрижка').first().click();
    await page.getByTestId('day-2026-11-17').click();
    // 15:15–16:00 still fits; 15:30/15:45/16:00/16:15/16:30 overlap the new 16:00–16:45 booking.
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
    await loginOtp(page, freshPhone());
    await page.getByTestId('customer-name').fill('Опоздавший');
    await page.getByTestId('consent').check();

    // Another client grabs 18:00 through the API in the meantime.
    const other = freshPhone().replace(/.$/, '7');
    const r = await request.post('/api/auth/otp/request', { data: { phone: other } });
    const { devCode } = await r.json();
    await request.post('/api/auth/otp/verify', { data: { phone: other, code: devCode } });
    const biz = await (await request.get('/api/public/businesses/barberflow-demo')).json();
    const aziz = biz.barbers.find((b: { slug: string }) => b.slug === 'aziz');
    const haircut = biz.services.find((s: { name: string }) => s.name === 'Мужская стрижка');
    const booked = await request.post('/api/bookings', {
      data: { barberId: aziz.id, serviceId: haircut.id, startsAt: '2026-11-17T13:00:00.000Z', customerName: 'Быстрый', consent: true },
    });
    expect(booked.status()).toBe(201);

    await page.getByTestId('confirm-booking').click();
    await expect(page.getByText('Это время только что заняли')).toBeVisible();
    await page.getByTestId('choose-another').click();
    await expect(page.getByTestId('slot-18:00')).toHaveCount(0);
  });

  test('client reschedules and cancels from "Мои записи"', async ({ page }) => {
    await page.goto('/b/aziz');
    await page.getByText('Оформление бороды').click();
    await page.getByTestId('day-2026-11-17').click();
    await page.getByTestId('slot-17:00').click();
    await page.getByTestId('time-continue').click();
    await loginOtp(page, freshPhone());
    await page.getByTestId('customer-name').fill('Переносящий');
    await page.getByTestId('consent').check();
    await page.getByTestId('confirm-booking').click();
    await expect(page.getByTestId('success-title')).toBeVisible();

    await page.getByTestId('reschedule').click();
    await page.getByTestId('day-2026-11-17').click();
    await page.getByTestId('slot-19:00').click();
    await page.getByTestId('reschedule-submit').click();
    await expect(page.getByText('Запись перенесена')).toBeVisible();
    await expect(page.getByTestId('detail-time')).toHaveText('19:00–19:30');

    await page.getByTestId('cancel').click();
    await page.getByTestId('cancel-submit').click();
    await expect(page.getByText('Запись отменена')).toBeVisible();
    await expect(page.getByText('Отменена').first()).toBeVisible();
  });
});
