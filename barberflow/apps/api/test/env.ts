// Loaded before every test file: point the app at the disposable test database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://barberflow:barberflow@localhost:5432/barberflow_test?schema=public';
process.env.WEB_ORIGIN = 'http://localhost:3000';
