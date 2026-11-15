import { HttpStatus, Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword, type User } from '@barberflow/db';
import { ErrorCodes, MeDto } from '@barberflow/shared';
import { AppError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;

/**
 * Staff authentication: phone + password. Clients never sign in (they book as guests).
 * Phones are not verified in this product version (no SMS/Telegram), so a phone number grants
 * nothing by itself: platform admin is assigned only via CLI/seed, staff join businesses only via
 * secret invitation links.
 */
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async register(input: { name: string; phone: string; password: string }, ip: string | null): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { phone: input.phone } });
    if (existing) throw new AppError(HttpStatus.CONFLICT, ErrorCodes.PHONE_TAKEN, 'Account already exists');
    const user = await this.prisma.user.create({
      data: { phone: input.phone, name: input.name, passwordHash: await hashPassword(input.password), privacyAcceptedAt: new Date() },
    });
    await this.audit.log({ actorUserId: user.id, action: 'auth.register', entityType: 'user', entityId: user.id, ip });
    return user;
  }

  async login(phone: string, password: string, ip: string | null): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.ACCOUNT_LOCKED, 'Account temporarily locked');
    }
    const ok = await verifyPassword(password, user?.passwordHash);
    if (!user || !ok || user.deletedAt) {
      if (user && !user.deletedAt) {
        const failed = user.failedLoginCount + 1;
        await this.prisma.user.update({
          where: { id: user.id },
          data: failed >= MAX_FAILED ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLoginCount: failed },
        });
        if (failed >= MAX_FAILED) await this.audit.log({ actorUserId: user.id, action: 'auth.locked', entityType: 'user', entityId: user.id, ip });
      }
      // Same answer for unknown phone and wrong password.
      throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.INVALID_CREDENTIALS, 'Invalid phone or password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    await this.audit.log({ actorUserId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ip });
    return user;
  }

  async changePassword(user: User, currentPassword: string, newPassword: string, currentSessionId: string, ip: string | null) {
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.INVALID_CREDENTIALS, 'Wrong current password');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false } }),
      // Sign out every other device.
      this.prisma.session.updateMany({ where: { userId: user.id, revokedAt: null, NOT: { id: currentSessionId } }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorUserId: user.id, action: 'auth.password.change', entityType: 'user', entityId: user.id, ip });
  }

  async me(user: User): Promise<MeDto> {
    const memberships = await this.prisma.businessMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { business: { select: { id: true, name: true, slug: true, onboardingStep: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const barbers = await this.prisma.barber.findMany({ where: { userId: user.id }, select: { id: true, businessId: true } });
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      locale: user.locale === 'uz' ? 'uz' : 'ru',
      isPlatformAdmin: user.platformRole === 'PLATFORM_ADMIN',
      mustChangePassword: user.mustChangePassword,
      memberships: memberships.map((m) => ({
        businessId: m.businessId,
        businessName: m.business.name,
        businessSlug: m.business.slug,
        role: m.role,
        onboardingStep: m.business.onboardingStep,
        barberId: barbers.find((b) => b.businessId === m.businessId)?.id ?? null,
      })),
    };
  }
}
