import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MemberRole } from '@barberflow/db';
import { forbidden, notFound, unauthorized } from './errors';
import { PrismaService } from './prisma.service';
import type { AppRequest } from './request-context';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.auth) throw unauthorized();
    return true;
  }
}

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (req.auth?.user.platformRole !== 'PLATFORM_ADMIN') throw forbidden('Platform admin only');
    return true;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class BusinessAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const businessId = req.params.businessId;
    if (typeof businessId !== 'string' || !UUID_RE.test(businessId)) throw notFound('Business');
    const roles = this.reflector.get<MemberRole[]>('bf:roles', ctx.getHandler()) ??
      this.reflector.get<MemberRole[]>('bf:roles', ctx.getClass()) ?? [];

    const member = await this.prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId, userId: req.auth!.user.id } },
    });
    // Same response whether the business exists or not: no tenant enumeration.
    if (!member || member.status !== 'ACTIVE') throw forbidden('No access to this business');
    if (roles.length > 0 && !roles.includes(member.role)) throw forbidden('Insufficient role');

    const barber = await this.prisma.barber.findFirst({
      where: { businessId, userId: req.auth!.user.id },
      select: { id: true },
    });
    req.membership = { businessId, role: member.role, barberId: barber?.id ?? null };
    return true;
  }
}
