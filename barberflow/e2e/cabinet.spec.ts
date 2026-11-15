import { expect, test } from '@playwright/test';
import { freshPhone, login, PHONES } from './helpers';

test.describe('barber & owner cabinets (desktop)', () => {
  test('owner dashboard shows real numbers and the price-value disclaimer', async ({ page }) => {
    await login(page, PHONES.owner, '/app');
    await page.waitForURL('**/app/dashboard');
    await expect(page.getByTestId('dashboard-stats')).toBeVisible();
    await expect(page.getByText('Это не выручка')).toBeVisible();
  });

  test('manual booking, reschedule and cancel from the calendar', async ({ page }) => {
    await login(page, PHONES.owner, '/app/calendar');
    await page.goto('/app/calendar');
    await page.getByRole('button', { name: 'Новая запись' }).first().click();
    await page.getByTestId('manual-date').fill('2026-11-18');
    await page.getByTestId('slot-12:00').click();
    await page.getByRole('tab', { name: 'Новый клиент' }).click();
    await page.getByTestId('manual-name').fill('Гость E2E');
    await page.getByTestId('manual-save').click();
    await expect(page.getByTestId('manual-save')).toBeHidden();

    // Navigate to 18 Nov and open the appointment.
    // The calendar opens on today (the seed runs relative to now); step forward to 18 Nov.
    for (let i = 0; i < 31 && !(await page.getByTestId('calendar-title').textContent())?.includes('18 ноября'); i++) {
      await page.getByRole('button', { name: 'Вперёд' }).click();
    }
    await expect(page.getByTestId('calendar-title')).toContainText('18 ноября');
    await page.getByTestId('calendar-appointment').filter({ hasText: 'Гость E2E' }).click();
    await expect(page.getByTestId('appointment-sheet')).toContainText('Вручную');

    await page.getByTestId('staff-reschedule').click();
    await page.getByTestId('slot-14:00').click(); // 13:00–14:00 is Aziz's lunch break
    await page.getByTestId('reschedule-submit').click();
    // After moving, the appointment card re-opens with the updated time and history.
    await expect(page.getByTestId('appointment-sheet')).toContainText('Перенесена');
    await expect(page.getByTestId('appointment-sheet')).toContainText('14:00–14:45');
    await expect(page.getByTestId('calendar-appointment').filter({ hasText: '14:00 Гость E2E' })).toHaveCount(1);

    await page.getByTestId('staff-cancel').click();
    await page.getByTestId('cancel-submit').click();
    await expect(page.getByTestId('calendar-appointment').filter({ hasText: 'Гость E2E' })).toHaveCount(0);
  });

  test('owner creates a service with a price stored in the database', async ({ page }) => {
    await login(page, PHONES.owner, '/app/services');
    await page.goto('/app/services');
    await page.getByTestId('add-service').click();
    await page.getByTestId('service-name').fill('Камуфляж седины E2E');
    await page.getByTestId('service-price').fill('80000');
    await page.getByTestId('service-duration').fill('40');
    await page.getByTestId('save-service').click();
    await expect(page.getByTestId('service-row').filter({ hasText: 'Камуфляж седины E2E' })).toContainText('80 000 сум');
    const pub = await (await page.request.get('/api/public/businesses/barberflow-demo')).json();
    expect(pub.services.some((s: { name: string; priceUzs: number }) => s.name === 'Камуфляж седины E2E' && s.priceUzs === 80000)).toBe(true);
  });

  test('barber sees only own workspace sections and cannot open admin', async ({ page }) => {
    await login(page, PHONES.aziz, '/app');
    await page.waitForURL('**/app/today');
    await expect(page.getByRole('link', { name: 'Сотрудники' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Подписка' })).toHaveCount(0);
    expect((await page.request.get('/api/platform-admin/overview')).status()).toBe(403);
    await page.goto('/platform-admin');
    await expect(page.getByText('Раздел доступен только администраторам платформы.')).toBeVisible();
  });

  test('owner invites a barber by secret link; the barber signs up there and joins the team', async ({ page, browser }) => {
    await login(page, PHONES.owner, '/app/staff');
    await page.goto('/app/staff');
    await page.getByRole('button', { name: 'Пригласить' }).click();
    await page.getByTestId('create-invite').click();
    const link = (await page.getByTestId('invite-link').locator('span.font-mono').textContent())!;
    expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);

    const barber = await browser.newPage();
    await barber.goto(link);
    await expect(barber.getByTestId('invite-text')).toContainText('BARBERFLOW DEMO');
    await barber.getByTestId('auth-name').fill('Новый барбер');
    await barber.getByTestId('auth-phone').fill(freshPhone());
    await barber.getByTestId('auth-password').fill('barber-password-1');
    await barber.getByTestId('auth-submit').click();
    await barber.getByTestId('accept-invite').click();
    await barber.waitForURL('**/app/**');
    await barber.close();

    await page.reload();
    await expect(page.getByText('Новый барбер')).toBeVisible();
  });

  test('forgotten password: owner issues a temporary one, the barber must change it', async ({ page, browser }) => {
    await login(page, PHONES.owner, '/app/staff');
    await page.goto('/app/staff');
    await page.getByTestId('reset-password').first().click();
    const temp = (await page.getByTestId('temp-password').textContent())!.trim();
    expect(temp).toMatch(/^\w{4}-\w{4}-\w{4}$/);

    const barber = await browser.newPage();
    await login(barber, PHONES.aziz, '/app', temp);
    await barber.waitForURL('**/account?change=1');
    await barber.getByTestId('current-password').fill(temp);
    await barber.getByTestId('new-password').fill('barberflow-demo');
    await barber.getByTestId('save-password').click();
    await barber.waitForURL('**/app/**');
    await barber.close();
  });

  test('working hours editor saves 24h schedule', async ({ page }) => {
    await login(page, PHONES.aziz, '/app/schedule');
    await page.goto('/app/schedule');
    await expect(page.locator('select[aria-label="с"]').first()).toHaveValue('10:00');
    await page.getByTestId('save-hours').click();
    await expect(page.getByTestId('save-hours')).toHaveText('Сохранено');
  });
});
