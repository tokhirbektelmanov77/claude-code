import { Body, Controller, Delete, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import {
  barberSchema, barberUpdateSchema, branchSchema, ErrorCodes, serviceSchema, serviceUpdateSchema,
} from '@barberflow/shared';
import { BusinessRoles, CurrentAuth, Membership, ReqIp } from '../common/decorators';
import type { AuthContext, MembershipContext } from '../common/request-context';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { BusinessService } from './business.service';
import { uniqueSlug } from './slugs';
import { isManager } from './access';

class BarberDto extends createZodDto(barberSchema) {}
class BarberUpdateDto extends createZodDto(barberUpdateSchema) {}
class ServiceDto extends createZodDto(serviceSchema) {}
class ServiceUpdateDto extends createZodDto(serviceUpdateSchema) {}
class BranchDto extends createZodDto(branchSchema) {}
class BranchUpdateDto extends createZodDto(branchSchema.partial()) {}

@ApiTags('business-catalog')
@Controller('businesses/:businessId')
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly business: BusinessService,
  ) {}

  // ---------------- Barbers ----------------

  @Get('barbers')
  @BusinessRoles()
  async barbers(@Param('businessId') businessId: string) {
    const list = await this.prisma.barber.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { services: { select: { serviceId: true } }, user: { select: { id: true, phone: true, name: true } } },
    });
    return list.map((b) => ({ ...b, serviceIds: b.services.map((s) => s.serviceId), services: undefined }));
  }

  private async checkBranch(businessId: string, branchId: string | null | undefined) {
    if (!branchId) return;
    const ok = await this.prisma.branch.count({ where: { id: branchId, businessId } });
    if (!ok) throw notFound('Branch');
  }

  private async checkServices(businessId: string, ids: string[] | undefined) {
    if (!ids?.length) return;
    const n = await this.prisma.service.count({ where: { id: { in: ids }, businessId } });
    if (n !== new Set(ids).size) throw notFound('Service');
  }

  private async checkBarberSlug(slug: string, exceptId?: string) {
    const taken = await this.prisma.barber.findFirst({ where: { slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
    if (taken) throw new AppError(HttpStatus.CONFLICT, ErrorCodes.SLUG_TAKEN, 'Slug taken');
  }

  @Post('barbers')
  @BusinessRoles('OWNER', 'MANAGER')
  async createBarber(
    @Param('businessId') businessId: string, @Body() body: BarberDto, @CurrentAuth() auth: AuthContext,
    @ReqIp() ip: string | null,
  ) {
    await this.checkBranch(businessId, body.branchId);
    await this.checkServices(businessId, body.serviceIds);
    if (body.slug) await this.checkBarberSlug(body.slug);
    const slug = body.slug ?? (await uniqueSlug(body.name, async (s) => (await this.prisma.barber.count({ where: { slug: s } })) > 0));
    return this.prisma.$transaction(async (tx) => {
      if (body.isActive !== false) await this.business.assertSeatAvailable(businessId, tx);
      const barber = await tx.barber.create({
        data: {
          businessId, slug, name: body.name, specialization: body.specialization, bio: body.bio, photoUrl: body.photoUrl,
          branchId: body.branchId ?? null, isActive: body.isActive ?? true,
          services: body.serviceIds?.length ? { create: body.serviceIds.map((serviceId) => ({ serviceId })) } : undefined,
        },
      });
      await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'barber.create', entityType: 'barber', entityId: barber.id, ip }, tx);
      return barber;
    });
  }

  /** Links the barber profile to the signed-in owner (solo barbers work in their own shop). */
  @Post('barbers/:barberId/link-me')
  @BusinessRoles('OWNER', 'MANAGER')
  async linkMe(@Param('businessId') businessId: string, @Param('barberId', ParseUUIDPipe) barberId: string, @CurrentAuth() auth: AuthContext) {
    const b = await this.prisma.barber.findFirst({ where: { id: barberId, businessId } });
    if (!b) throw notFound('Barber');
    const other = await this.prisma.barber.findFirst({ where: { businessId, userId: auth.user.id, NOT: { id: barberId } } });
    if (other) throw new AppError(HttpStatus.CONFLICT, ErrorCodes.INVALID_STATE, 'You already have a barber profile here');
    return this.prisma.barber.update({ where: { id: barberId }, data: { userId: auth.user.id } });
  }

  @Patch('barbers/:barberId')
  @BusinessRoles()
  async updateBarber(
    @Param('businessId') businessId: string, @Param('barberId', ParseUUIDPipe) barberId: string,
    @Body() body: BarberUpdateDto, @Membership() m: MembershipContext, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null,
  ) {
    const existing = await this.prisma.barber.findFirst({ where: { id: barberId, businessId } });
    if (!existing) throw notFound('Barber');
    // Barbers may edit their own public profile text, nothing else.
    if (!isManager(m)) {
      if (m.barberId !== barberId) throw new AppError(403, ErrorCodes.FORBIDDEN, 'Forbidden');
      body = { name: body.name, specialization: body.specialization, bio: body.bio, photoUrl: body.photoUrl };
    }
    await this.checkBranch(businessId, body.branchId);
    await this.checkServices(businessId, body.serviceIds);
    if (body.slug) await this.checkBarberSlug(body.slug, barberId);
    return this.prisma.$transaction(async (tx) => {
      if (body.isActive === true && !existing.isActive) await this.business.assertSeatAvailable(businessId, tx);
      const { serviceIds, ...rest } = body;
      const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      const barber = await tx.barber.update({ where: { id: barberId }, data: clean });
      if (serviceIds) {
        await tx.barberService.deleteMany({ where: { barberId, serviceId: { notIn: serviceIds } } });
        await tx.barberService.createMany({ data: serviceIds.map((serviceId) => ({ barberId, serviceId })), skipDuplicates: true });
      }
      await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'barber.update', entityType: 'barber', entityId: barberId, data: Object.keys(body), ip }, tx);
      return barber;
    });
  }

  // ---------------- Services ----------------

  @Get('services')
  @BusinessRoles()
  async services(@Param('businessId') businessId: string) {
    const list = await this.prisma.service.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { barbers: { select: { barberId: true } } },
    });
    return list.map((s) => ({ ...s, barberIds: s.barbers.map((b) => b.barberId), barbers: undefined }));
  }

  private async checkBarbers(businessId: string, ids: string[] | undefined) {
    if (!ids?.length) return;
    const n = await this.prisma.barber.count({ where: { id: { in: ids }, businessId } });
    if (n !== new Set(ids).size) throw notFound('Barber');
  }

  @Post('services')
  @BusinessRoles('OWNER', 'MANAGER')
  async createService(@Param('businessId') businessId: string, @Body() body: ServiceDto, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    await this.checkBarbers(businessId, body.barberIds);
    const { barberIds, ...data } = body;
    // New services are offered by all barbers unless specified otherwise.
    const targets = barberIds ?? (await this.prisma.barber.findMany({ where: { businessId }, select: { id: true } })).map((b) => b.id);
    const service = await this.prisma.service.create({
      data: { ...data, businessId, barbers: targets.length ? { create: targets.map((barberId) => ({ barberId })) } : undefined },
    });
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'service.create', entityType: 'service', entityId: service.id, data: { priceUzs: service.priceUzs, durationMin: service.durationMin }, ip });
    return service;
  }

  /** Price/duration edits never touch existing appointments: they keep their booked snapshot. */
  @Patch('services/:serviceId')
  @BusinessRoles('OWNER', 'MANAGER')
  async updateService(
    @Param('businessId') businessId: string, @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() body: ServiceUpdateDto, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null,
  ) {
    const existing = await this.prisma.service.findFirst({ where: { id: serviceId, businessId } });
    if (!existing) throw notFound('Service');
    await this.checkBarbers(businessId, body.barberIds);
    const { barberIds, ...rest } = body;
    const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    const service = await this.prisma.$transaction(async (tx) => {
      const s = await tx.service.update({ where: { id: serviceId }, data: clean });
      if (barberIds) {
        await tx.barberService.deleteMany({ where: { serviceId, barberId: { notIn: barberIds } } });
        await tx.barberService.createMany({ data: barberIds.map((barberId) => ({ barberId, serviceId })), skipDuplicates: true });
      }
      return s;
    });
    await this.audit.log({
      actorUserId: auth.user.id, businessId, action: 'service.update', entityType: 'service', entityId: serviceId,
      data: { before: { priceUzs: existing.priceUzs, durationMin: existing.durationMin }, after: { priceUzs: service.priceUzs, durationMin: service.durationMin } }, ip,
    });
    return service;
  }

  /** Soft delete: hides the service; history keeps referencing it. */
  @Delete('services/:serviceId')
  @BusinessRoles('OWNER', 'MANAGER')
  async deleteService(@Param('businessId') businessId: string, @Param('serviceId', ParseUUIDPipe) serviceId: string, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const res = await this.prisma.service.updateMany({ where: { id: serviceId, businessId }, data: { isActive: false } });
    if (!res.count) throw notFound('Service');
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'service.archive', entityType: 'service', entityId: serviceId, ip });
    return { ok: true };
  }

  // ---------------- Branches ----------------

  @Get('branches')
  @BusinessRoles()
  branches(@Param('businessId') businessId: string) {
    return this.prisma.branch.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
  }

  @Post('branches')
  @BusinessRoles('OWNER', 'MANAGER')
  async createBranch(@Param('businessId') businessId: string, @Body() body: BranchDto, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const branch = await this.prisma.branch.create({ data: { ...body, businessId } });
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'branch.create', entityType: 'branch', entityId: branch.id, ip });
    return branch;
  }

  @Patch('branches/:branchId')
  @BusinessRoles('OWNER', 'MANAGER')
  async updateBranch(
    @Param('businessId') businessId: string, @Param('branchId', ParseUUIDPipe) branchId: string, @Body() body: BranchUpdateDto,
    @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null,
  ) {
    const res = await this.prisma.branch.updateMany({ where: { id: branchId, businessId }, data: body });
    if (!res.count) throw notFound('Branch');
    await this.audit.log({ actorUserId: auth.user.id, businessId, action: 'branch.update', entityType: 'branch', entityId: branchId, ip });
    return this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
  }
}
