// Loaded before every test file: point the app at the disposable test database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://barberflow:barberflow@localhost:5432/barberflow_test?schema=public';
process.env.OTP_DEV_MODE = 'true';
process.env.SMS_PROVIDER = 'none';
process.env.OTP_SECRET = 'test-otp-secret-0123456789';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.TELEGRAM_BOT_TOKEN = '123456:TEST-TOKEN';
process.env.TELEGRAM_BOT_USERNAME = 'barberflow_test_bot';
process.env.PLATFORM_ADMIN_PHONES = '';
