import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the real stack (NestJS API + Next.js + PostgreSQL with demo seed).
 * Start everything with `pnpm dev` (or let webServer start it), then `pnpm test:e2e`.
 * globalSetup/teardown re-run the idempotent demo seed so the demo-day 16:00 slot stays free (see demoDay in packages/shared).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'off',
    locale: 'ru-RU',
    timezoneId: 'Asia/Tashkent',
  },
  projects: [
    // iPhone 13 viewport/UA/touch emulated in Chromium (WebKit is not installed in CI images we use).
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' }, testMatch: /client|mobile|i18n/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testMatch: /cabinet|admin|onboarding/ },
  ],
  webServer: [
    { command: 'RELAX_RATE_LIMITS=true pnpm --filter @barberflow/api dev', url: 'http://localhost:4000/health', reuseExistingServer: true, timeout: 120_000 },
    { command: 'pnpm --filter @barberflow/web dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
  ],
});
