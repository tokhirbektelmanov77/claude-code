import { execSync } from 'node:child_process';

export default function resetDemo() {
  execSync('pnpm db:seed', { stdio: 'pipe', cwd: process.cwd() });
}
