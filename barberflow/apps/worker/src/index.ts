import { createPrismaClient } from '@barberflow/db';
import { expireSubscriptions, purgeSessions } from './jobs';

const log = (m: string) => console.log(`[worker ${new Date().toISOString()}] ${m}`);

async function main() {
  const prisma = createPrismaClient();
  const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 10 * 60_000);
  let stopping = false;
  let wake: (() => void) | null = null;
  const stop = () => { stopping = true; wake?.(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  log(`started; housekeeping every ${Math.round(intervalMs / 1000)} s`);

  while (!stopping) {
    try {
      const r = await expireSubscriptions(prisma);
      if (r.trials || r.pastDue || r.expired) log(`subscriptions: ${JSON.stringify(r)}`);
      const purged = await purgeSessions(prisma);
      if (purged) log(`purged ${purged} old session(s)`);
    } catch (e) {
      log(`error: ${(e as Error).message}`);
      await prisma.errorLog.create({ data: { source: 'worker', message: (e as Error).message.slice(0, 2000), stack: (e as Error).stack?.slice(0, 8000) } }).catch(() => undefined);
    }
    await new Promise<void>((resolve) => { wake = resolve; setTimeout(resolve, intervalMs); });
  }
  await prisma.$disconnect();
  log('stopped');
}

main();
