import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { blockBusinessSchema, changePlanSchema, planUpdateSchema, recordPaymentSchema } from '@barberflow/shared';
import { CurrentAuth, PlatformAdminOnly, ReqIp } from '../common/decorators';
import type { AuthContext } from '../common/request-context';
import { notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { SubscriptionBillingService } from '../subscriptions/billing.service';

class BlockDto extends createZodDto(blockBusinessSchema) {}
class PlanUpdateDto extends createZodDto(planUpdateSchema) {}
class RecordPaymentDto extends createZodDto(recordPaymentSchema) {}
class ChangePlanDto extends createZodDto(changePlanSchema) {}
class RejectDto extends createZodDto(z.object({ note: z.string().trim().max(300).optional() })) {}
class ListQuery extends createZodDto(z.object({ q: z.string().trim().max(60).optional() })) {}

/** Everything here requires PLATFORM_ADMIN, checked server-side on every request. */
@ApiTags('platform-admin')
@Controller('platform-admin')
@PlatformAdminOnly()
export class PlatformAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: SubscriptionBillingService,
  ) {}

  @Get('overview')
  async overview() {
    const [businesses, blocked, byStatus, appointments, users, errors24h, failedJobs] = await Promise.all([
      this.prisma.business.count(),
      this.prisma.business.count({ where: { status: 'BLOCKED' } }),
      this.prisma.subscription.groupBy({ by: ['status'], _count: true }),
      this.prisma.appointment.count(),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.errorLog.count({ where: { createdAt: { gt: new Date(Date.now() - 86400_000) } } }),
      this.prisma.notificationJob.count({ where: { status: 'FAILED' } }),
    ]);
    const subs = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
    return { businesses, blocked, subscriptions: subs, appointments, users, errors24h, failedJobs };
  }

  @Get('businesses')
  async businesses(@Query() q: ListQuery) {
    const list = await this.prisma.business.findMany({
      where: q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q.toLowerCase() } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        subscription: { include: { plan: { select: { code: true, name: true } } } },
        members: { where: { role: 'OWNER' }, include: { user: { select: { phone: true, name: true } } }, take: 1 },
        _count: { select: { barbers: true, appointments: true } },
      },
    });
    return list.map((b) => ({
      id: b.id, name: b.name, slug: b.slug, city: b.city, status: b.status, blockedReason: b.blockedReason, isDemo: b.isDemo,
      createdAt: b.createdAt, onboardingStep: b.onboardingStep,
      barbers: b._count.barbers, appointments: b._count.appointments,
      owner: b.members[0]?.user ?? null,
      subscription: b.subscription && {
        status: b.subscription.status, plan: b.subscription.plan, seats: b.subscription.seats,
        trialEndsAt: b.subscription.trialEndsAt, currentPeriodEnd: b.subscription.currentPeriodEnd,
      },
    }));
  }

  @Post('businesses/:id/block')
  @HttpCode(200)
  async block(@Param('id', ParseUUIDPipe) id: string, @Body() body: BlockDto, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const res = await this.prisma.business.updateMany({ where: { id }, data: { status: 'BLOCKED', blockedReason: body.reason } });
    if (!res.count) throw notFound('Business');
    await this.audit.log({ actorUserId: auth.user.id, businessId: id, action: 'admin.business.block', entityType: 'business', entityId: id, data: { reason: body.reason }, ip });
    return { ok: true };
  }

  @Post('businesses/:id/unblock')
  @HttpCode(200)
  async unblock(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const res = await this.prisma.business.updateMany({ where: { id }, data: { status: 'ACTIVE', blockedReason: null } });
    if (!res.count) throw notFound('Business');
    await this.audit.log({ actorUserId: auth.user.id, businessId: id, action: 'admin.business.unblock', entityType: 'business', entityId: id, ip });
    return { ok: true };
  }

  @Post('businesses/:id/plan')
  @HttpCode(200)
  changePlan(@Param('id', ParseUUIDPipe) id: string, @Body() body: ChangePlanDto, @CurrentAuth() auth: AuthContext) {
    return this.billing.changePlan(id, body.planId, body.seats, auth.user.id);
  }

  @Get('plans')
  plans() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { subscriptions: true } } } });
  }

  @Patch('plans/:id')
  async updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() body: PlanUpdateDto, @CurrentAuth() auth: AuthContext, @ReqIp() ip: string | null) {
    const before = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!before) throw notFound('Plan');
    const plan = await this.prisma.subscriptionPlan.update({ where: { id }, data: body });
    await this.audit.log({
      actorUserId: auth.user.id, action: 'admin.plan.update', entityType: 'plan', entityId: id,
      data: { before: { priceUzs: before.priceUzs, minSeats: before.minSeats }, after: { priceUzs: plan.priceUzs, minSeats: plan.minSeats } }, ip,
    });
    return plan;
  }

  @Get('payments')
  async payments() {
    return this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { business: { select: { id: true, name: true, slug: true } } },
    });
  }

  @Post('businesses/:id/payments')
  async recordPayment(@Param('id', ParseUUIDPipe) id: string, @Body() body: RecordPaymentDto, @CurrentAuth() auth: AuthContext) {
    if (body.planId) await this.billing.changePlan(id, body.planId, body.seats, auth.user.id);
    return this.billing.recordPayment(id, { amountUzs: body.amountUzs, periodMonths: body.periodMonths, method: body.method, reference: body.reference, note: body.note }, auth.user.id);
  }

  @Post('payments/:id/confirm')
  @HttpCode(200)
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.billing.confirmPayment(id, auth.user.id);
  }

  @Post('payments/:id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() body: RejectDto, @CurrentAuth() auth: AuthContext) {
    return this.billing.rejectPayment(id, auth.user.id, body.note);
  }

  @Get('errors')
  errors() {
    return this.prisma.errorLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Get('audit')
  auditLog() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { name: true, phone: true } }, business: { select: { name: true } } },
    });
  }

  @Get('notifications')
  async notifications() {
    const [byStatus, recent] = await Promise.all([
      this.prisma.notificationJob.groupBy({ by: ['status'], _count: true }),
      this.prisma.notificationJob.findMany({
        where: { status: { in: ['FAILED', 'SKIPPED'] } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: { id: true, type: true, status: true, attempts: true, lastError: true, updatedAt: true },
      }),
    ]);
    return { byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])), recent };
  }
}
