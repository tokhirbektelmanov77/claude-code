import { execSync } from 'node:child_process';
import path from 'node:path';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://barberflow:barberflow@localhost:5432/barberflow_test?schema=public';
  if (!/test/.test(url)) throw new Error('Refusing to run integration tests against a non-test database: ' + url);
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../../../packages/db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
