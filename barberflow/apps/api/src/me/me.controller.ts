import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { ErrorCodes, updateProfileSchema } from '@barberflow/shared';
import { Authenticated, CurrentAuth, ReqIp } from '../common/decorators';
import type { AuthContext } from '../common/request-context';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthService } from '../auth/auth.service';
import { sha256 } from '../auth/crypto';

class ProfileDto extends createZodDto(updateProfileSchema) {}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/** Staff account (barbers, owners, admins) and team invitations. Clients have no accounts. */
@ApiTags('account')
@Controller()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Patch('me')
  @Authenticated()
  async update(@CurrentAuth() auth: AuthContext, @Body() body: ProfileDto) {
    const user = await this.prisma.user.update({ where: { id: auth.user.id }, data: body });
    return this.auth.me(user);
  }

  /** Data portability for the account holder. */
  @Get('me/export')
  @Authenticated()
  async export(@CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      include: { memberships: { include: { business: { select: { name: true } } } }, barberProfiles: { select: { name: true, slug: true } } },
    });
    await this.audit.log({ actorUserId: auth.user.id, action: 'privacy.export', entityType: 'user', entityId: auth.user.id, ip });
    return {
      exportedAt: new Date().toISOString(),
      user: { id: user.id, phone: user.phone, name: user.name, locale: user.locale, createdAt: user.createdAt },
      memberships: user.memberships.map((m) => ({ business: m.business.name, role: m.role, status: m.status })),
      barberProfiles: user.barberProfiles,
    };
  }

  /** Right to erasure: wipes PII, revokes sessions and staff access. Owners must hand over first. */
  @Delete('me')
  @Authenticated()
  async deleteAccount(@CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const owner = await this.prisma.businessMember.count({ where: { userId: auth.user.id, role: 'OWNER', status: 'ACTIVE' } });
    if (owner > 0) throw new AppError(409, ErrorCodes.INVALID_STATE, 'Transfer or close your business before deleting the account');
    await this.prisma.$transaction(async (tx) => {
      await tx.businessMember.updateMany({ where: { userId: auth.user.id }, data: { status: 'DISABLED' } });
      await tx.barber.updateMany({ where: { userId: auth.user.id }, data: { userId: null } });
      await tx.session.updateMany({ where: { userId: auth.user.id }, data: { revokedAt: new Date() } });
      await tx.user.update({ where: { id: auth.user.id }, data: { phone: null, name: null, passwordHash: null, deletedAt: new Date() } });
      await this.audit.log({ actorUserId: auth.user.id, action: 'privacy.delete_account', entityType: 'user', entityId: auth.user.id, ip }, tx);
    });
    return { ok: true };
  }

  // ---------------- Invitations (secret link /invite/<token>) ----------------

  private async invitation(token: string) {
    if (!TOKEN_RE.test(token)) throw notFound('Invitation');
    const inv = await this.prisma.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { business: { select: { name: true, status: true } } } });
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date() || inv.business.status === 'BLOCKED') throw notFound('Invitation');
    return inv;
  }

  /** Public preview so the invitee sees which business invites them before signing in. */
  @Get('invitations/:token')
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  async preview(@Param('token') token: string) {
    const inv = await this.invitation(token);
    return { businessName: inv.business.name, role: inv.role, expiresAt: inv.expiresAt };
  }

  @Post('invitations/:token/accept')
  @HttpCode(200)
  @Authenticated()
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async accept(@CurrentAuth() auth: AuthContext, @Param('token') token: string, @ReqIp() ip: string | null) {
    const inv = await this.invitation(token);
    await this.prisma.$transaction(async (tx) => {
      // Single use: a parallel accept of the same link cannot succeed twice.
      const used = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (!used.count) throw notFound('Invitation');
      await tx.businessMember.upsert({
        where: { businessId_userId: { businessId: inv.businessId, userId: auth.user.id } },
        update: { role: inv.role, status: 'ACTIVE' },
        create: { businessId: inv.businessId, userId: auth.user.id, role: inv.role },
      });
      if (inv.barberId) {
        await tx.barber.updateMany({ where: { id: inv.barberId, businessId: inv.businessId, userId: null }, data: { userId: auth.user.id } });
      }
      await this.audit.log({ actorUserId: auth.user.id, businessId: inv.businessId, action: 'member.invitation.accept', entityType: 'invitation', entityId: inv.id, ip }, tx);
    });
    return this.auth.me(auth.user);
  }
}
