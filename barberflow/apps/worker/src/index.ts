import { hostname } from 'node:os';
import { createPrismaClient } from '@barberflow/db';
import { expireSubscriptions, runOnce } from './jobs';
import { TelegramBot } from './telegram';
import { BotUpdates } from './bot-updates';

const log = (m: string) => console.log(`[worker ${new Date().toISOString()}] ${m}`);

async function main() {
  const prisma = createPrismaClient();
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const pollMs = Number(process.env.WORKER_POLL_MS || 5000);
  const bot = token ? new TelegramBot(token) : null;
  const deps = { prisma, telegram: bot, workerId: `${hostname()}:${process.pid}`, appUrl, log };
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  log(bot ? 'Telegram bot configured' : 'TELEGRAM_BOT_TOKEN not set: notification jobs will be marked SKIPPED (TELEGRAM_NOT_CONFIGURED), never SENT');

  if (bot) {
    const updates = new BotUpdates(bot, prisma, appUrl);
    (async () => {
      while (!stopping) {
        await updates.pollOnce().catch(async (e) => { log(`getUpdates: ${e.message}`); await new Promise((r) => setTimeout(r, 5000)); });
      }
    })();
  }

  let lastHousekeeping = 0;
  while (!stopping) {
    try {
      const n = await runOnce(deps);
      if (n) log(`processed ${n} job(s)`);
      if (Date.now() - lastHousekeeping > 10 * 60_000) {
        lastHousekeeping = Date.now();
        const r = await expireSubscriptions(prisma);
        if (r.trials || r.pastDue || r.expired) log(`subscriptions: ${JSON.stringify(r)}`);
      }
    } catch (e) {
      log(`loop error: ${(e as Error).message}`);
      await prisma.errorLog.create({ data: { source: 'worker', message: (e as Error).message.slice(0, 2000), stack: (e as Error).stack?.slice(0, 8000) } }).catch(() => undefined);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  await prisma.$disconnect();
  log('stopped');
}

main();
