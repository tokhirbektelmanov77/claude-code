/**
 * Creates or promotes a PLATFORM_ADMIN. The only way to get this role: phones are not verified,
 * so it is never granted by sign-up or by an environment phone list.
 *
 *   pnpm admin:create --phone "+998 90 123 45 67" --name "Ваше имя"
 *
 * Prints a one-time temporary password; it must be changed at first sign-in.
 */
import { PrismaClient } from '@prisma/client';
import { normalizeUzPhone } from '@barberflow/shared';
import { hashPassword, temporaryPassword } from '../src/password';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const phone = normalizeUzPhone(arg('phone') ?? '');
  if (!phone) throw new Error('Usage: pnpm admin:create --phone "+998 90 123 45 67" [--name "Name"]');
  const prisma = new PrismaClient();
  try {
    const temp = temporaryPassword();
    const passwordHash = await hashPassword(temp);
    const user = await prisma.user.upsert({
      where: { phone },
      update: { platformRole: 'PLATFORM_ADMIN', passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, deletedAt: null },
      create: { phone, name: arg('name') ?? null, platformRole: 'PLATFORM_ADMIN', passwordHash, mustChangePassword: true, privacyAcceptedAt: new Date() },
    });
    await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { actorUserId: null, action: 'admin.cli.create', entityType: 'user', entityId: user.id } });
    console.log(`PLATFORM_ADMIN ready: ${phone}`);
    console.log(`Temporary password (shown once, change it at first sign-in): ${temp}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
