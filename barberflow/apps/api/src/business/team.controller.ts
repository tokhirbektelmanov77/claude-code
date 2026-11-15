import { Body, Controller, Delete, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { customerSchema, ErrorCodes, inviteSchema, memberUpdateSchema } from '@barberflow/shared';
import { BusinessRoles, CurrentAuth, Membership, ReqIp } from '../common/decorators';
import type { AuthContext, MembershipContext } from '../common/request-context';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { isManager } from './access';

class InviteDto extends createZodDto(inviteSchema) {}
class MemberUpdateDto extends createZodDto(memberUpdateSchema) {}
class CustomerDto extends createZodDto(customerSchema) {}
class CustomerUpdateDto extends createZodDto(customerSchema.partial()) {}
class SearchQuery extends createZodDto(z.object({ q: z.string().trim().max(60).optional() })) {}

@ApiTags('business-team')
@Controller('businesses/:businessId')
export class TeamController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get('members')
  @BusinessRoles('OWNER', 'MANAGER')
  async members(@Param('businessId') businessId: string) {
    const [members, invitations] = await Promise.all([
      this.prisma.businessMember.findMany({
        where: { businessId },
        include: { user: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.invitation.findMany({
        where: { businessId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { members, invitations };
  }

  @Post('invitations')
  @BusinessRoles('OWNER', 'MANAGER')
  async invite(@Param('businessId') businessId: string, @Body() body: InviteDto, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    if (body.barberId) {
      const b = await this.prisma.barber.findFirst({ where: { id: body.barberId, businessId } });
      if (!b) throw notFound('Barber');
    }
    const inv = await this.prisma.invitation.create({
      data: { businessId, phone: body.phone, role: body.role, barberId: body.barberId ?? null, invitedBy: auth.user.id, expiresAt: new Date(Date.now() + 14 * 86400_000) },
    });
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'member.invite', entityType: 'invitation', entityId: inv.id, data: { role: body.role }, ip });
    return inv;
  }

  @Delete('invitations/:id')
  @BusinessRoles('OWNER', 'MANAGER')
  async revokeInvite(@Param('businessId') businessId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    const res = await this.prisma.invitation.updateMany({ where: { id, businessId, acceptedAt: null }, data: { revokedAt: new Date() } });
    if (!res.count) throw notFound('Invitation');
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'member.invite.revoke', entityType: 'invitation', entityId: id });
    return { ok: true };
  }

  /** Only owners change roles; nobody can demote/disable the last owner. */
  @Patch('members/:memberId')
  @BusinessRoles('OWNER')
  async updateMember(
    @Param('businessId') businessId: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body() body: MemberUpdateDto,
    @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null,
  ) {
    const member = await this.prisma.businessMember.findFirst({ where: { id: memberId, businessId } });
    if (!member) throw notFound('Member');
    const losesOwner = member.role === 'OWNER' && ((body.role && body.role !== 'OWNER') || body.status === 'DISABLED');
    if (losesOwner) {
      const owners = await this.prisma.businessMember.count({ where: { businessId, role: 'OWNER', status: 'ACTIVE' } });
      if (owners <= 1) throw new AppError(HttpStatus.CONFLICT, ErrorCodes.INVALID_STATE, 'A business needs at least one owner');
    }
    const updated = await this.prisma.businessMember.update({ where: { id: memberId }, data: body });
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'member.update', entityType: 'member', entityId: memberId, data: { ...body }, ip });
    return updated;
  }

  // ---------------- Customers ----------------
  // Data minimisation: barbers only see customers they have served or are booked with.

  private customerScope(businessId: string, m: MembershipContext) {
    return {
      businessId,
      anonymizedAt: null,
      ...(isManager(m) ? {} : { appointments: { some: { barberId: m.barberId ?? '00000000-0000-0000-0000-000000000000' } } }),
    };
  }

  @Get('customers')
  @BusinessRoles()
  async customers(@Param('businessId') businessId: string, @Query() q: SearchQuery, @Membership() m: MembershipContext) {
    const term = q.q?.trim();
    const digits = term?.replace(/\D/g, '');
    const list = await this.prisma.customer.findMany({
      where: {
        ...this.customerScope(businessId, m),
        ...(term
          ? { OR: [{ name: { contains: term, mode: 'insensitive' as const } }, ...(digits && digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        appointments: { select: { startsAt: true, status: true }, orderBy: { startsAt: 'desc' } },
      },
    });
    return list.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      notes: c.notes,
      hasAccount: Boolean(c.userId),
      visits: c.appointments.filter((a) => a.status === 'COMPLETED').length,
      lastVisitAt: c.appointments.find((a) => a.status === 'COMPLETED')?.startsAt ?? null,
      nextVisitAt: c.appointments.filter((a) => a.status === 'CONFIRMED' && a.startsAt > new Date()).at(-1)?.startsAt ?? null,
    }));
  }

  @Post('customers')
  @BusinessRoles()
  async createCustomer(@Param('businessId') businessId: string, @Body() body: CustomerDto) {
    if (body.phone) {
      const existing = await this.prisma.customer.findUnique({ where: { businessId_phone: { businessId, phone: body.phone } } });
      if (existing) return existing;
    }
    return this.prisma.customer.create({ data: { businessId, name: body.name, phone: body.phone, notes: body.notes } });
  }

  @Get('customers/:customerId')
  @BusinessRoles()
  async customer(@Param('businessId') businessId: string, @Param('customerId', ParseUUIDPipe) customerId: string, @Membership() m: MembershipContext) {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, ...this.customerScope(businessId, m) },
      include: {
        appointments: {
          orderBy: { startsAt: 'desc' },
          take: 100,
          select: { id: true, startsAt: true, endsAt: true, status: true, serviceName: true, priceUzs: true, barber: { select: { name: true } } },
        },
      },
    });
    if (!c) throw notFound('Customer');
    return c;
  }

  @Patch('customers/:customerId')
  @BusinessRoles()
  async updateCustomer(
    @Param('businessId') businessId: string, @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: CustomerUpdateDto, @Membership() m: MembershipContext,
  ) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, ...this.customerScope(businessId, m) } });
    if (!c) throw notFound('Customer');
    return this.prisma.customer.update({ where: { id: customerId }, data: body });
  }

  @Get('customers/:customerId/export')
  @BusinessRoles('OWNER', 'MANAGER')
  async exportCustomer(@Param('businessId') businessId: string, @Param('customerId', ParseUUIDPipe) customerId: string, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId },
      include: { appointments: { select: { startsAt: true, endsAt: true, status: true, serviceName: true, priceUzs: true, customerNote: true } } },
    });
    if (!c) throw notFound('Customer');
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'customer.export', entityType: 'customer', entityId: customerId, ip });
    return { exportedAt: new Date().toISOString(), customer: { name: c.name, phone: c.phone, notes: c.notes, consentAt: c.consentAt, createdAt: c.createdAt }, appointments: c.appointments };
  }

  /** Erasure on request: wipes PII, keeps anonymised visit history for the business' records. */
  @Delete('customers/:customerId')
  @BusinessRoles('OWNER', 'MANAGER')
  async anonymize(@Param('businessId') businessId: string, @Param('customerId', ParseUUIDPipe) customerId: string, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const res = await this.prisma.customer.updateMany({
      where: { id: customerId, businessId },
      data: { name: '—', phone: null, notes: null, userId: null, anonymizedAt: new Date() },
    });
    if (!res.count) throw notFound('Customer');
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'customer.anonymize', entityType: 'customer', entityId: customerId, ip });
    return { ok: true };
  }
}
